# RÉSULTAT — [013] fix(backend) : bugs correctness (capacité machine, auto_assign, delete_production)

- **Statut** : ✅ terminé
- **Branche** : `fix/correctness-backend` (depuis `dev` à jour — audit 013-018 mergé)
- **PR** : [#91](https://github.com/SkaberOne/PCB-Production-V2/pull/91) vers `dev`
- **Type** : backend uniquement — **aucun changement front** (donc pas de nouvel écran à capturer)

## Ce qui a été fait (4 correctifs, chacun avec test de non-régression)

### 1+2. `assignment_planning.py` — `check_machine_capacity` (≈ ligne 1061)
- Interrogeait `PnpCart` avec un id de `PnpMachine` → remplacé par `db.query(PnpMachine)` (import `PnpMachine` déjà présent). `machine.num_positions` redevient valide.
- `num_assignments` valait `len(query(ProductionPlan).filter(id==plan_id).all())` (donc 0 ou 1, jamais le vrai nombre) → remplacé par un **count des `PlanAssignment` du plan** :
  `db.query(PlanAssignment).filter(PlanAssignment.production_plan_id == plan_id).count()`.
- `capacity_utilization` protégé contre la **division par zéro** quand `num_positions == 0`.

### 3. `production_service.py` — `auto_assign_components` (≈ ligne 194)
- Ne tronque plus silencieusement via `zip` quand la capacité est insuffisante : **lève `ValueError`** (comme le promet la docstring) en listant les composants non assignables (référence ou id).

### 4. `production_workspace_service.py` — `delete_production` (≈ ligne 622)
- Purge désormais **`ProductionComponentProgress`** puis **`ProductionRun`** (FK NOT NULL, sans cascade) **avant** `db.delete(production)` → plus d'`IntegrityError` en prod SQL Server (bug de classe T-009).
- **`StockMovement` volontairement NON supprimés** : leur `production_run_id` est *nullable* et **sans contrainte FK** ; le journal de stock est la source de vérité, on préserve l'historique (décision documentée en commentaire dans le service).

## Tests

- **pytest ciblé** — `serveur/src/tests/test_correctness_013.py` (5 tests, capture dans `docs/prompts/preuves/013/pytest_correctness_013.txt`) :
  - `check_machine_capacity` : valeurs cohérentes sur un plan avec 2 `PlanAssignment` réels (positions=4 → 2 assignées, 2 libres, 50 %).
  - sur-capacité correctement signalée (`has_capacity False`, `available_positions` négatif).
  - `num_positions == 0` → pas de division par zéro (`capacity_utilization == 0.0`).
  - `auto_assign_components` → `ValueError "Capacite machine insuffisante"` (2 composants pour 1 position).
  - **delete FK** : `PRAGMA foreign_keys=ON`, on déclare `ProductionRun` + `ProductionComponentProgress` puis on supprime la production → **succès sans FK error**, enfants purgés.
- **Suite complète** : `573 passed, 1 skipped` (le skip = test obsolète `test_reports.py:149`, sans rapport).

## Preuves — `docs/prompts/preuves/013/`

- `pytest_correctness_013.txt` — sortie `-v` des 5 tests de non-régression (tous PASSED).
- La CI (pytest + npm) et le gate **E2E Playwright** sur la PR #91 rejouent la stack complète (voir onglet Checks de la PR).

## Réserve — captures staging

013 est **backend pur, sans changement d'UI** : il n'y a aucun nouvel écran à montrer. Le comportement corrigé est verrouillé par les 5 tests ci-dessus (dont le delete avec FK **activées**, qui reproduit le comportement prod SQL Server) et par le gate E2E. Aucune capture d'écran front n'apporterait de preuve supplémentaire par rapport au test FK.
