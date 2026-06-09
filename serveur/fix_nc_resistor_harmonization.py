"""Nettoie les valeurs résistance polluées par le bug « NC -> NCR ».

Contexte : avant le correctif de `harmonize_resistor_value`, toute valeur
résistance non numérique se voyait suffixer un « R » (NC -> NCR, DNP -> DNPR…),
ce qui casse le matching bibliothèque et pollue la base.

Ce script répare les BOM_ITEMS DÉJÀ en base, de façon strictement ciblée pour
NE PAS écraser d'éventuelles valeurs harmonisées éditées à la main :
  - ne touche QUE les items où `value_harmonized` == `value_raw` + « R »
    (exactement le résultat du bug), avec un `value_raw` non numérique ;
  - rétablit alors `value_harmonized` = `value_raw` (résultat correct du
    correctif de code).

Usage (serveur arrêté de préférence) :
    .venv\\Scripts\\python.exe serveur\\fix_nc_resistor_harmonization.py          # aperçu (dry-run)
    .venv\\Scripts\\python.exe serveur\\fix_nc_resistor_harmonization.py --apply  # applique
"""

import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from src.database import SessionLocal  # noqa: E402
from src.models.bom import BomItem  # noqa: E402
from src.services.harmony_rules import harmonize_resistor_value  # noqa: E402

STARTS_WITH_DIGIT = re.compile(r"^[0-9.]")


def main(apply: bool) -> int:
    db = SessionLocal()
    try:
        items = (
            db.query(BomItem)
            .filter(BomItem.value_raw.isnot(None), BomItem.value_harmonized.isnot(None))
            .all()
        )
        changes = []
        for item in items:
            raw = (item.value_raw or "").strip()
            harm = (item.value_harmonized or "").strip()
            if not raw or STARTS_WITH_DIGIT.match(raw):
                continue  # valeur ohmique réelle -> ignorer
            # Signature exacte du bug : harmonisé == brut + « R ».
            if harm == raw + "R":
                corrected = harmonize_resistor_value(raw)  # correctif -> brut inchangé
                if corrected != item.value_harmonized:
                    changes.append((item, item.value_harmonized, corrected))

        if not changes:
            print("Aucun item pollué (NCR/DNPR…) à corriger.")
            return 0

        print(f"{len(changes)} item(s) {'corrigé(s)' if apply else 'à corriger (dry-run)'} :")
        for item, old, new in changes:
            print(f"  rev {item.bom_revision_id:>4} | {item.reference_item:<6} | {old!r} -> {new!r}")
            if apply:
                item.value_harmonized = new

        if apply:
            db.commit()
            print("\nCommit OK.")
        else:
            print("\nDry-run : relancer avec --apply pour écrire en base.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main(apply="--apply" in sys.argv))
