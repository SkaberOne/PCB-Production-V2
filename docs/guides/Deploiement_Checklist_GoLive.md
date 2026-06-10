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

1. [x] **Git** : PR #5 mergée dans `dev` (CI verte), branche supprimée. ✅
2. [x] **App installée en solo SQLite** sur le poste (raccourci Bureau, données
   chargées). Le build d'installeur ne demande **pas** d'admin (les scripts
   posent `CSC_IDENTITY_AUTO_DISCOVERY=false`). ✅
3. [ ] **SQL Server central** : provisionner l'instance + base `ECB_Production`,
   installer **ODBC Driver 17** sur chaque poste.
4. [ ] **Config par poste** : renseigner `%APPDATA%\PCB Flow Production Suite\server\.env`
   (hôte/identifiants SQL Server). Le fichier est semé au 1ᵉʳ lancement.
5. [ ] **Reprise des données** : démarrer le backend une fois (schéma créé) puis
   `python import_data.py "<ancienne dev.db>"` ; valider les comptes (BOM,
   composants, machines) dans l'app.
6. [x] **Releases publiées** : v1.0.0 + v1.0.1 sur GitHub (dépôt rendu **public**
   → auto-update fonctionnel sans jeton côté postes). ✅
7. [x] **Auto-update testé** : l'app installée est passée seule de 1.0.0 → 1.0.1
   (détection + téléchargement + installation). ✅
8. [ ] (Optionnel) **Signature** OV/EV pour supprimer l'avertissement SmartScreen.
9. [ ] **Rollback** : réinstaller l'installeur de la version précédente (Releases).

## À reprendre plus tard (note dev — 2026-06-10)

> **Redémarrage automatique après mise à jour.** Le correctif est commité
> (`main.js` → `quitAndInstall(false, true)`, commit `b1fdee7`), mais il n'entrera
> en vigueur qu'à partir de la version **qui exécute** la mise à jour. L'app
> installée (1.0.1) garde l'ancien comportement : la prochaine MAJ (vers 1.0.2)
> s'installera mais demandera une relance manuelle ; **à partir de 1.0.2, les MAJ
> se relanceront seules**. → Publier une **v1.0.2** quand on reprendra ce point
> (bump version + `npm run publish` + publier le brouillon Release).

## Rappels de discipline (durée)

- Migrations **additives et rétro-compatibles** uniquement (base partagée).
- **SemVer** : MAJOR = rupture schéma/contrat, MINOR = feature, PATCH = correctif.
- Fonctionnalités en cours livrées derrière **feature flags** désactivés.
