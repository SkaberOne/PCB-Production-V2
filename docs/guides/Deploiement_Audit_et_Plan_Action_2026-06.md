# Déploiement — Audit de préparation & plan d'action

**Date : 2026-06-04** · Portée : passage de l'app de « dev local » à « déployable au travail »
Cible retenue : **multi-postes, base SQL Server centralisée** · Document à mettre en œuvre plus tard.

> Ce document est un **plan**, pas une implémentation. Il sert de feuille de route pour packager l'app en exécutable simple à installer + un système de mise à jour, en anticipant les fonctionnalités encore à développer (notamment Machine PnP).

---

## 1. Résumé exécutif

L'application **fonctionne et est stable en usage** (cf. `docs/audits/Audit_2026-06-04_complet_pre_deploiement.md`), mais **n'est pas encore déployable en l'état**. Quatre verrous structurels :

1. **L'exécutable Electron ne lance pas le backend Python** — il charge seulement le build React et tape une URL backend figée. Sans backend démarré à côté, l'app affiche « Backend non disponible ». Un déploiement « double-clic » exige qu'Electron démarre lui-même le backend.
2. **Aucun système de mise à jour** — pas d'`electron-updater`, build configuré en `--publish never`. Impossible de pousser des correctifs sans réinstallation manuelle.
3. **Sécurité non durcie pour la prod** — auth API désactivée par défaut (le `.bat` force `set API_KEY=`), CORS large, pas de gestionnaire d'exception global, pas de limite d'upload, `/docs` exposé.
4. **Base de données** — la cible est SQL Server centralisé, mais aujourd'hui l'app retombe en SQLite et ne **fail-fast** pas si SQL Server est injoignable ; le mot de passe n'est pas URL-encodé.

**Bonne nouvelle confirmée empiriquement** : le « gel » des pages BOM était un artefact du serveur de développement (compilation à la volée), **absent en build de production**. Aucun refactor de perf n'est requis avant déploiement.

**Effort estimé** jusqu'à une première diffusion interne contrôlée : **~4 à 6 jours de dev** répartis sur les phases ci-dessous (hors signature de code et hors fonctionnalités métier).

---

## 2. Cible d'architecture retenue

Mono-application de bureau Windows distribuée en exécutable, **chaque poste** exécutant son frontend + son backend local, **tous connectés à un SQL Server central** :

```
┌──────────────── Poste utilisateur (Windows) ────────────────┐
│  PCB Flow Production Suite.exe (Electron)                       │
│   ├─ Fenêtre = build React (chargé en local, file://)       │
│   └─ spawn → pcb-flow-server.exe (FastAPI packagé PyInstaller)   │
│        écoute 127.0.0.1:<port libre>                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ ODBC Driver 17
                            ▼
                 ┌──────────────────────┐
                 │   SQL Server central  │  ← schéma versionné (Alembic)
                 │   (1 base partagée)   │
                 └──────────────────────┘
        Releases (installeur + latest.yml) ──▶ electron-updater
```

Justification : chaque poste reste autonome côté UI/API (pas de serveur applicatif central à maintenir), seule la **donnée** est centralisée. La mise à jour pousse le couple {frontend + backend packagé} d'un bloc.

---

## 3. Audit de l'existant — écarts à combler

| # | Écart | Détail / fichier | Sévérité |
|---|---|---|---|
| D1 | Electron ne démarre pas le backend | `client/src/desktop/src/main.js` charge seulement le renderer | **Bloquant** |
| D2 | Backend non packagé | dépend de `.venv` + `pip install` chez l'utilisateur | **Bloquant** |
| D3 | Pas d'auto-update | pas d'`electron-updater` ; `electron-builder` en `--publish never` | **Bloquant** |
| D4 | URL backend figée au build | `REACT_APP_API_URL` baké ; port 8000 en dur | Majeur |
| D5 | Auth API désactivée | `DEMARRER_SERVEUR.bat:8` `set API_KEY=` ; `auth.py:41` ouvre tout si clé vide ; comparaison `!=` non constant-time | **Bloquant (sécurité)** |
| D6 | CORS n'inclut pas l'origine de prod | confirmé en test : build servi hors `:3000` → « Network Error » ; `app.py` CORS large + `credentials=True` | Majeur |
| D7 | DB : pas de fail-fast SQL Server | `database.py` retombe en SQLite ; mot de passe non URL-encodé (`config.py`) | **Bloquant** |
| D8 | Pas de gestionnaire d'exception global | les 500 renvoient `str(exc)` (fuite d'info) | Majeur |
| D9 | Pas de limite de taille d'upload | `await file.read()` charge tout en RAM | Majeur |
| D10 | `/docs` et `/redoc` exposés | cartographie API en prod | Mineur |
| D11 | Flags dev dans le build | `DANGEROUSLY_DISABLE_HOST_CHECK=true` ne doit pas finir en prod | Majeur |
| D12 | Build non reproductible | `client.env` absent du repo (pas de `.example`) | Mineur |
| D13 | Electron : surface d'attaque | menu `toggleDevTools`/`reload` en prod, pas de CSP / `will-navigate` / `setWindowOpenHandler` | Mineur |
| D14 | Migrations non jouées au démarrage | Alembic existe mais pas d'`upgrade head` au boot → schéma désynchronisé après update | Majeur |

---

## 4. Plan d'action par phases

Ordre conçu pour livrer un exécutable **fonctionnel d'abord**, **sûr ensuite**, **auto-updatable enfin**.

### Phase A — Rendre l'app autonome (lève D1, D2, D4) · ~1,5 j
1. **Packager le backend** avec PyInstaller → `pcb-flow-server.exe` (onedir recommandé pour le démarrage rapide + drivers ODBC). Inclure les fichiers de migration Alembic.
2. **Electron démarre le backend** : dans `app.whenReady`, `child_process.spawn(pcb-flow-server.exe)` sur `127.0.0.1` + **port libre détecté dynamiquement**, transmis au renderer via `preload` (`contextBridge`).
3. **Health-check** : attendre `GET /api/health` 200 (avec timeout + écran d'attente) avant d'afficher la fenêtre principale.
4. **Teardown** : `app.on('before-quit')` → tuer le process backend (et nettoyer en cas de crash).
5. **URL backend runtime** : le renderer lit l'URL/port injecté par Electron au lieu de `REACT_APP_API_URL` baké.

**Critère de sortie** : double-clic sur l'exe (machine sans Python) → l'app démarre et charge des données.

### Phase B — Durcissement production (lève D5, D6, D7, D8, D9, D10, D11) · ~1,5 j
6. **Auth obligatoire** : générer une `API_KEY` au premier lancement (stockée côté serveur, hors dépôt), comparaison `hmac.compare_digest`. Retirer `set API_KEY=` du `.bat`. Le renderer envoie la clé (injectée par Electron, jamais en dur dans le bundle).
7. **CORS prod** : restreindre aux origines réellement utilisées (l'app charge en `file://` → privilégier `127.0.0.1` only ; pas de `*`). Documenter que tout changement d'origine doit être whitelisté (cause du « Network Error » constaté).
8. **DB fail-fast** : si `DB_TYPE=sqlserver` et connexion KO → erreur explicite au boot (pas de bascule SQLite silencieuse). **URL-encoder** le mot de passe.
9. **Gestionnaire d'exception global** : `@app.exception_handler(Exception)` renvoyant un message générique + log serveur (ne pas exposer `str(exc)`).
10. **Limite d'upload** : refuser au-delà d'un seuil (ex. 10–25 Mo) ; streamer plutôt que `read()` tout en RAM ; nettoyer les tempfiles.
11. **Désactiver `/docs` et `/redoc`** en prod (conditionner à une variable d'env).
12. **Build prod propre** : retirer `DANGEROUSLY_DISABLE_HOST_CHECK` et tout flag dev du bundle de production.

### Phase C — Packaging exécutable (lève D12, D13) · ~1 j
13. `electron-builder` cible **NSIS** (installeur avec raccourcis — déjà configuré) **et** portable. Embarquer `pcb-flow-server.exe` via `extraResources`.
14. **Durcir Electron** : retirer `toggleDevTools`/`reload` du menu prod, ajouter `setWindowOpenHandler` (refuser les fenêtres externes), `will-navigate` (bloquer la navigation hors app), une CSP.
15. **Versionner `client.env.example`** ; documenter la config runtime (URL/port backend, connexion DB) éditable **après** installation sans rebuild.

### Phase D — Système de mise à jour (lève D3) · ~1 j
16. Ajouter **`electron-updater`** + configurer `electron-builder` `publish: github` (ou serveur HTTP générique / S3 si dépôt privé souhaité).
17. **Auto-update au démarrage** : `autoUpdater.checkForUpdatesAndNotify()` + **bouton manuel** « Rechercher les mises à jour » (menu Aide ou écran Paramètres) avec barre de progression et « Redémarrer pour installer ».
18. **Pipeline de release** : bump SemVer dans `client/src/desktop/package.json` → `electron-builder` publie installeurs + `latest.yml`. Un **PAT GitHub** (scope `repo`) sert au publish.
19. **Canaux** : prévoir un canal `beta` (`"version":"x.y.z-beta"` + `generateUpdatesFilesForAllChannels:true`) pour tester avant promotion en `latest`.

### Phase E — Migrations & données (lève D14) · ~0,5 j
20. **`alembic upgrade head` au démarrage du backend** (idempotent) → le schéma se met à jour automatiquement après chaque update applicatif.
21. **Stratégie de migration sûre** sur base partagée : migrations **additives et rétro-compatibles** (cf. §6) pour ne pas casser un poste resté sur l'ancienne version pendant un déploiement progressif.
22. **Reprise des données** : importer la base de production existante (l'ancienne DB SQLite mentionnée dans le CHANGELOG, ou la base SQL Server cible) ; valider les comptes (BOM, composants, machines).

### Phase F — Signature de code (optionnel mais recommandé) · variable
23. Sans certificat, **Windows SmartScreen** avertira au premier lancement. Un certificat **OV/EV** supprime l'avertissement. À budgéter si distribution large ; non bloquant pour une diffusion interne contrôlée.

---

## 5. Système de mise à jour — détail

- **Approche** (confirmée à jour 2026) : `electron-updater` + `electron-builder` + **GitHub Releases**. À chaque release, `electron-builder` publie automatiquement installeurs **et** `latest.yml` (métadonnées requises par l'updater).
- **Ce qui est mis à jour** : l'app Electron embarque frontend **et** `pcb-flow-server.exe` → une mise à jour pousse **les deux d'un bloc** (cohérence frontend/backend garantie).
- **Migrations** : jouées au boot du backend packagé après mise à jour (Phase E). Toujours **rétro-compatibles** tant que des postes peuvent être sur l'ancienne version.
- **Versionnage** : SemVer. `MAJOR` = rupture (schéma/contrat), `MINOR` = fonctionnalité, `PATCH` = correctif. Aujourd'hui `1.0.0`.
- **Hébergement** : GitHub Releases (simple) ; alternative serveur HTTP générique / S3 pour du privé.
- **Votre workflow cible** : développer une version stable de votre côté → bump version → `electron-builder` publish → les postes proposent la mise à jour (auto au démarrage + bouton manuel).

---

## 6. Anticiper les fonctionnalités futures

Le déploiement doit être conçu pour **accueillir** ce qui n'est pas encore développé (Machine PnP en tête), sans re-packager l'architecture à chaque fois.

- **Feature flags** : livrer les fonctionnalités incomplètes (plan d'implantation feeders, slot-strip, validation d'ordre de fabrication) **désactivées par défaut**, activables par config runtime. Permet de publier des versions stables tout en continuant à développer Machine PnP sans exposer du demi-fini aux utilisateurs.
- **Discipline de migration DB** : chaque nouvelle fonctionnalité ajoutant des tables/colonnes passe par **une migration Alembic additive et rétro-compatible** (ajouter, ne pas renommer/supprimer en une étape ; faire les suppressions en 2 releases). Indispensable sur base SQL Server partagée avec déploiement progressif des postes.
- **Versionner le contrat API** : un poste à jour et un poste en retard taperont la même base ; garder les endpoints rétro-compatibles (champs optionnels, pas de suppression brutale). Envisager un préfixe `/api/v1` pour figer le contrat.
- **Config runtime, pas au build** : URL/port backend, connexion DB, et **flags de fonctionnalités** doivent être lus à l'exécution (fichier de config éditable post-install) — jamais bakés dans le bundle. Évite un rebuild pour un simple paramètre.
- **Décider le sort du code mort Machine PnP AVANT d'y développer** : ~1 500 lignes d'une 2e implémentation non branchée (cf. audit §4.5). À trancher (supprimer ou réintégrer) pour ne pas packager du code mort ni « réparer la mauvaise version ».
- **Remontée d'erreurs terrain** : prévoir un minimum de journalisation/erreurs (log local + éventuel reporting opt-in). En multi-postes, c'est le seul moyen de savoir ce qui casse réellement chez les utilisateurs après un update.
- **Compatibilité ascendante des sessions** : la persistance locale de session (`BomSessionContext`, TTL 30 j) doit tolérer un changement de schéma de données entre versions (migration/ignore des données legacy), pour qu'une mise à jour n'invalide pas le travail en cours.

---

## 7. Check-list avant la première diffusion

- [ ] Exe lancé sur une machine **sans Python ni Node** → démarre et charge des données.
- [ ] Backend tué proprement à la fermeture (pas de process orphelin).
- [ ] Auth API active ; aucune clé en dur dans le bundle.
- [ ] SQL Server : connexion OK + **fail-fast** si injoignable ; mot de passe à caractères spéciaux testé.
- [ ] `alembic upgrade head` joué au boot ; base de prod reprise et comptes validés.
- [ ] CORS restreint ; `/docs` désactivé ; pas de flag dev dans le bundle.
- [ ] Cycle complet testé : **install → usage → publication d'un patch → auto-update → redémarrage**.
- [ ] Bouton « Rechercher les mises à jour » fonctionnel + auto-update au démarrage.
- [ ] Rollback documenté (réinstaller la version précédente / `latest.yml` antérieur).
- [ ] (Optionnel) Installeur signé ou consigne SmartScreen communiquée aux utilisateurs.

> Utiliser `engineering:deploy-checklist` pour la revue finale juste avant publication.

---

## 8. Risques (pré-mortem)

- **🐯 Tiger — Migration DB qui casse un poste en retard.** Une migration non rétro-compatible appliquée par un poste à jour rend la base inutilisable pour les postes anciens. → Migrations additives + déploiement coordonné.
- **🐯 Tiger — Backend packagé qui ne trouve pas l'ODBC Driver 17.** PyInstaller n'embarque pas les drivers système. → Documenter le prérequis ODBC ou l'inclure/installer.
- **🐅 Paper Tiger — SmartScreen au 1er lancement.** Effrayant mais non bloquant ; résolu par signature ou consigne utilisateur.
- **🐘 Elephant — Discipline de versionnage/migration dans la durée.** Le vrai enjeu n'est pas le 1er déploiement mais la **série de mises à jour** : sans rigueur SemVer + migrations rétro-compatibles, la dette s'accumule vite en multi-postes.

---

## 9. Décisions à acter (futurs ADR)

À formaliser via `engineering:architecture` avant implémentation :

1. **ADR — Packaging & lancement** : PyInstaller (onedir/onefile) + spawn Electron + détection de port + teardown. (Met à jour/complète l'approche mono-repo de l'ADR 0001.)
2. **ADR — Système de mise à jour** : electron-updater + GitHub Releases (ou hébergement privé), canaux `latest`/`beta`, politique SemVer.
3. **ADR — Stratégie de base partagée** : SQL Server central, migrations additives, compatibilité ascendante de l'API, feature flags.

---

## Annexe — Effort indicatif

| Phase | Contenu | Effort |
|---|---|---|
| A | App autonome (backend packagé + spawn) | ~1,5 j |
| B | Durcissement prod (auth, CORS, DB, exceptions…) | ~1,5 j |
| C | Packaging exe + durcissement Electron | ~1 j |
| D | Auto-update (electron-updater + pipeline) | ~1 j |
| E | Migrations au boot + reprise données | ~0,5 j |
| F | Signature de code | variable (optionnel) |
| **Total** | jusqu'à 1re diffusion interne contrôlée | **~4–6 j** |

*Hors développement des fonctionnalités métier restantes (Machine PnP), qui suivent leur propre planning et bénéficient des feature flags décrits au §6.*
