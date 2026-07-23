# RÉSULTAT — [017] refactor(backend) : dette & architecture

- **Statut** : ✅ terminé (incréments sûrs livrés ; gros splits différés)
- **Branche** : `refactor/dette-archi-backend` (depuis `dev` à jour, 013·014·015·016 inclus)
- **PR** : [#95](https://github.com/SkaberOne/PCB-Production-V2/pull/95) vers `dev`
- **Type** : backend uniquement — refactor pur, aucun changement fonctionnel ni de schéma (parité prouvée par la suite).

## Ce qui a été fait

1. **`get_db` canonique** — les 6 routes `bom_*` importent `get_db` depuis `..database` (au lieu du re-export via `.bom`). Re-export + `__all__` de compat supprimés de `bom.py` ; `conftest.py` nettoyé.
3. **Export ERP hors `CommandService`** → **`serveur/src/services/command_export_service.py`** (`CommandExportService` : `ERP_HEADERS`, `SUPPLIER_LABELS`, `_clean_export_text`, `_supplier_label`, `_build_description`, `_build_erp_export_rows`, `export_command_erp_workbook`). Route `marketplace_command_core` + tests (`test_command_stock`, `test_erp_export_v2`) mis à jour ; imports `openpyxl`/`BytesIO` retirés de `command_service`.
6. **Dédup tri d'offres** — prédicat **`_offer_in_stock`** centralisé (`select_best` + `_rank_candidates`) ; clés de tri conservées (lead time / départage prix-nul diffèrent légitimement → parité).

## Différés (incréments, priorité basse, haut risque de régression)

- **2** — découpe `get_machine_production_feeder_plan` (~447 l).
- **4** — helpers `get_command_summary` (~224 l).
- **5** — split `bom_components.py` (1060 l) — explicitement optionnel dans le prompt.

Le prompt autorise une livraison en incréments ; ces trois découpes internes de très grosses fonctions restent à faire dans une PR dédiée.

## Tests / preuve

- **Suite complète** : `584 passed, 1 skipped` — identique à `dev` (parité stricte). Refactor sans UI → preuve = parité (pas de capture front).
