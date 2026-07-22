# RÉSULTAT — [004] tests E2E Playwright

- **Statut** : ⚠ terminé avec réserve (infra + 3 parcours **verts** ; **gate CI** à trancher → échange E03)
- **Branche** : `chore/e2e-playwright` (depuis `dev` à jour)
- **PR** : [#84](https://github.com/SkaberOne/PCB-Production-V2/pull/84) vers `dev` — CI (pytest+npm) verte
- **Échange ouvert** : `docs/prompts/echanges/ouverts/E03-orch-p004-e2e-ci.md` (décision run/gate CI)

## Ce qui a été fait

Vrai filet de sécurité front : une suite **Playwright** dans `e2e/` qui ouvre
l'application assemblée (pas des composants isolés comme `npm test`).

- `e2e/playwright.config.js` : deux modes. Par défaut, Playwright démarre une
  **stack de test locale** (`webServer`) — backend FastAPI en **SQLite éphémère**
  servant le build front `build-e2e`, sur `E2E_PORT` (8099), **sans LAN**. Avec
  `PW_BASE_URL=http://LAPTOP-053:8001`, la suite joue contre une instance déjà
  démarrée (staging). Chromium : `PLAYWRIGHT_BROWSERS_PATH` (orchestrateur) ou
  `npx playwright install` (CI) ; override optionnel `PW_CHROMIUM_PATH`.
- `e2e/tests/smoke.spec.js` (2 tests) : le dashboard se charge ; navigation
  latérale Import BOM → Revue BOM.
- `e2e/tests/import-review.spec.js` (1 test) : upload d'un fichier BOM `.txt`
  → parsing → import (résolution des composants absents listée sur base vierge).
- `e2e/fixtures/E2ETEST_TOP.txt` (fixture BOM, valeurs dupliquées pour la portée),
  `scripts/run-e2e-local.sh` (build + run), `e2e/README.md`.
- `e2e/ci-e2e.workflow.yml.example` : **modèle** de job GitHub Actions (stack dans
  le runner). Le chemin `.github/workflows/` étant protégé côté orchestrateur, il
  est livré en modèle à copier ; sa mise en garde de PR est l'objet de l'échange E03.
- `.gitignore` : `build-e2e/`, `e2e_test.db`, `e2e/node_modules`, rapports.

**Résultat d'exécution** (env orchestrateur, Chromium pré-installé) : **3 passed**
(cf. `docs/prompts/preuves/004/004_playwright_run_3_passed.txt`).

## Décisions / réserves

- **Aucun code applicatif modifié** → `pytest` + `npm test` **inchangés / verts**
  (dossier `e2e/` dédié).
- **Reach « Revue peuplée » + portée valeur/footprint bout-en-bout** : nécessite de
  **seeder la bibliothèque de composants** (sinon l'import ouvre la résolution des
  composants absents). Documenté comme extension ; le comportement du dialog de
  portée est déjà couvert par les tests Jest `BomReviewTab.valueScope` / `.footprintScope`.
- **CI en garde de PR** : non activée par l'orchestrateur (workflow protégé + pas de
  déclenchement Actions possible de mon côté). Modèle fourni + **échange E03** pour
  trancher (a) gate CI vs (b) run hors-CI par l'orchestrateur.

## Tests

- **Playwright** (local/orchestrateur) : `smoke` (2) + `import` (1) = **3 verts**.
- **pytest** + **npm test** : inchangés (aucun code applicatif touché sur cette branche).
