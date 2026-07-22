# Tests E2E Playwright — parcours critiques (prompt 004)

Vrais tests bout-en-bout : ils ouvrent l'application réelle (build front servi
par le backend), cliquent et vérifient. Complètent les tests **de composants**
Jest (`npm test`), qui ne pilotent jamais l'app assemblée.

## Ce qui est couvert (parcours critiques initiaux, extensibles)

- **Smoke / navigation** (`tests/smoke.spec.js`) : l'app démarre (backend SQLite
  + build front) ; la navigation latérale Import BOM → Revue BOM fonctionne.
- **Import BOM** (`tests/import-review.spec.js`) : upload d'un fichier BOM `.txt`
  → parsing → import dans la session (résolution des composants absents listée).

> Extension (à venir) : Revue peuplée + portée valeur/footprint bout-en-bout —
> nécessite de **seeder la bibliothèque de composants** (sinon l'import ouvre la
> résolution des composants absents). Le comportement du dialog de portée est déjà
> couvert par les tests Jest `BomReviewTab.valueScope` / `.footprintScope`.

## Prérequis

- **Backend** : dépendances Python installées (`pip install -r serveur/requirements.txt`).
- **Front** : build e2e généré (voir ci-dessous).
- **Playwright** : `cd e2e && npm install`. Chromium : en environnement orchestrateur,
  `PLAYWRIGHT_BROWSERS_PATH` fournit déjà le navigateur (ne pas re-télécharger). En
  CI, `npx playwright install --with-deps chromium`.

## Lancer en local (stack de test SQLite, sans LAN)

```bash
# 1) Build front e2e (sortie dédiée build-e2e)
cd client/src/frontend
BUILD_PATH=build-e2e REACT_APP_API_URL=/api CI=false npm run build

# 2) Tests E2E : Playwright démarre le backend (SQLite) qui sert le build
cd ../../../e2e
npm install
npx playwright test            # rapport HTML : npx playwright show-report
```

Le backend est démarré automatiquement par Playwright (`webServer` de
`playwright.config.js`) en SQLite éphémère (`e2e_test.db`) sur le port `E2E_PORT`
(8099 par défaut), mode ouvert (pas de clé API). Aucun accès LAN requis.

`scripts/run-e2e-local.sh` enchaîne build + tests.

## Lancer contre une instance déjà démarrée (ex. staging :8001)

```bash
PW_BASE_URL=http://LAPTOP-053:8001 npx playwright test
```
(dans ce mode, Playwright ne démarre pas de backend.)

## CI

Le workflow est fourni en **modèle** `e2e/ci-e2e.workflow.yml.example` (le chemin
`.github/workflows/` est protégé côté orchestrateur) : à copier en
`.github/workflows/e2e.yml`. Il démarre la **stack dans le runner** (backend SQLite
+ build front) et joue la suite, en `workflow_dispatch` (manuel) — à basculer en
garde de PR une fois validé par un premier run Actions (cf. échange E03).
