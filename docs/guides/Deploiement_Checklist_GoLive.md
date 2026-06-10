# Check-list de mise en service — PCB Flow Production Suite

> Établie 2026-06-10 après implémentation des phases A→F.
> Détail technique : `DEPLOYMENT.md`. Décisions : ADR 0006/0007/0008.

## Déjà validé (par tests réels sur Windows)

- [x] **App autonome** : le `.exe` packagé démarre sans Python et charge des
  données (backend embarqué lancé par Electron sur un port dynamique).
- [x] **Teardown** : le backend est tué à la fermeture (0 process orphelin).
- [x] **Auth obligatoire** : clé de session générée par Electron, jamais en dur ;
  sans clé → 401, bonne clé → 200 (validé app + TestClient).
- [x] **/docs et /redoc désactivés** en production (404).
- [x] **Fail-fast DB** : sans base configurée, l'app installée affiche
  « Backend indisponible » (pas de bascule SQLite silencieuse).
- [x] **Limite d'upload** (25 Mo → 413) et **erreurs 500 génériques**.
- [x] **Durcissement Electron** : CSP active (app fonctionnelle), DevTools coupés
  en prod (`Ctrl+Shift+I` sans effet), pas de pop-up / navigation externe.
- [x] **Migrations au boot** : schéma créé sur base neuve (create_all + stamp
  head) ou mis à niveau (upgrade head) ; reprise de données validée (3161 lignes).
- [x] **Installeur** NSIS + portable construits (`client/src/desktop/dist`).
- [x] **Auto-update** intégré (non bloquant ; vérif au démarrage + bouton manuel).
- [x] **Tests backend** : 372 passés / 1 ignoré. Les **9 échecs** restants sont
  tous dans `test_migrations.py` (chaîne Alembic historique cassée — problème
  **connu et antérieur**, contourné par le bootstrap create_all+stamp ; sans
  impact sur le déploiement).

## À faire par Eric avant/pour la mise en service

1. [ ] **Git** : committer la branche `feat/deploiement-phase-a`, ouvrir la PR
   vers `dev`, attendre la **CI verte**, merger (cf. CLAUDE.md §10).
2. [ ] **Mode Développeur Windows persistant** : se déconnecter/reconnecter une
   fois (ou builder en shell **administrateur**) pour que `npm run dist` passe
   sans l'erreur winCodeSign.
3. [ ] **SQL Server central** : provisionner l'instance + base `ECB_Production`,
   installer **ODBC Driver 17** sur chaque poste.
4. [ ] **Config par poste** : renseigner `%APPDATA%\PCB Flow Production Suite\server\.env`
   (hôte/identifiants SQL Server). Le fichier est semé au 1ᵉʳ lancement.
5. [ ] **Reprise des données** : démarrer le backend une fois (schéma créé) puis
   `python import_data.py "<ancienne dev.db>"` ; valider les comptes (BOM,
   composants, machines) dans l'app.
6. [ ] **Première Release** : bump version, `$env:GH_TOKEN=<PAT repo>`,
   `npm run publish` (shell admin) → installeurs + `latest.yml` sur GitHub.
7. [ ] **Cycle complet** : installer → utiliser → publier un patch → vérifier
   l'auto-update + « Redémarrer pour installer » sur un poste.
8. [ ] (Optionnel) **Signature** OV/EV pour supprimer l'avertissement SmartScreen.
9. [ ] **Rollback** documenté : réinstaller l'installeur de la version précédente.

## Rappels de discipline (durée)

- Migrations **additives et rétro-compatibles** uniquement (base partagée).
- **SemVer** : MAJOR = rupture schéma/contrat, MINOR = feature, PATCH = correctif.
- Fonctionnalités en cours livrées derrière **feature flags** désactivés.
