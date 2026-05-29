# STRUCTURE DU DOSSIER - ECB Production Manager
> **LOI : Claude doit respecter cette structure sans déroger.**
> Tout nouveau fichier créé doit être placé dans le bon dossier selon ce document.

---

## Arborescence complète

```
PCB Production V2/
│
├── CLAUDE.md                    ← Process de travail AI (lire en premier)
├── STRUCTURE.md                 ← CE FICHIER - loi de la structure
├── APP_DESCRIPTION.md           ← Description app, stack, fonctionnalités
├── README.md                    ← Démarrage rapide utilisateur
│
├── .venv/                       ← Venv Python (NE PAS TOUCHER, NE PAS DÉPLACER)
├── .gitignore
│
├── docs/                        ← Documentation (archives, specs, audits)
│   ├── INDEX.md                 ← Index des documents
│   ├── STATUS.md                ← État du projet
│   ├── specs/                   ← Cahiers des charges, specs techniques
│   ├── guides/                  ← Guides utilisateur / déploiement
│   ├── reports/                 ← Rapports d'audit et de phase
│   └── archive/                 ← Documents historiques (ne plus modifier)
│       ├── legacy-scripts/      ← Scripts .bat/.vbs/.ps1 obsolètes
│       └── mockups/             ← Mockups HTML de redesign (historique)
│
├── serveur/                     ← === BACKEND (FastAPI Python) ===
│   │
│   ├── .env                     ← Config serveur (IP, port, DB, etc.) — NE PAS COMMITTER
│   ├── .env.example             ← Modèle de .env (copier vers .env)
│   ├── launch.py                ← Point d'entrée du serveur
│   ├── requirements.txt         ← Dépendances Python (versions épinglées)
│   ├── requirements_flexible.txt ← Dépendances Python (versions souples, pour Python récent)
│   │
│   ├── DEMARRER_SERVEUR.bat     ← Lance le serveur (double-clic)
│   ├── INSTALLER_SERVEUR.bat    ← Installe le venv + deps (première fois)
│   │
│   ├── src/                     ← Code source Python
│   │   ├── __init__.py
│   │   ├── app.py               ← Application FastAPI
│   │   ├── auth.py              ← Authentification API Key
│   │   ├── config.py            ← Settings Pydantic (lit .env)
│   │   ├── database.py          ← Connexion SQLAlchemy
│   │   ├── alembic.ini          ← Config migrations
│   │   ├── alembic/             ← Scripts de migration DB
│   │   ├── models/              ← Modèles SQLAlchemy
│   │   ├── routes/              ← Routes FastAPI (bom, marketplace, reports)
│   │   ├── schemas/             ← Schémas Pydantic (validation I/O)
│   │   ├── services/            ← Logique métier
│   │   ├── utils/               ← Utilitaires (parser, cache, etc.)
│   │   └── tests/               ← Tests pytest
│   │
│   ├── database/                ← Fichiers base de données
│   │   ├── dev.db               ← SQLite local (dev/prod simple)
│   │   └── machine_footprint_catalog.txt
│   │
│   ├── uploads/                 ← BOM importées (runtime - gitignore)
│   │   └── bom/
│   ├── exports/                 ← BOM exportées harmonisées (runtime - gitignore)
│   │   └── bom_harmonized/
│   ├── backups/                 ← Sauvegardes DB (runtime - gitignore)
│   └── logs/                    ← Logs serveur (runtime - gitignore)
│       └── app.log
│
└── client/                      ← === CLIENT (React + Electron) ===
    │
    ├── client.env               ← Config client (URL serveur) — adapter pour réseau
    │
    ├── DEMARRER_CLIENT.bat      ← Lance le client (double-clic)
    ├── CONSTRUIRE_CLIENT.bat    ← Build Electron portable (.exe)
    │
    ├── src/
    │   ├── frontend/            ← Application React 18
    │   │   ├── package.json
    │   │   ├── public/
    │   │   └── src/
    │   │       ├── api/         ← Client HTTP (axios)
    │   │       ├── components/  ← Composants React (bom, machine, common, layout)
    │   │       ├── context/     ← Contextes React (BomSessionContext)
    │   │       ├── hooks/       ← Hooks custom
    │   │       ├── pages/       ← Pages (Dashboard, BOM, Machine, Command, etc.)
    │   │       ├── utils/       ← Utilitaires frontend
    │   │       ├── App.jsx
    │   │       └── theme.js
    │   │
    │   └── desktop/             ← Shell Electron
    │       ├── package.json
    │       └── src/
    │           ├── main.js      ← Process principal Electron
    │           └── preload.js
    │
    └── dist/                    ← App packagée (générée par build - gitignore)
```

---

## Règles de placement

| Type de fichier | Emplacement |
|---|---|
| Code Python (API) | `serveur/src/` |
| Config serveur | `serveur/.env` |
| Tests Python | `serveur/src/tests/` |
| Composants React | `client/src/frontend/src/components/` |
| Pages React | `client/src/frontend/src/pages/` |
| Config client | `client/client.env` |
| Documentation spec | `docs/specs/` |
| Rapport / audit | `docs/reports/` |
| Guide utilisateur | `docs/guides/` |
| Fichiers obsolètes | `docs/archive/` |
| Nouveaux scripts bash/bat dev | **Ne pas créer à la racine** |

## Ce qui NE doit PAS être à la racine
- Scripts `.bat` de lancement (→ `serveur/` ou `client/`)
- Fichiers de configuration `.env` (→ `serveur/.env`)
- Code source (→ `serveur/src/` ou `client/src/`)
- Fichiers temporaires, logs, `.a_supprimer`
