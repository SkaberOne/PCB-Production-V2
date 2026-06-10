# Plan de Déploiement — PCB Flow Production Suite

> Mis à jour : 2026-05-29 — Session 1 (audit + restructure profonde)

---

## 1. Structure du projet

```
PCB-Production-V2/
├── .gitignore
├── .obsidian/                    ← vault Obsidian (suivi + ADR + roadmap)
├── .venv/                        ← venv Python local (gitignored)
├── .git/
│
├── CLAUDE.md                     ← guide AI (process + skills + workflow)
├── README.md                     ← démarrage rapide
├── STRUCTURE.md                  ← loi de la structure du projet
│
├── auto_push.bat                 ← push GitHub
├── restart_serveur.bat           ← kill + redémarre backend
├── test_api.bat                  ← smoke test endpoints
│
├── docs/                         ← documentation (vault Obsidian indexé)
│   ├── INDEX.md                  ← entry point vault
│   ├── Projet.md                 ← description technique (vision + archi + data model)
│   ├── Plan_Deploiement.md       ← CE FICHIER (structure + env + workflow)
│   ├── CHANGELOG.md              ← historique sessions + commits
│   ├── Roadmap.md                ← stratégie + backlog priorisé
│   ├── audits/                   ← Audit_YYYY-MM-DD_*.md
│   ├── adr/                      ← Architecture Decision Records
│   ├── guides/                   ← DEPLOYMENT.md, GETTING_STARTED.md, TROUBLESHOOTING.md
│   ├── specs/                    ← Specs techniques (API, HARMONY_RULES, etc.)
│   └── archive/                  ← Anciens documents (historique)
│
├── serveur/                      ← === BACKEND FastAPI ===
│   ├── .env                      ← Config (NE PAS COMMITTER)
│   ├── .env.example              ← Modèle
│   ├── launch.py                 ← Point d'entrée (uvicorn)
│   ├── requirements.txt          ← Deps épinglées
│   ├── requirements_flexible.txt ← Deps souples (Python récent)
│   ├── pytest.ini                ← Config pytest (pythonpath, filterwarnings)
│   ├── DEMARRER_SERVEUR.bat
│   ├── INSTALLER_SERVEUR.bat
│   ├── src/
│   │   ├── app.py                ← FastAPI application
│   │   ├── auth.py               ← X-API-Key middleware
│   │   ├── config.py             ← Settings Pydantic (lit .env)
│   │   ├── database.py           ← Engine + SessionLocal + utcnow()
│   │   ├── alembic.ini · alembic/  ← Migrations DB
│   │   ├── models/               ← SQLAlchemy ORM (bom, machines, commands, production)
│   │   ├── routes/               ← Endpoints HTTP (bom_*, marketplace_*, reports)
│   │   ├── schemas/              ← Pydantic I/O (bom.py, marketplace.py)
│   │   ├── services/             ← Logique métier (assignment, command, harmony, etc.)
│   │   ├── utils/                ← file_parser, catalog_cache, feeder_types
│   │   └── tests/                ← pytest (conftest, test_*)
│   ├── database/                 ← dev.db SQLite (gitignored)
│   │   └── machine_footprint_catalog.txt
│   ├── uploads/ exports/ backups/ logs/  ← runtime (gitignored)
│
└── client/                       ← === FRONTEND React + Electron ===
    ├── client.env                ← URL API (adapté réseau)
    ├── DEMARRER_CLIENT.bat
    ├── CONSTRUIRE_CLIENT.bat
    └── src/
        ├── frontend/             ← React 18 + MUI v5
        │   ├── .env              ← copié depuis client.env par le .bat
        │   ├── package.json
        │   ├── public/
        │   └── src/
        │       ├── api/          ← client.js (axios)
        │       ├── components/   ← bom, command, dashboard, import, library, machine, common, layout
        │       ├── context/      ← BomSessionContext
        │       ├── hooks/        ← useMachineConfig, useBomCategories, etc.
        │       ├── pages/        ← Dashboard, ImportBom, BomViewer, Command, MachinePnp, BomFiles, Settings
        │       ├── utils/        ← bomFileExplorer, csvDownload, concurrencyPool, etc.
        │       └── theme.js
        └── desktop/              ← Shell Electron
            ├── package.json
            └── src/
                ├── main.js       ← process principal + IPC ALLOWED_PATHS
                └── preload.js
```

---

## 2. Environnement de développement

### Prérequis
- Windows 10/11 (Linux/macOS non testés)
- Python 3.8+ recommandé 3.11+ (testé 3.14.5)
- Node.js 18+ (testé 24.16)
- Google Chrome (navigateur de référence pour le dev)

### Installation initiale

**Backend** :
```powershell
# Depuis la racine projet
.\serveur\INSTALLER_SERVEUR.bat       # créé .venv + pip install
# OU manuel :
python -m venv .venv
.venv\Scripts\pip install -r serveur\requirements_flexible.txt
```

**Frontend** :
```powershell
cd client\src\frontend ; npm install
cd ..\desktop ; npm install
cd ..\..\..
```

### Lancement

```powershell
# Serveur (port 8000)
.\serveur\DEMARRER_SERVEUR.bat
# ou : .venv\Scripts\python.exe serveur\launch.py --reload

# Client React (port 3000)
.\client\DEMARRER_CLIENT.bat
# ou : cd client\src\frontend ; npm start

# Build Electron portable
.\client\CONSTRUIRE_CLIENT.bat       # → client\dist\PCB Flow Production Suite.exe
```

### URLs
- API : `http://localhost:8000`
- Swagger UI : `http://localhost:8000/docs`
- Frontend dev : `http://localhost:3000`

---

## 3. Workflow session

```
1. git status + git log --oneline -5
2. Lire docs/CHANGELOG.md (dernière entrée) pour contexte
3. Choisir skill auto-trigger selon nature tâche :
   - bug → engineering:debug
   - nouveau module → engineering:architecture (ADR)
   - audit → caveman:cavecrew (investigator)
   - refactor → engineering:tech-debt
4. Implémenter par commits atomiques (Conventional Commits)
5. Tester sur la VRAIE machine via Windows-MCP :
   - pytest : .venv\Scripts\pytest.exe serveur\src\tests\ -v
   - frontend : cd client\src\frontend; npm test
   - smoke : test_api.bat
   - UI : Chrome + Screenshot
6. Review : engineering:code-review ou caveman:caveman-review
7. Maj docs/CHANGELOG.md (session + commits)
8. Push via auto_push.bat
```

---

## 4. Git — règles

| Étape | Commande |
|---|---|
| Status | `git status` |
| Log | `git log --oneline -5` |
| Stage sélectif | `git add -p` |
| Commit | `git commit -m "feat(scope): msg"` |
| **Push** | `auto_push.bat` (racine — double-clic) |

**Types** : `feat` `fix` `refactor` `docs` `chore` `test` `perf`
**Scopes** : `bom` `marketplace` `machine` `reports` `auth` `api` `ui` `electron` `tests` `docs`

**Index corrompu** :
```powershell
del .git\index.lock
del .git\index
git read-tree HEAD
```

---

## 5. État d'avancement

### v1.0 (actuelle)
- ✅ 7 pages frontend opérationnelles
- ✅ 28 endpoints API REST
- ✅ Workflow complet : Productions → Import BOM → Revue → Commande → Machine PnP
- ✅ Bibliothèque BOM enregistrées (Phase 11 session 1)
- ✅ Export ERP Excel avec contexte
- ✅ Configuration machines PnP avec feeders fixes/variables

### En cours
- 🟡 Migration tests vers SQL Server (résout bug isolation SQLite)
- 🟡 Refactor `MachinePnpPage.jsx` (1179 lignes, bug boucle infinie)
- 🟡 Migration SQLAlchemy 1.x → 2.0 (67+ patterns `.query()`)

Détail : voir [[Roadmap]].
