# CLAUDE.md - Guide de travail AI pour ECB Production Manager

> Ce fichier définit le **protocole obligatoire** pour toute intervention de Claude sur ce projet.
> Lire ce fichier + STRUCTURE.md + APP_DESCRIPTION.md avant toute action.

---

## 1. LECTURE OBLIGATOIRE AU DÉMARRAGE

Avant toute tâche, Claude doit lire dans cet ordre :

1. `CLAUDE.md` (ce fichier)
2. `STRUCTURE.md` → structure des dossiers (LOI)
3. `APP_DESCRIPTION.md` → contexte app, stack, fonctionnalités

---

## 2. PROCESSUS OBLIGATOIRE : ANALYSE → PLAN → EXÉCUTION → TEST → VALIDATION

### Étape 1 — ANALYSE
- Lire les fichiers concernés AVANT de coder
- Identifier les dépendances et impacts
- Ne jamais modifier un fichier sans l'avoir lu
- Documenter ce qui a été trouvé en une phrase

### Étape 2 — PLANIFICATION
- Décrire explicitement ce qui va être fait
- Lister les fichiers qui seront modifiés/créés
- Identifier les risques (imports, chemins, breaking changes)
- Obtenir validation avant d'exécuter si impact majeur

### Étape 3 — EXÉCUTION
- Modifier un fichier à la fois
- Respecter STRUCTURE.md pour tout nouveau fichier
- Préserver les imports existants (ne pas casser les relatives imports Python)
- Commit atomique par fonctionnalité

### Étape 4 — TEST
- **Tests navigateur : Google Chrome EXCLUSIVEMENT**
- Tests API : via Swagger UI (http://localhost:8000/docs) ou curl
- Tests Python : `pytest` depuis `serveur/` avec `.venv`
- Tests frontend : `npm test` depuis `client/src/frontend/`

### Étape 5 — VALIDATION
- Vérifier que les tests passent
- Vérifier qu'aucune route API n'est cassée
- Vérifier le rendu Chrome si interface modifiée
- Documenter le résultat

---

## 3. RÈGLES STRUCTURE (LOI)

> Voir STRUCTURE.md pour l'arborescence complète.

**Règles critiques :**
- Code Python → `serveur/src/`
- Code React → `client/src/frontend/src/`
- Code Electron → `client/src/desktop/src/`
- Config serveur → `serveur/.env`
- Config client → `client/client.env`
- Docs/specs → `docs/specs/`
- Rapports → `docs/reports/`
- **Jamais de scripts .bat à la racine**
- **Jamais de code source à la racine**

---

## 4. CONVENTIONS DE CODE

### Python (backend)
- Imports **relatifs** dans les modules du package `src` (ex: `from .config import settings`)
- Imports **absolus** depuis `launch.py` (ex: `from src.app import app`)
- Pydantic v1 ET v2 supportés (voir shims dans `config.py`)
- Modèles → `src/models/`, routes → `src/routes/`, services → `src/services/`

### React (frontend)
- Composants dans `components/{domaine}/NomComposant.jsx`
- Pages dans `pages/NomPage.jsx`
- Appels API via `api/client.js` (axios avec baseURL depuis `REACT_APP_API_URL`)
- State global : Zustand stores
- UI : MUI v5 (`@mui/material`)

### Electron (desktop)
- `main.js` = process principal (gestion fenêtre, menu)
- `preload.js` = bridge main ↔ renderer
- Ne pas modifier main.js sans comprendre le cycle de vie Electron

---

## 5. DÉPLOIEMENT

### Serveur
```
serveur/DEMARRER_SERVEUR.bat   ← lance le serveur (double-clic)
serveur/INSTALLER_SERVEUR.bat  ← installation initiale
```
Config : `serveur/.env`

### Client dev (navigateur Chrome)
```
client/DEMARRER_CLIENT.bat     ← lance Electron + React dev
```
Puis ouvrir http://localhost:3000 dans **Google Chrome**.

### Client packagé (exe)
```
client/CONSTRUIRE_CLIENT.bat   ← build React + package Electron
```
Produit : `client/dist/ECB Production Manager.exe` (portable)

---

## 6. COMMANDES UTILES

### Serveur
```powershell
# Depuis racine projet
.venv\Scripts\python.exe serveur\launch.py --reload       # dev
.venv\Scripts\python.exe serveur\launch.py --no-reload    # prod

# Tests Python
.venv\Scripts\pytest serveur\src\tests\ -v
```

### Client
```powershell
# Dev frontend seul
cd client\src\frontend && npm start

# Dev Electron complet
cd client\src\desktop && npm start

# Build portable
cd client\src\desktop && npm run build:portable
```

---

## 7. BASE DE DONNÉES

- **Dev / déploiement simple** : SQLite (`serveur/database/dev.db`)
- **Production** : SQL Server (config dans `serveur/.env`)
- Migrations : Alembic (`serveur/src/alembic/`)
- Schema auto-créé au démarrage si SQLite

---

## 8. POINTS D'ATTENTION

1. Le `.venv` reste **à la racine** du projet (chemins absolus hardcodés à la création)
2. Le `launch.py` dans `serveur/` change le CWD vers `serveur/` → les chemins relatifs du .env sont relatifs à `serveur/`
3. Le package Python s'appelle `src` (pas `backend`) → imports : `from src.app import app`
4. Le proxy React dev → `http://localhost:8000` (dans `client/src/frontend/package.json`)
5. CORS : si client sur autre machine, ajouter l'IP dans `CORS_ORIGINS` du `.env` serveur

---

## 9. CONTEXTE MÉTIER

- Fabrication PCB (cartes électroniques)
- Machines PnP = machines de placement automatique de composants
- BOM = Bill of Materials (liste des composants d'un circuit)
- Feeders = chargeurs de composants sur machine PnP
- Harmonisation = normalisation des références composants (différents formats fournisseurs)
