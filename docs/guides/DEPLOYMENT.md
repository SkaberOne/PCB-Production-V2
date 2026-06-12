# Déploiement — Build & lancement

> Mis à jour : 2026-06-10 (Phase A — app autonome). Plan complet :
> `Deploiement_Audit_et_Plan_Action_2026-06.md`. Décisions : ADR 0006/0007/0008.

## Architecture cible

Chaque poste exécute son frontend React + son backend FastAPI **packagé**
(`pcb-flow-server.exe`), lancé automatiquement par Electron, tous connectés à un
**SQL Server central** (ADR 0008). Mise à jour par `electron-updater` (ADR 0007).

## Chaîne de build (Windows)

```powershell
# 1. Backend → pcb-flow-server.exe  (PyInstaller, mode onedir)
.\serveur\CONSTRUIRE_SERVEUR.bat
#   produit : serveur\dist\pcb-flow-server\pcb-flow-server.exe

# 2. App desktop (embarque le build React + pcb-flow-server.exe via extraResources)
.\client\CONSTRUIRE_CLIENT.bat
#   ou : cd client\src\desktop ; npm run dist        (NSIS + portable)
#        cd client\src\desktop ; npm run dist:portable
```

> L'étape 2 suppose l'étape 1 faite : `extraResources` copie
> `serveur/dist/pcb-flow-server/` dans l'app. Reconstruire le backend après toute
> modif serveur.

## Comment l'app démarre (ADR 0006)

1. Electron détecte un **port libre** sur `127.0.0.1`.
2. Il **spawn** `pcb-flow-server.exe --host 127.0.0.1 --port <libre>`.
3. Écran d'attente jusqu'à ce que `GET /api/health` réponde **200** (timeout 30 s).
4. L'URL/port est injectée au renderer (`window.electronAPI.getBackendUrl()`) ;
   `api/client.js` la lit au runtime (plus de port 8000 figé).
5. À la fermeture, le backend est tué proprement (anti-orphelin).

En **dev**, rien ne change : `DEMARRER_SERVEUR.bat` + `DEMARRER_CLIENT.bat`
(le backend n'est pas spawné, le renderer tape `REACT_APP_API_URL`).

## Test rapide d'autonomie (sans SQL Server)

Pour valider le critère « double-clic démarre sans Python » avec une base locale :

```powershell
# Mettre un .env SQLite à côté de l'exe :
echo DATABASE_URL=sqlite:///./database/dev.db > serveur\dist\pcb-flow-server\.env
# (copier serveur\database\dev.db à côté de l'exe pour charger des données)
serveur\dist\pcb-flow-server\pcb-flow-server.exe --port 8123
#   → http://127.0.0.1:8123/api/health doit répondre {"status":"ok"}
```

Pour la cible réelle (SQL Server), voir Phase B/E du plan et ADR 0008
(prérequis : **ODBC Driver 17** sur chaque poste).

## Durcissement production (Phase B — fait)

En mode packagé, Electron lance le backend avec `API_ENV=production` et une
**clé X-API-Key de session** générée à chaque démarrage (`crypto.randomBytes`),
injectée au backend (env) et au renderer (preload). Conséquences validées :

- **Auth obligatoire** : toute route `/api/*` (sauf `/api/health`) exige la clé ;
  comparaison constant-time (`hmac.compare_digest`). Sans clé → 401.
- **/docs et /redoc désactivés** en production (404).
- **DB fail-fast** : si la cible n'est pas SQLite et que SQL Server est injoignable,
  le backend **refuse de démarrer** (pas de bascule SQLite silencieuse) ; mot de
  passe **URL-encodé**. Prérequis : **pyodbc** (ajouté aux requirements) + ODBC 17.
- **Limite d'upload** : 25 Mo par défaut (`MAX_UPLOAD_MB`), lecture par blocs → 413.
- **Erreurs 500** génériques côté client (détail loggé serveur uniquement).
- CORS : origine `null` (renderer `file://`) autorisée, bind 127.0.0.1 local.

En **dev** (backend lancé séparément, pas de clé), tout reste ouvert comme avant.
Une `API_KEY` d'environnement polluée (`${...}`) est neutralisée automatiquement.

## Durcissement Electron + config runtime (Phase C — fait)

- **CSP** appliquée à tout le contenu (bloque script/connexions distants ;
  autorise le backend local `127.0.0.1` + l'inline requis par CRA/MUI).
- **Pas de pop-up ni navigation externe** : `setWindowOpenHandler` (deny, liens
  http(s) → navigateur système) + garde `will-navigate`.
- **Menu durci en prod** : retrait de `reload` / `forceReload` / `toggleDevTools`
  (DevTools inaccessibles, validé : `Ctrl+Shift+I` sans effet).
- **Config runtime post-install** : une fois installé (Program Files = lecture
  seule), Electron pose `PCBFLOW_DATA_DIR` = `%APPDATA%\…\userData\server`
  (inscriptible) et y **sème un `.env` par défaut** + dossiers runtime au 1er
  lancement. L'utilisateur édite ce `.env` (SQL Server, MAX_UPLOAD_MB, flags).
- `client.env.example` versionné (modèle de config dev).

## Construire l'installeur (NSIS + portable)

```powershell
.\serveur\CONSTRUIRE_SERVEUR.bat          # backend → dist\pcb-flow-server
cd client\src\desktop ; npm run dist      # NSIS + portable → dist\
```

**Pas besoin d'administrateur.** Les scripts `dist` / `dist:portable` / `publish`
posent `CSC_IDENTITY_AUTO_DISCOVERY=false`, ce qui fait sauter l'extraction du
cache `winCodeSign` (liens symboliques macOS) — la cause de l'erreur « Cannot
create symbolic link : Le client ne dispose pas d'un privilège nécessaire » sur
les sessions sans Mode Développeur. L'installeur est par‑utilisateur
(`perMachine: false`) : son installation ne demande pas non plus d'élévation.

> Sortie dans `client/src/desktop/dist/` (relatif au dossier desktop) :
> `PCB Flow Production Suite Setup x.y.z.exe` (NSIS) + `PCB Flow Production Suite x.y.z.exe` (portable).

## Migrations & reprise des données (Phase E — fait)

Au démarrage du backend sur une base **non-SQLite** (SQL Server), le schéma est
mis à niveau automatiquement (`init_or_upgrade_schema`) :

- **Base neuve / pré-Alembic** : `create_all` depuis les modèles ORM (schéma
  courant complet) + `alembic stamp head`. Contourne une chaîne de migrations
  historique incomplète tout en gardant la discipline pour les évolutions futures.
- **Base existante (Alembic)** : `alembic upgrade head` (migrations additives,
  rétro-compatibles — ADR 0008). `env.py` corrigé pour appliquer en mode online.

**Reprise des données de l'ancien poste** (la prod SQLite de l'ancien PC, cf.
CHANGELOG 2026-05-29). Une fois SQL Server configuré dans le `.env` et le backend
démarré une fois (schéma créé), lancer **une fois** :

```powershell
# Depuis serveur/, .env pointant vers SQL Server :
..\.venv\Scripts\python.exe import_data.py "D:\chemin\ancienne\dev.db"
```

Le script copie toutes les tables dans l'ordre des dépendances (FK-safe) et
refuse d'écraser une cible déjà peuplée (sauf `--force`). Validé : copie de
3161 lignes (380 composants, 9 BOM, 2 machines) reproduite à l'identique.

## Mise à jour automatique (Phase D — fait)

`electron-updater` est branché (ADR 0007). L'app installée, au démarrage,
vérifie GitHub Releases (`SkaberOne/PCB-Production-V2`) et propose la mise à
jour ; un bouton **Aide → Rechercher les mises à jour** déclenche une
vérification manuelle ; quand une version est téléchargée, l'utilisateur est
invité à **redémarrer pour installer**. En dev (non installé), l'auto-update est
inactif (le bouton affiche un message).

### Publier une version

```powershell
# 1. Bumper la version (SemVer) dans client/src/desktop/package.json
# 2. Jeton GitHub (PAT scope "repo") dans l'environnement :
$env:GH_TOKEN = "<votre_PAT_github>"
# 3. Backend à jour :
.\serveur\CONSTRUIRE_SERVEUR.bat
# 4. Publier (installeurs + latest.yml poussés vers GitHub Releases) :
cd client\src\desktop ; npm run publish
```

`npm run publish` = `electron-builder --publish always` (avec
`CSC_IDENTITY_AUTO_DISCOVERY=false`, pas d'admin requis). Les postes installés
détectent alors la nouvelle Release. **Canal beta** : suffixez la version
(`1.1.0-beta`) et ajoutez `"generateUpdatesFilesForAllChannels": true` au bloc
`build` pour tester avant promotion en `latest`.

> Le dépôt étant public, le téléchargement des mises à jour ne nécessite pas de
> token côté postes (le PAT ne sert qu'à **publier**). Migrations DB jouées au
> boot après update (Phase E), toujours rétro-compatibles (ADR 0008).

## Signature de code (Phase F — optionnel)

Sans certificat, **Windows SmartScreen** affiche un avertissement « éditeur
inconnu » au 1ᵉʳ lancement (l'app reste installable via *Informations
complémentaires → Exécuter quand même*). Pour le supprimer, signer avec un
certificat **OV** (ou **EV**, qui élimine l'avertissement immédiatement) :

```powershell
# electron-builder lit ces variables d'environnement à la construction :
$env:CSC_LINK = "C:\chemin\certificat.pfx"
$env:CSC_KEY_PASSWORD = "<mot_de_passe>"
cd client\src\desktop ; npm run dist   # (ou npm run publish)
```

Non bloquant pour une diffusion interne contrôlée. À budgéter si distribution
large. En attendant, communiquer aux utilisateurs la consigne SmartScreen.

## Rollback

Une version défaillante se règle en **réinstallant la version précédente**
(installeurs conservés dans les Releases GitHub) ; l'auto-update repartira de la
version installée. Garder les migrations DB **additives** garantit qu'un retour
arrière applicatif ne casse pas la base partagée (ADR 0008).

> ⚠️ L'installeur déjà construit porte l'ancien nom « PCB Flow Production Suite ».
> Le renommage en **« PCB Flow Production Suite »** (productName, fenêtre, À
> propos, titre, API) prendra effet au prochain `npm run dist`.

---

## Mise à jour 2026-06-12 — Déploiement assisté (ADR 0009)

> Détail : `Plan_Deploiement_Config_Postes_2026-06.md`. Trois apports pour
> simplifier la mise en service de 2-3 postes.

### 1. Configurer la base depuis l'application (Phase 1 — faite)

Paramètres › **Connexion base de données** : un panneau édite la connexion SQL
Server (hôte, port, identifiants, base) sans toucher au `.env` à la main. La
config est pilotée par **Electron** (pas par le backend) afin de rester
accessible même quand la base est injoignable (le fail-fast ADR 0008 empêcherait
sinon de corriger un poste mal configuré). Boutons **Tester la connexion** (lance
`pcb-flow-server.exe --check-db`, avec pré-test TCP) et **Enregistrer &
redémarrer**.

### 2. Pilote ODBC embarqué (Phase 2)

L'installeur pose désormais l'**ODBC Driver 17** automatiquement
(`nsis/install_odbc.ps1`, idempotent : MSI embarqué dans
`resources/installers/msodbcsql17.msi` si présent, sinon téléchargé).

> ⚠️ **L'installeur requiert désormais l'administrateur** (`perMachine: true`) :
> l'installation de l'ODBC (et le provisioning Host) sont machine-wide. La
> propriété « installeur sans admin » n'est plus valable pour ce flux ; l'usage
> quotidien de l'app, lui, reste sans admin. (Corrige la mention plus haut.)

### 3. Choix Client / Host à l'installation (Phase 3)

Une page d'installation propose **Client** ou **Host** :

- **Client** : pose l'ODBC, puis l'utilisateur renseigne l'hôte SQL dans
  Paramètres › Connexion base de données.
- **Host** : pose l'ODBC **et** provisionne tout le côté serveur via
  `nsis/provision_host.ps1` (administrateur) — SQL Server Express (instance
  `SQLEXPRESS`), port **TCP 1433 statique**, **pare-feu**, base partagée +
  **login dédié least-privilege** (`pcbflow`, pas `sa`), puis sème le `.env`
  Host. Le mot de passe saisi à l'installation Host est celui à renseigner sur
  les postes Client.

Journaux de provisioning : `%PROGRAMDATA%\PCBFlow\install_odbc.log` et
`provision_host.log`. En cas d'échec, l'app reste installée et la base se
configure ensuite (panneau Paramètres) ; repli manuel = configuration SQL Server
décrite plus haut.

> **À tester sur VM Windows propre** (Client ET Host) avant diffusion : NSIS +
> PowerShell ne se valident pas hors Windows. Vérifier aussi le lien de
> téléchargement ODBC/SQL Express (liens Microsoft `fwlink` susceptibles
> d'évoluer) dans les deux `.ps1`.
