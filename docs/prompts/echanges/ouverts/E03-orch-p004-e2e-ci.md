# E03 — [orchestrateur → architecte] Où et comment faire tourner les E2E (prompt 004)

- **Prompt** : 004 (chore/test — E2E Playwright)
- **Type** : décision infra / CI (pas une erreur technique)
- **Statut** : OUVERT (004 livré côté infra ; branche `chore/e2e-playwright`, [PR à venir] vers `dev`)
- **Bloque** : le passage de la suite E2E en **garde de PR** (gate CI). N'empêche pas la livraison de l'infra.

## Contexte / ce qui est déjà livré

Infra Playwright complète dans `e2e/` + **3 tests verts** joués dans l'environnement
orchestrateur (Linux, Chromium pré-installé via `PLAYWRIGHT_BROWSERS_PATH`) :
- `smoke.spec.js` : l'app boote (backend **SQLite** + build front `build-e2e` servi
  par le backend) et la navigation latérale Import BOM → Revue BOM fonctionne ;
- `import-review.spec.js` : upload d'un `.txt` BOM → parsing → import (résolution
  des composants absents listée).

La stack tourne **sans LAN** : Playwright démarre le backend en SQLite éphémère
(`webServer` de `playwright.config.js`). Un mode `PW_BASE_URL=http://LAPTOP-053:8001`
permet aussi de jouer contre le staging.

## Le point à trancher

Je **ne peux pas déclencher un run GitHub Actions** moi-même pour valider le job CI.
J'ai donc livré le workflow en **modèle** `e2e/ci-e2e.workflow.yml.example`
(le chemin `.github/workflows/` est protégé côté orchestrateur) en `workflow_dispatch`,
pour ne pas rendre la CI de la PR rouge tant qu'il n'est pas validé.

Chaque étape du job a été validée **individuellement** dans un runner-like Linux
(pip install `serveur/requirements.txt`, build front `build-e2e`, `npx playwright
install --with-deps chromium`, `npx playwright test`) → le job **devrait** passer.

**Question :** comment veux-tu exécuter les E2E ?

- **(a) Gate CI** — je (ou toi) copie le modèle en `.github/workflows/e2e.yml`, on le
  déclenche une fois en `workflow_dispatch` pour valider, puis on le bascule en
  `on: pull_request` (garde de PR). *Recommandé.* Coût : ~une image runner (pip +
  npm build + download Chromium) par PR, ~5–8 min.
- **(b) Hors-CI** — on garde les E2E lancés **par l'orchestrateur** dans son pipeline
  (env à Chromium pré-installé), pas en garde de PR. Plus léger pour la CI, mais pas
  de filet automatique sur chaque PR.

## Réponse (à remplir par l'architecte)

<!-- RÉPONDU: option (a) ou (b) ; si (a), confirmer qu'on peut ajouter le workflow
     .github/workflows/e2e.yml et le passer en pull_request après un run manuel OK. -->
