# ADR 0009 — Déploiement assisté : config DB in-app + rôle Client/Host à l'installation

**Date** : 2026-06-12
**Statut** : 🟡 Proposé (en attente de validation Eric avant implémentation)
**Décideurs** : Eric (périmètre Host « tout automatique », ODBC pendant l'install, ADR d'abord) · Claude (architecture)
**Référence** : `docs/guides/Plan_Deploiement_Config_Postes_2026-06.md` (plan d'impl.)

---

## Contexte

Le déploiement multi-postes (ADR 0006/0007/0008) fonctionne mais la **mise en
service d'un poste reste manuelle** : installer l'ODBC Driver 17 à la main, puis
éditer `%APPDATA%\PCB Flow Production Suite\server\.env` au bloc-notes pour
renseigner SQL Server. Trois frictions à lever (demande Eric, 2026-06-12) :

1. **Configurer la base depuis l'app**, sans éditer un `.env` à la main.
2. **L'ODBC Driver 17 n'est pas embarqué** dans l'installeur (vérifié :
   `extraResources` ne contient que le build React et `pcb-flow-server`) — c'est
   une install séparée oubliée sur un poste = backend qui ne démarre pas.
3. **Choix Client / Host à l'installation** : un poste « Host » doit provisionner
   **tout le côté serveur automatiquement** (ODBC + SQL Server Express + TCP +
   pare-feu + base + login), les postes « Client » se contentant de pointer dessus.

Cible retenue (ADR 0008, confirmée) : **SQL Server Express hébergé sur un des
postes** (le Host), base partagée `ECB_Production`, 2-3 postes.

### Contrainte structurante : le fail-fast (ADR 0008)

En production, le backend **refuse de démarrer si SQL Server est injoignable**
(pas de bascule SQLite silencieuse). Conséquence directe pour la demande n°1 :
**la config DB ne peut PAS être servie par une route backend**, sinon un poste mal
configuré ne pourrait jamais ouvrir l'écran qui sert à le corriger (poule/œuf).
La config doit être éditable **hors du backend**.

---

## Décision

### 1. Panneau « Connexion base de données » dans Paramètres, piloté par Electron

Un nouveau panneau dans `SettingsPage` édite les paramètres SQL Server. La
lecture/écriture du `.env` runtime (`PCBFLOW_DATA_DIR/.env`) passe par le
**process principal Electron** (qui gère déjà ce fichier — `seedDefaultConfig`),
exposé au renderer via un pont **preload** :

- `electronAPI.dbConfig.get()` → renvoie `SQL_SERVER_HOST/PORT/USER/DATABASE/DRIVER`
  (mot de passe **jamais renvoyé en clair** : booléen « défini » seulement).
- `electronAPI.dbConfig.save(cfg)` → réécrit **uniquement** les lignes
  `SQL_SERVER_*` du `.env` (préserve le reste : `MAX_UPLOAD_MB`, feature flags).
- `electronAPI.dbConfig.test(cfg)` → teste la connexion (cf. §2).
- `electronAPI.dbConfig.restartBackend()` → tue + relance le backend, puis
  `waitForHealth`, et **remonte la cause d'échec** au renderer.

Le panneau fonctionne donc **même quand la base est down**. En contexte web/dev
(pas d'`electronAPI`), il s'affiche en lecture seule avec un message.

### 2. Test de connexion réel via un mode CLI backend `--check-db`

Electron ne sait pas parler ODBC. Plutôt que dupliquer la logique, on ajoute au
backend packagé un mode **`pcb-flow-server.exe --check-db`** : il lit l'env
courant, tente la connexion (`pyodbc`/`mssql+pyodbc`, **réutilise** le code de
`config.py`/`database.py`), imprime un JSON `{ok, engine, detail}` et sort 0/1.
Le bouton « Tester » d'Electron lance ce mode dans un dossier temporaire avec les
valeurs saisies (sans toucher au `.env` actif tant que l'utilisateur n'a pas
enregistré). Un **pré-test TCP** (`net.connect host:port`) côté Electron donne un
retour instantané « port ouvert / fermé » avant le test ODBC complet.

### 3. Embarquer l'ODBC Driver 17, installé en silencieux par NSIS

Le redistribuable Microsoft `msodbcsql.msi` (~5 Mo, redistribution autorisée par
sa licence) est ajouté aux ressources de l'installeur et exécuté **pendant
l'install NSIS** (choix Eric) via un script `installer.nsh` custom :

```
ExecWait 'msiexec /i "$INSTDIR\resources\msodbcsql.msi" /qn \
  IACCEPTMSODBCSQLLICENSETERMS=YES ADDLOCAL=ALL'
```

Idempotent : on **saute** l'étape si le pilote est déjà présent (clé de registre
`HKLM\SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server`).

### 4. Page d'installation « Client / Host » (nsDialogs)

Une page custom NSIS (boutons radio **Client** / **Host**) est injectée via
`installer.nsh`. Le rôle est mémorisé (registre `HKCU\Software\ECB\PCBFlow\Role`)
et conditionne les étapes post-install :

- **Client** : ODBC installé · `.env` semé avec `SQL_SERVER_HOST` vide (à
  renseigner via le panneau §1) · fin. La saisie de l'IP du Host se fait dans
  l'app, pas dans l'installeur.
- **Host** : ODBC + **provisioning serveur complet** (§5).

### 5. Host = provisioning serveur automatique, délégué à un script PowerShell

La logique « lourde » (fragile, dépendante de la version SQL Server) **ne vit pas
en code NSIS** mais dans un script **`provision_host.ps1`** embarqué, lancé
**élevé** par l'installeur sur le chemin Host. Le script, **idempotent et
journalisé**, enchaîne :

1. Installer **SQL Server Express** en silencieux
   (`/QS /ACTION=Install /FEATURES=SQLENGINE /INSTANCENAME=SQLEXPRESS
   /SECURITYMODE=SQL /SAPWD=… /TCPENABLED=1 /IACCEPTSQLSERVERLICENSETERMS`).
   Le binaire SQL Express (~300 Mo) est **téléchargé depuis Microsoft** au moment
   du provisioning (évite de gonfler l'installeur universel servi aux Clients),
   avec **repli** sur un chemin local si fourni / pas d'internet.
2. **Port TCP fixe 1433** : registre `…\MSSQLxx.SQLEXPRESS\MSSQLServer\
   SuperSocketNetLib\Tcp\IPAll` (`TcpPort=1433`, `TcpDynamicPorts` vidé), puis
   redémarrage du service. La version d'instance (`MSSQL15`/`MSSQL16`…) est
   **détectée dynamiquement** (pas en dur).
3. **Pare-feu** : `netsh advfirewall firewall add rule … localport=1433`, **scope
   LAN** (pas exposé hors réseau local).
4. **Base + login** : créer `ECB_Production` et un **login dédié least-privilege**
   (`pcbflow`, db_owner sur cette base uniquement — **pas `sa`**) via `sqlcmd`.
   Les **tables** sont créées par le backend au 1er boot (`init_or_upgrade_schema`,
   ADR 0008) — le script ne crée que base + login.
5. **Semer le `.env`** local du Host : `SQL_SERVER_HOST=localhost`,
   `SQL_SERVER_PORT=1433`, user/mdp du login dédié, `DATABASE=ECB_Production`.

### 6. L'installeur demande désormais l'élévation administrateur

Installer l'ODBC (MSI machine-wide) **et** le provisioning Host exigent l'admin.
La propriété « installeur sans admin » (posée pour le contournement winCodeSign)
**est abandonnée** pour ce flux. `CSC_IDENTITY_AUTO_DISCOVERY=false` est conservé
(pas de signature) ; seul le niveau d'exécution change. À documenter dans
`DEPLOYMENT.md` et la checklist Go-Live (qui affirment aujourd'hui « pas besoin
d'administrateur »).

---

## Conséquences

- ✅ Mise en service d'un poste **sans éditer de fichier** : un écran dans l'app,
  un test de connexion, un redémarrage.
- ✅ Plus d'oubli d'ODBC : embarqué et posé automatiquement.
- ✅ Un poste Host **auto-provisionné** (SQL Express + réseau + base) en un
  parcours d'installation.
- ✅ Panneau de config **résilient au fail-fast** (édition hors backend).
- ⚠️ **L'installeur requiert l'admin** (UAC) — changement de propriété, à
  communiquer. Le simple usage de l'app, lui, reste sans admin.
- ⚠️ **Host dépend d'internet** (téléchargement SQL Express) sauf binaire local
  fourni.
- ⚠️ **Fragilité Windows/SQL** : versions d'instance, chemins registre, nommage
  d'instance varient. Mitigations : logique en PowerShell **testable + journalisée
  + idempotente**, détection dynamique de version, **repli manuel** documenté (le
  guide pas-à-pas SQL Server existant reste la voie de secours).
- ⚠️ **Sécurité LAN** : port 1433 ouvert + auth SQL. Atténué par login dédié
  least-privilege (pas `sa`), mot de passe fort, règle pare-feu **scope local**.
- ⚠️ **Surface de maintenance** accrue (NSIS custom + PowerShell + IPC). Acceptée
  au regard du gain de déploiement ; périmètre Client (la majorité des postes)
  reste léger.

---

## Alternatives écartées

- **Route backend pour la config DB** : impossible avec le fail-fast (poule/œuf) ;
  remplacée par l'édition via Electron.
- **Embarquer SQL Server Express dans l'installeur universel** : ~300 Mo imposés à
  tous les Clients qui n'en ont pas besoin ; remplacé par téléchargement à la
  demande sur le seul chemin Host.
- **Logique de provisioning en code NSIS** : illisible et intestable ; déléguée à
  un PowerShell journalisé.
- **Conteneur Docker pour SQL Server** : trop lourd pour des postes atelier
  Windows ; hors cible.
- **`sa` comme compte applicatif** : sur-privilégié ; remplacé par un login dédié.

---

## Références
- Plan d'implémentation : `docs/guides/Plan_Deploiement_Config_Postes_2026-06.md`
- Fichiers visés : `client/src/desktop/src/{main.js,preload.js}`,
  `client/src/desktop/package.json` (bloc `build.nsis`),
  `client/src/desktop/build/installer.nsh` (nouveau),
  `client/src/desktop/build/provision_host.ps1` (nouveau),
  `client/src/frontend/src/components/common/DatabaseSettings.jsx` (nouveau),
  `client/src/frontend/src/pages/SettingsPage.jsx`,
  `serveur/launch.py` / entrée packagée (`--check-db`)
- ADR liés : `0006-packaging-lancement-desktop.md`,
  `0007-systeme-mise-a-jour.md`, `0008-base-partagee-sql-server.md`
- Docs à mettre à jour : `docs/guides/DEPLOYMENT.md`,
  `docs/guides/Deploiement_Checklist_GoLive.md`
