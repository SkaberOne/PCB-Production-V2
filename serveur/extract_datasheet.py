#!/usr/bin/env python3
"""Extraction (SANS LLM) des infos production d'une datasheet PDF composant.

Stratégie (cf ADR 0003) : table EIA-481 d'abord (boîtier -> pitch / largeur de
bande / feeder), parsing PDF en complément/confirmation. Aucune dépendance LLM.

Sortie : un fichier Markdown par composant dans data/datasheets/md/<ref>.md,
en sections lisibles, lié au composant par sa référence.

Usage :
    python extract_datasheet.py <datasheet.pdf> --reference C0805_100NF [--package 0805]
    python extract_datasheet.py <datasheet.pdf> -r C0805_100NF -o ../data/datasheets/md

Le texte PDF est extrait via pdfplumber si disponible, sinon pypdf.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from typing import Optional

# Import absolu depuis le dossier serveur/ (cohérent avec launch.py et les tests)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.services.eia481_rules import lookup_package  # noqa: E402

DEFAULT_OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "datasheets", "md"
)


# --------------------------------------------------------------------------- #
# Extraction texte PDF
# --------------------------------------------------------------------------- #
def extract_pdf_text(pdf_path: str) -> str:
    """Extrait tout le texte d'un PDF. Tente pdfplumber puis pypdf."""
    try:
        import pdfplumber  # type: ignore

        parts = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                parts.append(page.extract_text() or "")
        return "\n".join(parts)
    except ImportError:
        pass

    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(pdf_path)
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except ImportError as exc:  # pragma: no cover - dépend de l'environnement
        raise RuntimeError(
            "Aucun lecteur PDF disponible. Installez pdfplumber ou pypdf "
            "(pip install pdfplumber)."
        ) from exc


# --------------------------------------------------------------------------- #
# Heuristiques regex sur le texte (sections Tape & Reel / Packaging)
# --------------------------------------------------------------------------- #
def _search_float(patterns: list[str], text: str) -> Optional[float]:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1).replace(",", "."))
            except (ValueError, IndexError):
                continue
    return None


def _search_int(patterns: list[str], text: str) -> Optional[int]:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            raw = re.sub(r"[,\.\s]", "", match.group(1))
            if raw.isdigit():
                return int(raw)
    return None


_PACKAGE_DETECT_PATTERNS = [
    # Codes fabricant ROHM (résolus en JEDEC par la table EIA-481)
    r"\b[USEVF]MT3F?\b",
    r"\bSC[\s\-]?(?:59A?|70|75)\b",
    # Boîtiers JEDEC discrets
    r"\bSOT[\s\-]?\d{2,4}(?:[\s\-]?\d)?\b",
    r"\bSOD[\s\-]?\d{2,3}F?\b",
    r"\bSC[\s\-]?\d{2,3}\b",
    # ICs
    r"\bSOIC[\s\-]?\d{1,2}\b",
    r"\bSO[\s\-]?\d{1,2}\b",
    r"\bTSSOP[\s\-]?\d{0,2}\b",
    r"\b[MV]SSOP[\s\-]?\d{0,2}\b",
    r"\bMSOP[\s\-]?\d{0,2}\b",
    r"\b(?:LQFP|TQFP|QFP|QFN|DFN|BGA)[\s\-]?\d{0,3}\b",
    # Power
    r"\bD?2?PAK\b",
    r"\bTO[\s\-]?2(?:36|52|63)\b",
    # Passifs imperial
    r"\b(?:01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b",
]


def detect_package_from_text(text: str) -> Optional[str]:
    """Détecte (best effort) un boîtier connu dans le texte de la datasheet.

    Utilisé comme fallback quand --package n'est pas fourni. Renvoie le premier
    token reconnu (brut), que lookup_package normalisera ensuite.
    """
    for pattern in _PACKAGE_DETECT_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
    return None


def parse_datasheet_text(text: str) -> dict:
    """Extrait les champs production utiles à partir du texte brut de la datasheet.

    Renvoie un dict avec les clés (valeur None si non trouvée) :
    pitch_mm, tape_width_mm, qty_per_reel, reel_outer_diameter_mm,
    reel_hub_diameter_mm, packaging.
    """
    pitch_mm = _search_float(
        [
            r"(?:tape\s+)?pitch[^0-9\-]{0,25}(\d+(?:[.,]\d+)?)\s*mm",
            r"\bP0\b[^0-9\-]{0,15}(\d+(?:[.,]\d+)?)\s*mm",
            r"component\s+pitch[^0-9\-]{0,15}(\d+(?:[.,]\d+)?)\s*mm",
        ],
        text,
    )

    tape_width_mm = _search_float(
        [
            r"(?:tape|carrier)\s*width[^0-9\-]{0,25}(\d+(?:[.,]\d+)?)\s*mm",
            r"(\d+(?:[.,]\d+)?)\s*mm\s+(?:wide\s+)?(?:carrier\s+)?tape",
            r"tape\s*&?\s*reel[^0-9]{0,30}(\d+)\s*mm",
        ],
        text,
    )

    qty_per_reel = _search_int(
        [
            r"(\d[\d,\.]{2,})\s*(?:pcs|pieces|units|ea)?\s*(?:per|/)\s*reel",
            r"reel\D{0,15}(\d[\d,\.]{3,})\s*(?:pcs|pieces|units)",
            r"quantity\s*per\s*reel\D{0,10}(\d[\d,\.]{2,})",
        ],
        text,
    )

    reel_outer_diameter_mm = _search_float(
        [
            r"reel\s*(?:outer\s*)?(?:diameter|ø|dia)[^0-9]{0,15}(\d{2,3}(?:[.,]\d+)?)\s*mm",
            r"ø\s*(\d{3})\s*mm\s*reel",
            r"(\d{3})\s*mm\s*reel",
        ],
        text,
    )

    reel_hub_diameter_mm = _search_float(
        [
            r"(?:hub|arbor|core)\s*(?:diameter|ø|dia)?[^0-9]{0,15}(\d{2,3}(?:[.,]\d+)?)\s*mm",
        ],
        text,
    )

    packaging = None
    if re.search(r"tape\s*(?:and|&)\s*reel|\bT\s*&?\s*R\b", text, re.IGNORECASE):
        packaging = "Tape & Reel"
    elif re.search(r"cut\s*tape", text, re.IGNORECASE):
        packaging = "Cut Tape"
    elif re.search(r"\btube\b", text, re.IGNORECASE):
        packaging = "Tube"
    elif re.search(r"\btray\b", text, re.IGNORECASE):
        packaging = "Tray"

    return {
        "pitch_mm": pitch_mm,
        "tape_width_mm": tape_width_mm,
        "qty_per_reel": qty_per_reel,
        "reel_outer_diameter_mm": reel_outer_diameter_mm,
        "reel_hub_diameter_mm": reel_hub_diameter_mm,
        "packaging": packaging,
    }


# --------------------------------------------------------------------------- #
# Fusion EIA-481 (primaire) + parsing PDF (complément)
# --------------------------------------------------------------------------- #
def merge_with_eia(parsed: dict, package: Optional[str]) -> dict:
    """Combine la table EIA-481 (primaire pour pitch/largeur/feeder) avec le PDF.

    Le PDF prime quand il fournit une valeur ; sinon on retombe sur l'EIA-481.
    Trace l'origine de chaque valeur et un niveau de confiance global.
    """
    eia = lookup_package(package) if package else None
    sources: list[str] = []

    def resolve(field: str, eia_value):
        pdf_value = parsed.get(field)
        if pdf_value is not None:
            return pdf_value, "PDF"
        if eia_value is not None:
            return eia_value, "EIA-481"
        return None, None

    pitch_mm, pitch_src = resolve("pitch_mm", eia["pitch_mm"] if eia else None)
    tape_width_mm, width_src = resolve("tape_width_mm", eia["tape_width_mm"] if eia else None)

    # Feeder : déduit de la largeur finale (notation CL8/CL12/...)
    feeder = None
    if tape_width_mm is not None:
        from src.services.eia481_rules import feeder_for_tape_width

        feeder = feeder_for_tape_width(tape_width_mm)

    if eia and eia["matched"]:
        sources.append(f"EIA-481 (boîtier {eia['package']})")
    if any(v is not None for v in parsed.values()):
        sources.append("datasheet PDF")

    # Confiance : haute si EIA + PDF concordent, moyenne si une seule source.
    eia_matched = bool(eia and eia["matched"])
    pdf_has_data = any(parsed.get(k) is not None for k in ("pitch_mm", "tape_width_mm"))
    if eia_matched and pdf_has_data:
        confidence = "haute"
    elif eia_matched or pdf_has_data:
        confidence = "moyenne"
    else:
        confidence = "basse"

    return {
        "pitch_mm": pitch_mm,
        "pitch_source": pitch_src,
        "tape_width_mm": tape_width_mm,
        "tape_width_source": width_src,
        "feeder": feeder,
        "qty_per_reel": parsed.get("qty_per_reel"),
        "reel_outer_diameter_mm": parsed.get("reel_outer_diameter_mm"),
        "reel_hub_diameter_mm": parsed.get("reel_hub_diameter_mm"),
        "packaging": parsed.get("packaging"),
        "sources": sources,
        "confidence": confidence,
    }


# --------------------------------------------------------------------------- #
# Rendu Markdown (sections seules, cf décision Eric)
# --------------------------------------------------------------------------- #
def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "_non renseigné_"
    return f"{value}{suffix}"


def render_markdown(reference: str, mpn: Optional[str], package: Optional[str],
                    data: dict, pdf_path: Optional[str] = None) -> str:
    """Construit le contenu Markdown de la fiche composant (sections lisibles)."""
    title = f"{reference}" + (f" — {mpn}" if mpn else "")
    lines = [f"# {title}", ""]

    lines += ["## Identification", ""]
    lines += [f"- Référence : {reference}"]
    if mpn:
        lines += [f"- MPN : {mpn}"]
    if package:
        lines += [f"- Boîtier : {package}"]
    lines += [""]

    lines += ["## Packaging", ""]
    lines += [f"- Type : {_fmt(data.get('packaging'))}"]
    lines += [f"- Quantité par bobine : {_fmt(data.get('qty_per_reel'))}"]
    lines += [f"- Largeur de bande : {_fmt(data.get('tape_width_mm'), ' mm')}"]
    lines += [""]

    lines += ["## Bande (tape)", ""]
    lines += [f"- Pitch : {_fmt(data.get('pitch_mm'), ' mm')}"]
    lines += [f"- Feeder recommandé : {_fmt(data.get('feeder'))}"]
    lines += [""]

    lines += ["## Bobine", ""]
    lines += [f"- Ø extérieur : {_fmt(data.get('reel_outer_diameter_mm'), ' mm')}"]
    lines += [f"- Ø moyeu : {_fmt(data.get('reel_hub_diameter_mm'), ' mm')}"]
    lines += [""]

    lines += ["## Source", ""]
    origin = " + ".join(data.get("sources") or ["aucune"])
    lines += [f"- Origine : {origin}"]
    if data.get("pitch_source") or data.get("tape_width_source"):
        lines += [
            f"- Détail : pitch via {data.get('pitch_source') or 'n/a'}, "
            f"largeur via {data.get('tape_width_source') or 'n/a'}"
        ]
    if pdf_path:
        lines += [f"- Fichier : {pdf_path}"]
    lines += [f"- Confiance : {data.get('confidence', 'basse')}"]
    lines += [""]

    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _safe_filename(reference: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.\-]", "_", reference) + ".md"


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", help="Chemin vers la datasheet PDF")
    parser.add_argument("-r", "--reference", required=True,
                        help="Référence composant (lien base de données)")
    parser.add_argument("-p", "--package", default=None,
                        help="Boîtier (ex. 0805, SOT-23) pour la table EIA-481")
    parser.add_argument("-m", "--mpn", default=None, help="MPN du composant")
    parser.add_argument("-o", "--output-dir", default=DEFAULT_OUTPUT_DIR,
                        help="Dossier de sortie des .md")
    args = parser.parse_args(argv)

    if not os.path.isfile(args.pdf):
        print(f"Erreur : fichier introuvable : {args.pdf}", file=sys.stderr)
        return 2

    text = extract_pdf_text(args.pdf)
    parsed = parse_datasheet_text(text)
    package = args.package or detect_package_from_text(text)
    data = merge_with_eia(parsed, package)
    markdown = render_markdown(args.reference, args.mpn, package, data, args.pdf)
    if package and not args.package:
        print(f"Boîtier détecté automatiquement : {package}")

    os.makedirs(args.output_dir, exist_ok=True)
    out_path = os.path.join(args.output_dir, _safe_filename(args.reference))
    with open(out_path, "w", encoding="utf-8") as handle:
        handle.write(markdown)

    print(f"Fiche écrite : {out_path} (confiance : {data['confidence']})")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
