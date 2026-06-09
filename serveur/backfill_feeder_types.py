"""Backfill ``Component.feeder_type`` quand il est vide, par déduction du footprint.

Source de vérité : ``src/utils/footprint_feeder_map.py`` (mêmes règles que la
migration Alembic prod). Ne traite que les composants dont ``feeder_type`` est
NULL/vide ET dont le footprint est identifiable ; laisse les connecteurs,
traversant et références inconnues intacts (saisie manuelle). Ne touche jamais
``Component.value`` (clé de matching).

Usage (depuis serveur/, venv activé) :
    .venv\\Scripts\\python.exe serveur\\backfill_feeder_types.py            # dry-run (défaut)
    .venv\\Scripts\\python.exe serveur\\backfill_feeder_types.py --apply    # écrit en base
"""

import argparse
import os
import sys

# Permettre `from src...` que le script soit lancé depuis la racine ou depuis serveur/.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from src.database import SessionLocal  # noqa: E402
from src.models.bom import Component  # noqa: E402
from src.utils.feeder_types import extract_component_feeder_size_mm  # noqa: E402
from src.utils.footprint_feeder_map import deduce_feeder_type_from_footprint  # noqa: E402


def _is_empty(value):
    return not (value or "").strip()


def run(apply_changes: bool) -> int:
    session = SessionLocal()
    try:
        components = session.query(Component).all()
        # Cible : feeder_type sans taille exploitable (vide, ou label non parsable).
        targets = [
            c for c in components
            if extract_component_feeder_size_mm(c.feeder_type) is None
        ]

        planned = []   # (component, new_feeder_type)
        skipped = []   # component non identifiable -> reste manuel
        for c in targets:
            new_ft = deduce_feeder_type_from_footprint(
                c.footprint_pnp, c.footprint_eagle, c.package
            )
            if new_ft:
                planned.append((c, new_ft))
            else:
                skipped.append(c)

        print(f"Composants totaux            : {len(components)}")
        print(f"Sans taille feeder exploitable: {len(targets)}")
        print(f"  -> mappés (à compléter)     : {len(planned)}")
        print(f"  -> non identifiables (manuel): {len(skipped)}")
        print()

        # Détail des changements prévus, trié par label puis footprint.
        print("=== Changements prévus ===")
        for c, new_ft in sorted(planned, key=lambda x: (x[1], x[0].footprint_pnp or "")):
            fp = c.footprint_pnp or c.package or "∅"
            print(f"  #{c.id:<5} {fp[:22]:24} feeder_type='' -> {new_ft}")

        print()
        print("=== Laissés en saisie manuelle (footprint non identifiable) ===")
        for c in sorted(skipped, key=lambda x: (x.footprint_pnp or "")):
            fp = c.footprint_pnp or c.package or "∅"
            print(f"  #{c.id:<5} {fp[:22]:24} (eagle={c.footprint_eagle or '∅'})")

        if apply_changes:
            for c, new_ft in planned:
                c.feeder_type = new_ft
            session.commit()
            print(f"\n[APPLIQUÉ] {len(planned)} feeder_type écrits en base.")
        else:
            print(f"\n[DRY-RUN] Aucune écriture. Relancer avec --apply pour écrire {len(planned)} valeurs.")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill Component.feeder_type depuis le footprint.")
    parser.add_argument("--apply", action="store_true", help="Écrire les changements en base (sinon dry-run).")
    args = parser.parse_args()
    raise SystemExit(run(args.apply))
