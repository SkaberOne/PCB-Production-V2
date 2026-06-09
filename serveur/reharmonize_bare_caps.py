"""Ré-harmonise les valeurs condensateur « préfixe nu » (ex. Eagle « 100n »).

Contexte : avant le correctif de `harmonize_capacitor_value`, une valeur écrite
sans le « F » (100n, 1u, 10p) restait telle quelle et ne matchait aucun
composant « 100nF » de la bibliothèque → aucun feeder → ligne absente / vide
dans l'export PnP (et plantage import machine sur la cellule entière vide).

Ce script corrige les BOM_ITEMS DÉJÀ en base (le correctif de code ne vaut que
pour les futurs imports). Il est volontairement chirurgical :
  - ne touche QUE les items dont la valeur harmonisée est un préfixe nu
    `^[0-9.]+\\s*[munp]$` (insensible à la casse) ;
  - n'applique que l'ajout du « F » (pas de ré-harmonisation globale, pour
    éviter des effets de bord type « NC » → « NCR » côté résistances).

Usage (serveur arrêté de préférence) :
    .venv\\Scripts\\python.exe serveur\\reharmonize_bare_caps.py          # aperçu (dry-run)
    .venv\\Scripts\\python.exe serveur\\reharmonize_bare_caps.py --apply  # applique
"""

import os
import re
import sys

# Permet `from src...` que le script soit lancé depuis la racine ou depuis serveur/.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from src.database import SessionLocal  # noqa: E402
from src.models.bom import BomItem  # noqa: E402
from src.services.harmony_rules import harmonize_capacitor_value  # noqa: E402

BARE_CAP = re.compile(r"^[0-9.]+\s*[munp]$", re.IGNORECASE)


def main(apply: bool) -> int:
    db = SessionLocal()
    try:
        items = db.query(BomItem).filter(BomItem.value_harmonized.isnot(None)).all()
        changes = []
        for item in items:
            current = (item.value_harmonized or "").strip()
            if not BARE_CAP.match(current):
                continue
            new_value = harmonize_capacitor_value(current)
            if new_value != item.value_harmonized:
                changes.append((item, item.value_harmonized, new_value))

        if not changes:
            print("Aucun item « préfixe nu » à corriger.")
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
