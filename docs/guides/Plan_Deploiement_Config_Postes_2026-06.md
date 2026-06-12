# Plan d'implémentation — Déploiement assisté (config in-app + Client/Host)

> Décisions : `docs/adr/0009-deploiement-config-postes-client-host.md`.
> Établi 2026-06-12. Choix Eric : Host **tout automatique**, ODBC **pendant
> l'install NSIS**, **ADR + plan d'abord**.

## Objectif

Mettre en service un poste sans éditer de fichier : panneau de config DB dans
l'app, ODBC embarqué et posé par l'installeur, et un choix **Client / Host** où le
Host provisionne tout le côté serveur (SQL Server Express + réseau + base).

## Découpage en 3 phases (incrémental, valeur livrée tôt)

Chaque phase est **mergeable seule** dans `dev` (CI verte) et utile
indépendamment. Branche unique recommandée : `feat/deploiement-config-postes`,
ou une branche par phase si tu préfères des PR plus petites.

---

### Phase 1 — Panneau de config DB in-app (aucun changement d'installeur)

**Valeur** : remplace l'édition manuelle du `.env`. Testable **sans admin**, sans
toucher au build. À livrer en premier.

**Backend** — `serveur/` :
- Ajouter un mode CLI **`--check-db`** au point d'entrée packagé
  (`launch.py` ou le wrapper PyInstaller) : lit l'env, tente la connexion en
  réutilisant `config.py`/`database.py`, imprime `{"ok":bool,"engine":str,"detail":str}`
  sur stdout, `sys.exit(0|1)`. **Ne démarre pas** le serveur HTTP.
- (Optionnel) endpoint `GET /api/health/db` renvoyant moteur + état, pour le
  voyant quand le backend tourne déjà.
- Tests : `serveur/src/tests/test_check_db_cli.py` (SQLite ok → exit 0 ;
  cible SQL injoignable → exit 1, JSON `ok:false`).

**Electron** — `client/src/desktop/src/main.js` + `preload.js` :
- `main.js` : helpers `readEnvConfig()` / `patchEnvConfig(partial)` opérant sur
  `PCBFLOW_DATA_DIR/.env` — **patch ligne à ligne** des clés `SQL_SERVER_*`,
  préserve le reste. Handlers IPC :
  - `ecb:db-config:get` → renvoie host/port/user/database/driver + `passwordSet:bool`.
  - `ecb:db-config:save` → patch `.env` puis (si demandé) restart backend.
  - `ecb:db-config:test` → écrit un `.env` temporaire, spawn `pcb-flow-server.exe
    --check-db`, parse le JSON, renvoie le résultat ; pré-test TCP `net.connect`.
  - `ecb:db-config:restart` → `stopBackend()` + `startBackend()` +
    `waitForHealth`, renvoie `{ok}` ou la cause d'échec (capturer stderr backend).
  - Remonter la **cause d'échec de boot** au renderer (stocker la dernière erreur).
- `preload.js` : exposer `electronAPI.dbConfig = { get, save, test, restart }`
  (via `ipcRenderer.invoke`, pas `sendSync`, pour les ops longues).
- ⚠️ Penser à capturer la sortie backend : aujourd'hui `spawn(..., {stdio:'ignore'})`.
  Passer `stdio:['ignore','pipe','pipe']` pour pouvoir afficher la cause d'échec.

**React** — `client/src/frontend/src/` :
- Nouveau `components/common/DatabaseSettings.jsx` :
  champs Hôte / Port / Utilisateur / Mot de passe (masqué, write-only) / Base /
  Pilote (lecture seule). Boutons **Tester** et **Enregistrer & redémarrer**.
  Voyant d'état (Connecté / Port injoignable / Backend KO + message).
  Garde : si `window.electronAPI?.dbConfig` absent → carte lecture seule
  « configurable uniquement dans l'application installée ».
- `pages/SettingsPage.jsx` : ajouter une `SettingsSection`
  icône `StorageRoundedIcon`, titre « Connexion base de données », contenant
  `<DatabaseSettings/>`. La placer en tête (config la plus structurante).
- Tests : `__tests__/DatabaseSettings.test.jsx` (rendu, masquage mdp, appel des
  IPC mockés, états du voyant).

**Critères de sortie Phase 1** : pytest + npm test verts ; sur app installée,
modifier l'hôte SQL → Tester → Enregistrer → l'app redémarre et se connecte.

---

### Phase 2 — Embarquer l'ODBC Driver 17, posé par NSIS

**Valeur** : plus d'install ODBC oubliée. **⚠️ l'installeur passe en mode admin.**

- Récupérer `msodbcsql.msi` (x64, v17) → `client/src/desktop/installers/msodbcsql_17.msi`.
- `package.json` (bloc `build`) :
  - ajouter aux ressources embarquées (ex. `extraResources` →
    `{ "from": "installers/msodbcsql_17.msi", "to": "msodbcsql_17.msi" }`).
  - `build.nsis` : `"include": "build/installer.nsh"`, élévation admin
    (`"perMachine": true` ou `RequestExecutionLevel admin` dans le .nsh),
    conserver `oneClick:false`, `allowToChangeInstallationDirectory:true`.
- `client/src/desktop/build/installer.nsh` — macro `customInstall` :
  - check registre `HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server` ;
    si absent → `ExecWait 'msiexec /i "$INSTDIR\resources\msodbcsql_17.msi" /qn
    IACCEPTMSODBCSQLLICENSETERMS=YES ADDLOCAL=ALL'`.
  - journaliser le code retour ; ne pas faire échouer toute l'install si le MSI
    renvoie « déjà installé ».
- Docs : corriger `DEPLOYMENT.md` et `Deploiement_Checklist_GoLive.md` (la mention
  « pas besoin d'administrateur » n'est plus vraie ; ODBC désormais auto).

**Critères de sortie Phase 2** : `npm run dist` produit un installeur qui, sur un
poste vierge (ODBC absent), pose le pilote ; sur un poste déjà équipé, saute
l'étape sans erreur.

---

### Phase 3 — Choix Client / Host + provisioning serveur (Host)

**Valeur** : un poste Host auto-configuré. **La plus complexe, gros test Windows.**

- `installer.nsh` — **page custom nsDialogs** (radio Client / Host) après le choix
  du dossier ; mémoriser le rôle (`HKCU\Software\ECB\PCBFlow\Role`).
- `customInstall` étendu :
  - **toujours** : ODBC (Phase 2).
  - **Client** : semer `.env` avec `SQL_SERVER_HOST` vide ; fin.
  - **Host** : `ExecWait` élevé de `provision_host.ps1`
    (`powershell -ExecutionPolicy Bypass -File "$INSTDIR\resources\provision_host.ps1"
    -DbPassword … -AppPassword …`).
- `client/src/desktop/build/provision_host.ps1` — **idempotent, journalisé**
  (`%PROGRAMDATA%\PCBFlow\provision.log`) :
  1. Détecter SQL Express ; sinon **télécharger** le bootstrapper Microsoft (URL
     stable) ou utiliser `-LocalInstaller` ; install silencieuse
     (`/QS /ACTION=Install /FEATURES=SQLENGINE /INSTANCENAME=SQLEXPRESS
     /SECURITYMODE=SQL /SAPWD /TCPENABLED=1 /IACCEPTSQLSERVERLICENSETERMS`).
  2. Port **1433 fixe** : détecter `MSSQLxx`, écrire registre `…\SuperSocketNetLib\
     Tcp\IPAll` (`TcpPort=1433`, vider `TcpDynamicPorts`), redémarrer le service.
  3. Pare-feu : `netsh advfirewall firewall add rule name="PCBFlow SQL 1433"
     dir=in action=allow protocol=TCP localport=1433` (scope LAN).
  4. `sqlcmd` : `CREATE DATABASE ECB_Production` + login dédié `pcbflow`
     (db_owner sur cette base **uniquement**, pas `sa`).
  5. Semer le `.env` Host (`SQL_SERVER_HOST=localhost`, login dédié, base).
  - Chaque étape **vérifie l'état avant d'agir** (re-run sûr) ; échec → log +
    message clair + lien vers le guide manuel de secours.
- Tester de bout en bout sur une **VM Windows propre** (Client ET Host).

**Critères de sortie Phase 3** : sur VM vierge, install Host → SQL Express up,
1433 ouvert, base créée, app connectée ; install Client sur 2ᵉ VM → pointe le Host
via le panneau Phase 1 et partage les données.

---

## Fichiers touchés (récap)

| Couche | Fichier | Nature |
|---|---|---|
| Backend | `serveur/launch.py` (ou entrée PyInstaller) | + mode `--check-db` |
| Backend | `serveur/src/routes/…` | (opt.) `GET /api/health/db` |
| Backend | `serveur/src/tests/test_check_db_cli.py` | nouveau |
| Electron | `client/src/desktop/src/main.js` | IPC config + restart + capture stderr |
| Electron | `client/src/desktop/src/preload.js` | `electronAPI.dbConfig` |
| Electron | `client/src/desktop/package.json` | ressources ODBC + `build.nsis.include` + admin |
| Electron | `client/src/desktop/build/installer.nsh` | nouveau (page Client/Host + customInstall) |
| Electron | `client/src/desktop/build/provision_host.ps1` | nouveau (provisioning Host) |
| Electron | `client/src/desktop/installers/msodbcsql_17.msi` | binaire embarqué |
| React | `client/src/frontend/src/components/common/DatabaseSettings.jsx` | nouveau |
| React | `client/src/frontend/src/pages/SettingsPage.jsx` | + section DB |
| React | `…/__tests__/DatabaseSettings.test.jsx` | nouveau |
| Docs | `DEPLOYMENT.md`, `Deploiement_Checklist_GoLive.md` | MAJ (admin, ODBC auto, rôles) |

## Risques & points de vigilance

- **Build/test = Windows uniquement** : NSIS et PowerShell ne se testent pas dans
  le sandbox. Phases 2-3 buildées et validées par Eric sous Windows (VM propre
  recommandée).
- **Capture stderr backend** : sans elle, le panneau ne pourra pas expliquer un
  échec de connexion. Modifier le `spawn` (`stdio` pipe) est un prérequis Phase 1.
- **Élévation admin** : à partir de Phase 2, l'installeur déclenche l'UAC →
  communiquer aux utilisateurs.
- **Versions SQL Express** : `provision_host.ps1` doit détecter `MSSQL15/16…`
  dynamiquement, jamais en dur.
- **Repli manuel conservé** : le guide pas-à-pas SQL Server reste la voie de
  secours si le provisioning auto échoue sur une config atypique.

## Discipline Git (CLAUDE.md §10)

Branche courte depuis `dev` à jour → commits petits (Conventional Commits) →
pytest + npm test verts en local → PR vers `dev` → CI verte → merge → suppression
de branche. Opérations Git **proposées à Eric** (pas lancées sur le mount sandbox).
