"""Suivi de préparation physique par (production, composant) — prompt 007.

Annotation d'avancement (préparé / installé) **sans impact sur le solde de stock**
(même esprit que ``ComponentMachineLoad``). Deux usages :

- écriture : ``set_progress`` (upsert set-to, renseigne qui + quand) ;
- lecture : ``get_progress_map`` + ``conditionnement_map`` et l'enrichisseur
  ``enrich_component_id_tree`` qui décore n'importe quelle structure de la vue
  Machine PnP (dicts portant ``component_id``) avec le conditionnement et l'état.
"""

from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from ..database import utcnow
from ..models.production import Production, ProductionComponentProgress
from ..models.stock import ComponentStock


class ProductionProgressService:
    """Écriture/lecture de l'avancement préparé/installé d'une production."""

    @staticmethod
    def set_progress(
        db: Session,
        production_id: int,
        component_id: int,
        *,
        prepared: Optional[bool] = None,
        installed: Optional[bool] = None,
        created_by: Optional[str] = None,
    ) -> ProductionComponentProgress:
        """Upsert set-to de l'avancement. Renseigne ``*_by``/``*_at`` sur le jalon touché.

        Un jalon coché → ``by`` = poste courant, ``at`` = maintenant ; décoché →
        ``by``/``at`` remis à ``None`` (l'annotation reflète l'état courant).
        """
        if db.get(Production, production_id) is None:
            raise ValueError(f"Production {production_id} introuvable.")

        row = (
            db.query(ProductionComponentProgress)
            .filter(
                ProductionComponentProgress.production_id == production_id,
                ProductionComponentProgress.component_id == component_id,
            )
            .first()
        )
        if row is None:
            row = ProductionComponentProgress(
                production_id=production_id, component_id=component_id
            )
            db.add(row)

        now = utcnow()
        if prepared is not None:
            row.is_prepared = bool(prepared)
            row.prepared_by = created_by if prepared else None
            row.prepared_at = now if prepared else None
        if installed is not None:
            row.is_installed = bool(installed)
            row.installed_by = created_by if installed else None
            row.installed_at = now if installed else None

        db.commit()
        db.refresh(row)
        return row

    @staticmethod
    def get_progress_map(
        db: Session, production_id: int
    ) -> Dict[int, ProductionComponentProgress]:
        """``{component_id: ProductionComponentProgress}`` pour une production."""
        rows = (
            db.query(ProductionComponentProgress)
            .filter(ProductionComponentProgress.production_id == production_id)
            .all()
        )
        return {row.component_id: row for row in rows}

    @staticmethod
    def conditionnement_map(
        db: Session, component_ids: Iterable[int]
    ) -> Dict[int, Dict[str, int]]:
        """``{component_id: {reel,bag,tube}}`` (formes non nulles gérées côté vue)."""
        ids = [cid for cid in {int(c) for c in component_ids if c}]
        if not ids:
            return {}
        rows = (
            db.query(ComponentStock)
            .filter(ComponentStock.component_id.in_(ids))
            .all()
        )
        return {
            row.component_id: {
                "reel": int(row.qty_reel or 0),
                "bag": int(row.qty_bag or 0),
                "tube": int(row.qty_tube or 0),
            }
            for row in rows
        }

    @staticmethod
    def progress_payload(row: Optional[ProductionComponentProgress]) -> Dict[str, Any]:
        """Sérialise l'état d'avancement (défauts neutres si aucune ligne)."""
        if row is None:
            return {
                "is_prepared": False,
                "prepared_by": None,
                "prepared_at": None,
                "is_installed": False,
                "installed_by": None,
                "installed_at": None,
            }
        return {
            "is_prepared": bool(row.is_prepared),
            "prepared_by": row.prepared_by,
            "prepared_at": row.prepared_at.isoformat() if row.prepared_at else None,
            "is_installed": bool(row.is_installed),
            "installed_by": row.installed_by,
            "installed_at": row.installed_at.isoformat() if row.installed_at else None,
        }

    @classmethod
    def _collect_component_ids(cls, obj: Any, out: set) -> None:
        if isinstance(obj, dict):
            cid = obj.get("component_id")
            if isinstance(cid, int):
                out.add(cid)
            for value in obj.values():
                cls._collect_component_ids(value, out)
        elif isinstance(obj, list):
            for value in obj:
                cls._collect_component_ids(value, out)

    @classmethod
    def _decorate(cls, obj: Any, cond: Dict[int, Dict[str, int]], prog: Dict[int, Any]) -> None:
        if isinstance(obj, dict):
            cid = obj.get("component_id")
            if isinstance(cid, int):
                obj["conditionnement"] = cond.get(
                    cid, {"reel": 0, "bag": 0, "tube": 0}
                )
                obj["progress"] = cls.progress_payload(prog.get(cid))
            for value in obj.values():
                cls._decorate(value, cond, prog)
        elif isinstance(obj, list):
            for value in obj:
                cls._decorate(value, cond, prog)

    @classmethod
    def enrich_component_id_tree(
        cls, db: Session, production_id: int, tree: Any
    ) -> Any:
        """Décore en place tout dict portant ``component_id`` (conditionnement + état).

        Utilisé pour la vue Machine PnP (plan feeder) : ne suppose rien de la forme
        exacte, se contente de suivre les ``component_id`` présents.
        """
        ids: set = set()
        cls._collect_component_ids(tree, ids)
        if not ids:
            return tree
        cond = cls.conditionnement_map(db, ids)
        prog = cls.get_progress_map(db, production_id)
        cls._decorate(tree, cond, prog)
        return tree
