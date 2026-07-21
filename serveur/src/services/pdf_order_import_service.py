"""Service : import d'une commande client au format PDF (ADR 0018).

Parse un bon de commande KELENN (ex. CO2601-10180.pdf), extrait le client
(bloc « Adressé à ») et les lignes article (code KELENN -> part_number + révision
+ nom + quantité), puis rapproche chaque ligne d'une carte du catalogue par son
``part_number``. Les lignes sans code (frais de port…) sont ignorées.
"""

import io
import re
from collections import defaultdict
from typing import Dict, List, Optional

import pdfplumber
from sqlalchemy.orm import Session

from .board_stock_service import ClientOrderService, ClientService
from .card_catalog_service import CardCatalogService

# CODE - DÉSIGNATION  TVA%  P.U.  Qté  u.  Total
_LINE_RE = re.compile(
    r"^([A-Z]{1,4}\d{4,}[A-Z]?)\s*-\s*(.+?)\s+(\d+)%\s+([\d ,]+)\s+(\d+)\s+u\.\s+([\d ,]+)$"
)
# Code KELENN : préfixe lettres+chiffres, dernière lettre = révision.
_REV_RE = re.compile(r"^([A-Z]+\d+)([A-Z])$")


def _clean(s: str) -> str:
    # Normalise les espaces insécables (séparateurs de milliers FR).
    return (s or "").replace(" ", " ").replace(" ", " ")


def _extract_client(words: List[dict]) -> Optional[str]:
    """Client = 1re ligne du bloc « Adressé à ». Sépare les 2 colonnes
    (Émetteur | Adressé à) via la coordonnée x0 des mots."""
    hx = hy = None
    for w in words:
        if w["text"] == "Adressé":
            hx, hy = w["x0"], w["top"]
            break
    if hx is None:
        return None
    thr = hx - 5
    rows: Dict[int, List] = defaultdict(list)
    for w in words:
        if w["top"] > hy + 2 and w["x0"] >= thr:
            rows[round(w["top"])].append((w["x0"], w["text"]))
    for top in sorted(rows):
        toks = [t for _, t in sorted(rows[top])]
        line = " ".join(toks).strip()
        if line:
            return line
    return None


def parse_order_pdf(data: bytes) -> Dict:
    """Retourne {client_name, lines:[{code, part_number, revision, name, quantity}]}."""
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        page = pdf.pages[0]
        text = page.extract_text() or ""
        words = page.extract_words()

    client = _extract_client(words)
    lines: List[Dict] = []
    for raw in text.splitlines():
        m = _LINE_RE.match(_clean(raw).strip())
        if not m:
            continue
        code, name, _tva, _pu, qty, _tot = m.groups()
        rm = _REV_RE.match(code)
        part_number, revision = (rm.group(1), rm.group(2)) if rm else (code, "")
        lines.append({
            "code": code,
            "part_number": part_number,
            "revision": revision,
            "name": name.strip(),
            "quantity": int(qty),
        })
    return {"client_name": client, "lines": lines}


class PdfOrderImportService:
    """Prévisualisation + création d'une commande client depuis un PDF."""

    @staticmethod
    def preview(db: Session, data: bytes) -> Dict:
        """Parse + rapproche par part_number. Sépare cartes reconnues / codes inconnus."""
        parsed = parse_order_pdf(data)
        matched: List[Dict] = []
        unmatched: List[Dict] = []
        for line in parsed["lines"]:
            ref = CardCatalogService.find_by_part_number(db, line["part_number"])
            entry = dict(line)
            if ref is not None:
                entry["bom_reference_id"] = ref.id
                entry["reference"] = ref.reference
                matched.append(entry)
            else:
                unmatched.append(entry)
        return {
            "client_name": parsed["client_name"],
            "matched": matched,
            "unmatched": unmatched,
        }

    @staticmethod
    def _get_or_create_client(db: Session, name: str) -> int:
        clean = (name or "").strip()
        if not clean:
            raise ValueError("Nom du client manquant")
        from ..models.board_stock import Client
        found = db.query(Client).filter(Client.name == clean).first()
        if found:
            return found.id
        created = ClientService.create_client(db, name=clean)
        return created["id"]

    @classmethod
    def commit(
        cls,
        db: Session,
        *,
        client_name: str,
        lines: List[Dict],
        mappings: Optional[List[Dict]] = None,
    ) -> Dict:
        """Applique les mappings (code -> carte, mémorisés sur la carte), trouve/crée
        le client, crée la commande avec les lignes résolues.

        ``lines`` : [{bom_reference_id, revision, quantity}]
        ``mappings`` : [{part_number, bom_reference_id}] à écrire sur les cartes.
        """
        for mp in (mappings or []):
            pn = (mp.get("part_number") or "").strip()
            rid = mp.get("bom_reference_id")
            if pn and rid:
                CardCatalogService.update_card(db, int(rid), part_number=pn)

        client_id = cls._get_or_create_client(db, client_name)

        order_lines = []
        for ln in (lines or []):
            rid = ln.get("bom_reference_id")
            qty = int(ln.get("quantity") or 0)
            if rid and qty > 0:
                order_lines.append({
                    "bom_reference_id": int(rid),
                    "revision": ln.get("revision") or "",
                    "quantity": qty,
                })
        if not order_lines:
            raise ValueError("Aucune carte à commander (aucune ligne reconnue)")

        return ClientOrderService.create_order(
            db,
            order_type="CLIENT",
            client_id=client_id,
            recipient=client_name,
            lines=order_lines,
        )
