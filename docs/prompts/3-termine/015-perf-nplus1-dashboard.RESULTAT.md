# RÉSULTAT — [015] perf(backend) : N+1 dashboard + requêtes par-élément

- **Statut** : ✅ terminé
- **Branche** : `perf/nplus1-backend` (depuis `dev` à jour, 013+014 inclus)
- **PR** : [#93](https://github.com/SkaberOne/PCB-Production-V2/pull/93) vers `dev`
- **Type** : backend uniquement — pas de changement de schéma, pas de front (effet visible sur le Tableau de bord)

## Ce qui a été fait (6 points, par ordre d'impact)

### 1. Dashboard — `report_service.get_productions_summary`
- `joinedload(Production.machine, Production.bom_links)` : plus de lazy-load par production.
- **Σ cartes produites** : une seule requête `GROUP BY production_id` sur `ProductionRun` (non annulés) → dict, au lieu d'une requête par production.
- **Dernière commande** par production : une seule requête (tri `id` desc + `setdefault`) → dict.
- **Contexte partagé** `cip_ctx` (settings, components, lookup, stocks, engaged) préchargé **une fois** et passé à `can_i_produce(..., ctx=...)` : supprime les full-scans (`Component`, `ComponentStock`, `engaged`) **répétés à chaque production**.

### 2. `production_stock_service.can_i_produce`
- `loss_pct` lu depuis le **dict `stocks` préchargé** au lieu de `_effective_loss_pct` (qui requêtait `ComponentStock` par composant → N+1 supprimé).
- `lookup` Component partagé passé à `aggregate_needs_per_board` **et** `_reserved_by_others` (nouveau paramètre `component_lookup`) → fin du 2ᵉ full-scan `Component` par appel (et par « autre » production dans les réservations).
- Récupération ciblée `.in_()` des composants créés par `get_or_create` absents du préchargement (parité).

### 3. `costing_service.list_cards`
- Dernier prix de référence par carte en **une** requête (`is_reference` triée `computed_at`/`id` desc + `setdefault`) au lieu d'une requête par référence.

### 4. `production_service.get_plan_summary`
- Composants chargés en **une** requête `.in_(ids)` → dict, au lieu d'une requête par assignation.

### 5. `bom_components` — imports lourds
- `import_machine_footprints` et `import_component_library` (openpyxl) : le travail synchrone bloquant passe par `await run_in_threadpool(...)` (ne bloque plus l'event loop). `read_upload_capped` reste `async`.

### 6. Mineurs (même patron `.in_()` / préchargement)
- `costing_service` (compute production : `BomReference` par carte en une requête `.in_()`).
- `bom_catalogue_import._register_missing_components` (références existantes préchargées en `set`).
- `assignment_planning` (composants épinglés `PnpSlotPin` préchargés).
- `supplier_offer_service` (bulk set MPN : composants préchargés en une requête).

## Tests (parité = mêmes résultats)

- **`serveur/src/tests/test_perf_015.py`** :
  - `test_can_i_produce_ctx_parity` : `can_i_produce(..., ctx=préchargé)` **== ** `can_i_produce(...)` sans contexte (prouve que le chemin optimisé est identique).
  - `test_dashboard_summary_aggregates_multiple_productions` : agrégats corrects sur 2 productions (Σ runs non annulés = 7, annulé exclu ; cible ; présence/absence de commande).
- **Suite complète** : `584 passed, 1 skipped` (aucune régression sur `test_production_stock`, `test_costing`, `test_feeder_load`, etc.).

## Preuves — `docs/prompts/preuves/015/`

- `staging_dashboard.txt` — `GET /api/reports/productions-summary` sur la branche : 3 productions (~250 ms) / 4 avec `include_finished`, valeurs cohérentes (cible/produit/révisions/can_produce/machine).
- `015-dashboard-staging.jpg` — Tableau de bord staging :8001 rendu sur le backend optimisé (4 productions, « en cours » cohérentes : 0/63, 0/2, 0/30 cartes ; 85/21/3 manques).

## Réserve

- La réservation inter-productions (`_reserved_by_others`) reste appelée par production mais bénéficie désormais du `lookup` Component partagé (plus de full-scan répété). Un batch complet du calcul de réservation reste un incrément possible ultérieur (algorithmique, hors périmètre bas-risque de cette PR) — la parité des résultats est garantie et prouvée par les tests.
