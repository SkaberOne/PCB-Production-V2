#!/usr/bin/env python3
"""Remplit la table COMPONENTS à partir des datasheets PDF (via extract_datasheet).

Pour chaque PDF : extraction (table EIA-481 + parsing, sans LLM), recherche d'un
Component existant par `reference` ou `mpn`, puis mise à jour des champs vides
(package, pitch_mm, tape_width_mm, feeder_type, qty_per_reel, reel_*).

SÛRETÉ : dry-run par défaut (aucune écriture). Utiliser --commit pour écrire,
--force pour écraser des valeurs déjà renseignées.

Usage :
    # Aperçu (n'écrit rien) sur tout le dossier
    python populate_components_from_datasheets.py
    # Écrit réellement en base
    python populate_components_from_datasheets.py --commit
    # Un seul PDF, référence explicite
    python populate_components_from_datasheets.py path.pdf -r BAV199 --commit
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import sys
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from src.database import SessionLocal  # noqa: E402
from src.models.bom import Component  # noqa: E402
import extract_datasheet as ed  # noqa: E402


def _make_session(database_url: Optional[str]):
    """Retourne une session DB. Par défaut SessionLocal (config serveur).

    --database-url permet de cibler une base précise sans dépendre du .env
    (ex. sqlite:///database/dev.db) — utile pour tester hors prod SQL Server.
    """
    if not database_url:
        return SessionLocal()
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(database_url)
    return sessionmaker(bind=engine)()

DEFAULT_PDF_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "datasheets", "pdf"
)

# Champs Component alimentés depuis les données extraites (clé extraite -> attribut)
_FIELD_MAP = {
    "package": "package",
    "pitch_mm": "pitch_mm",
    "tape_width_mm": "tape_width_mm",
    "feeder": "feeder_type",
    "qty_per_reel": "qty_per_reel",
    "reel_outer_diameter_mm": "reel_outer_diameter_mm",
    "reel_hub_diameter_mm": "reel_hub_diameter_mm",
}


def reference_from_filename(pdf_path: str) -> str:
    """Déduit une référence composant à partir du nom de fichier de la datasheet."""
    stem = os.path.splitext(os.path.basename(pdf_path))[0]
    ref = re.sub(r"[\s_]*Data\s*Sheet$", "", stem, flags=re.IGNORECASE).strip()
    return re.sub(r"\s+", "_", ref)


def select_component(db, reference: Optional[str], mpn: Optional[str]) -> Optional[Component]:
    """Trouve un Component par reference puis par mpn (insensible à la casse)."""
    if reference:
        comp = (
            db.query(Component)
            .filter(Component.reference.ilike(reference))
            .first()
        )
        if comp:
            return comp
    if mpn:
        comp = db.query(Component).filter(Component.mpn.ilike(mpn)).first()
        if comp:
            return comp
    return None


def _is_empty(value) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def compute_updates(component: Component, extracted: dict, *, package: Optional[str],
                    force: bool = False) -> dict:
    """Calcule les champs à mettre à jour (champs vides seulement, sauf --force)."""
    source = dict(extracted)
    if package and source.get("package") is None:
        source["package"] = package

    updates: dict = {}
    for key, attr in _FIELD_MAP.items():
        new_value = source.get(key)
        if new_value is None:
            continue
        if force or _is_empty(getattr(component, attr, None)):
            updates[attr] = new_value
    return updates


def process_pdf(db, pdf_path: str, *, reference: Optional[str] = None,
                mpn: Optional[str] = None, package: Optional[str] = None,
                force: bool = False) -> dict:
    """Traite un PDF : extraction + matching + calcul des updates (sans commit)."""
    ref = reference or reference_from_filename(pdf_path)
    try:
        text = ed.extract_pdf_text(pdf_path)
    except Exception:
        text = ""
    parsed = ed.parse_datasheet_text(text)
    detected_pkg = package or ed.detect_package_from_text(text)
    data = ed.merge_with_eia(parsed, detected_pkg)

    component = select_component(db, ref, mpn)
    if component is None:
        return {"reference": ref, "matched": False, "updates": {}, "confidence": data["confidence"]}

    updates = compute_updates(component, data, package=detected_pkg, force=force)
    for attr, value in updates.items():
        setattr(component, attr, value)
    return {
        "reference": ref,
        "matched": True,
        "component_id": component.id,
        "updates": updates,
        "confidence": data["confidence"],
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", nargs="?", help="PDF unique (sinon tout le dossier)")
    parser.add_argument("-r", "--reference", default=None, help="Référence (mode PDF unique)")
    parser.add_argument("-m", "--mpn", default=None, help="MPN pour le matching")
    parser.add_argument("-p", "--package", default=None, help="Boîtier (force la table EIA-481)")
    parser.add_argument("-d", "--pdf-dir", default=DEFAULT_PDF_DIR, help="Dossier des PDF")
    parser.add_argument("--commit", action="store_true", help="Écrire réellement en base")
    parser.add_argument("--force", action="store_true", help="Écraser les valeurs existantes")
    parser.add_argument("--database-url", default=None,
                        help="URL DB explicite (ex. sqlite:///database/dev.db)")
    args = parser.parse_args(argv)

    pdfs = [args.pdf] if args.pdf else sorted(glob.glob(os.path.join(args.pdf_dir, "*.pdf")))
    if not pdfs:
        print("Aucun PDF trouvé.", file=sys.stderr)
        return 2

    db = _make_session(args.database_url)
    matched = updated = 0
    try:
        for pdf in pdfs:
            res = process_pdf(
                db, pdf, reference=args.reference, mpn=args.mpn,
                package=args.package, force=args.force,
            )
            if res["matched"]:
                matched += 1
                if res["updates"]:
                    updated += 1
                    fields = ", ".join(f"{k}={v}" for k, v in res["updates"].items())
                    print(f"[MATCH] {res['reference']:24s} -> {fields}")
                else:
                    print(f"[OK   ] {res['reference']:24s} (rien à compléter)")
            else:
                print(f"[MISS ] {res['reference']:24s} (aucun composant en base)")

        if args.commit:
            db.commit()
            print(f"\nÉcrit en base : {updated} composant(s) mis à jour.")
        else:
            db.rollback()
            print(f"\nDRY-RUN (rien écrit). {matched} matché(s), {updated} auraient été mis à jour.")
            print("Relancer avec --commit pour appliquer.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
