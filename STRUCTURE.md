# STRUCTURE DU PROJET — ECB Production Manager
> **LOI : Claude doit respecter cette structure sans déroger.**
> Tout nouveau fichier créé doit être placé dans le bon dossier selon ce document.

---

## Arborescence

```
PCB-Production-V2/
│
├── CLAUDE.md                       ← Process AI (lire en premier)
├── README.md                       ← Démarrage rapide
├── STRUCTURE.md                    ← CE FICHIER — loi de la structure
│
├── .gitignore
├── .obsidian/                      ← Vault Obsidian (config minimale versionnée)
├── .venv/                          ← Venv Python (gitignored, NE PAS DÉPLACER)
├── .git/
│
├── auto_push.bat                   ← Push GitHub (double-clic)
├── restart_serveur.bat             ← Kill + redémarre backend
├── test_api.bat                    ← Smoke test endpoints
│
├── docs/                           ← Documentation + vault Obsidian
│   ├── INDEX.md                    ← Entry point du vault
│   ├── Projet.md                   ← Description technique (vision + archi + data model)
│   ├── Plan_Deploiement.md         ← Structure projet + env dev + workflow
│   ├── CHANGELOG.md                ← Historique sessions + commits
│   ├── Roadmap.md                  ← Stratégie + backlog priorisé
│   ├── audits/                     ← Audit_YYYY-MM-DD_titre.md (format normalisé)
│   ├── adr/                        ← Architecture Decision Records (NNNN-titre.md)
│   ├── guides/                     ← GETTING_STARTED, DEPLOYMENT, TROUBLESHOOTING
│   ├── specs/                      ← Specs techniques (API, HARMONY_RULES, ARCHI, etc.)
│   └── archive/                    ← Documents historiques (ne plus modifier)
│
├── serveur/                        ← === BACKEND FastAPI Python ===
│   ├── .env                        ← Config (NE PAS COMMITTER)
│   ├── .env.example                ← Modèle
│   ├── launch.py                   ← Entrée uvicorn
│   ├── requirements.txt            ← Deps épinglées
│   ├── requirements_flexible.txt   ← Deps souples (Python récent)
│   ├── pytest.ini                  ← Config pytest
│   ├── DEMARRER_SERVEUR.bat
│   ├── INSTALLER_SERVEUR.bat
│   ├── src/
│   │   ├── __init__.py
│   │   ├── app.py                  ← FastAPI app
│   │   ├── auth.py                 ← X-API-Key
│   │   ├── config.py               ← Settings Pydantic
│   │   ├── database.py             ← Engine + SessionLocal + utcnow()
│   │   ├── alembic.ini · alembic/  ← Migrations DB
│   │   ├── models/                 ← SQLAlchemy ORM
│   │   ├── routes/                 ← Endpoints HTTP
│   │   ├── schemas/                ← Pydantic I/O
│   │   ├── services/               ← Logique métier
│   │   ├── utils/                  ← Parsers, cache, helpers
│   │   └── tests/                  ← pytest + conftest
│   ├── database/                   ← dev.db SQLite (gitignored)
│   └── uploads/ exports/ backups/ logs/  ← Runtime (gitignored)
│
└── client/                         ← === FRONTEND React + Electron ===
    ├── client.env                  ← URL API (adapté réseau)
    ├── DEMARRER_CLIENT.bat
    ├── CONSTRUIRE_CLIENT.bat
    └── src/
        ├── frontend/               ← React 18 SPA
        │   ├── package.json
        │   ├── public/
        │   └── src/
        │       ├── api/            ← client.js (axios)
        │       ├── components/     ← bom · command · dashboard · import · library · machine · common · layout
        │       ├── context/        ← BomSessionContext
        │       ├── hooks/          ← useMachineConfig, useBomCategories, etc.
        │       ├── pages/          ← Dashboard · ImportBom · BomViewer · Command · MachinePnp · BomFiles · Settings
        │       ├── utils/          ← bomFileExplorer, csvDownload, concurrencyPool, etc.
        │       └── theme.js
        └── desktop/                ← Shell Electron
            ├── package.json
            └── src/
                ├── main.js         ← Process principal + IPC ALLOWED_PATHS
                └── preload.js
```

---

## Règles de placement

| Type de fichier | Emplacement |
|---|---|
| Code Python (API) | `serveur/src/` |
| Config serveur | `serveur/.env` |
| Tests Python | `serveur/src/tests/` |
| Composants React | `client/src/frontend/src/components/{domaine}/` |
| Pages React | `client/src/frontend/src/pages/` |
| Utils JS | `client/src/frontend/src/utils/` |
| Config client | `client/client.env` |
| Spec technique | `docs/specs/` |
| Audit/rapport | `docs/audits/` (format `Audit_YYYY-MM-DD_titre.md`) |
| ADR | `docs/adr/` (format `NNNN-titre.md`) |
| Guide utilisateur | `docs/guides/` |
| Doc historique | `docs/archive/` |
| Scripts dev | Racine si universel (auto_push.bat) sinon `serveur/` ou `client/` |

---

## Ce qui ne doit PAS être à la racine
- Scripts spécifiques `.bat` (sauf utilitaires universels comme `auto_push.bat`)
- Fichiers de configuration `.env` (→ `serveur/.env` ou `client/client.env`)
- Code source (→ `serveur/src/` ou `client/src/`)
- Fichiers binaires `.exe`, `.dll`
- Fichiers temporaires, logs, runtime artifacts

---

## Conventions de nommage

### Audits
Format : `Audit_YYYY-MM-DD_titre_court.md`
- ✅ `Audit_2026-05-29_final.md`
- ✅ `Audit_2026-05-15_design.md`
- ❌ `AUDIT_FINAL.md` (pas de date)

### ADR
Format : `NNNN-titre-kebab.md`
- ✅ `0001-monorepo-structure.md`
- ✅ `0002-sqlite-tests-limitations.md`
- ❌ `ADR-MONOREPO.md` (pas numéroté)

### Composants React
Format : `NomComposant.jsx` en PascalCase, placés dans `components/{domaine}/`
- ✅ `components/command/StockStatusChip.jsx`
- ✅ `components/library/BomLibraryDetail.jsx`
- ❌ `components/stock-status-chip.jsx` (kebab)
- ❌ `pages/StockStatusChip.jsx` (mauvais dossier)

### Utils JS
Format : `nomUtil.js` en camelCase, dans `client/src/frontend/src/utils/`
- ✅ `utils/csvDownload.js`
- ✅ `utils/concurrencyPool.js`
- ❌ `utils/CSV_Download.js`

---

## Mises à jour de cette structure

Toute modification de cette structure doit :
1. Faire l'objet d'un ADR dans `docs/adr/`
2. Être documentée dans `docs/CHANGELOG.md`
3. Être appliquée immédiatement (pas de structure "à 2 vitesses")
