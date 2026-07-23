# [017] refactor(backend): dette & architecture (imports canoniques, découpe, dédup)

| Champ | Valeur |
|---|---|
| **ID** | 017 · **Type** refactor · **Branche cible** `dev` · **Branche** `refactor/dette-archi-backend` |
| **Priorité** | **basse** · **Dépend de** aucune · **Parallèle** : oui mais **non** avec 013/015 sur les mêmes fichiers (`assignment_planning.py`) — séquencer si nécessaire |
| **Source** | Audit 2026-07-22 (archi) · **Créé le** 2026-07-22 |

## 1. Objectif
Réduire la dette sans changer le comportement (refactor pur, couvert par les tests). À faire **après** 013/015 pour éviter les conflits sur les gros fichiers.

## 2. Spécification

1. **`get_db` canonique** — `serveur/src/routes/bom_components.py:38` + `bom_files.py:25`, `bom_revision_imports.py:16`, `bom_revision_mutations.py:20`, `bom_revision_queries.py:17`, `bom_catalogue_import.py:23` : remplacer `from .bom import get_db` par `from ..database import get_db` (canonique CLAUDE.md) et supprimer le re-export + commentaire de compat dans `bom.py`.
2. **Découpe `assignment_planning.py:311`** — `get_machine_production_feeder_plan` (~447 lignes) : extraire en fonctions privées cohésives (collecte usage, plan fixe, plan dynamique, sérialisation), méthode publique = orchestrateur ~30 lignes.
3. **Export ERP hors CommandService** — `command_service.py:145` : déplacer la génération openpyxl (`_build_erp_export_rows`, `export_command_erp_workbook`, `ERP_HEADERS`, `_clean_export_text`, `_supplier_label`) dans un `command_export_service.py` dédié.
4. **`get_command_summary` (224 lignes)** — `command_service.py:718` : extraire chargement révisions/bom_items + calcul stats en helpers.
5. **Route `bom_components.py` (1060 lignes)** — scinder par sous-domaine (composants / footprints / type-rules) et pousser l'ORM complexe vers `component_type_service` / `component_library_service`. (Peut être un incrément séparé.)
6. **Dédup tri d'offres** — `supplier_offer_service.py:189` : centraliser la règle « en stock d'abord, prix renseigné, moins cher » (clé de tri + prédicat in_stock) réutilisée par `_pick_primary_offer`, `_rank_candidates`, `select_best`.

## 3. Tests
- `pytest` : **suite complète verte inchangée** (refactor = comportement identique). Ajouter des tests unitaires sur les helpers extraits si utile.

## 4. DoD
Critères §2 · `pytest` vert (parité) · CI verte · PR vers `dev` · RESULTAT.md. Livrable en incréments (un point = un commit).

## 5. Contraintes
Package `src` · imports relatifs · aucun changement fonctionnel ni de schéma. Branche courte depuis `dev`, PR vers `dev`.

## 6. RÉSULTAT — à remplir par l'orchestrateur
