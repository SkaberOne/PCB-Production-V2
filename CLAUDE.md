/caveman FULL
# CLAUDE.md — Guide AI pour ECB Production Manager

> **Lecture obligatoire avant toute action** : ce fichier, puis `STRUCTURE.md`, puis `docs/Projet.md`, puis `docs/CHANGELOG.md` (dernière entrée), puis le dernier audit en date dans `docs/audits/`.

---

## 1. Process en 5 étapes (toujours dans cet ordre)

1. **Analyse** — `Read` les fichiers concernés. Pour cartographier un domaine, déléguer à **`caveman:cavecrew-investigator`** (output compressé).
2. **Plan** — `TaskCreate` les étapes. Pour décision d'archi : **`engineering:architecture`** (ADR).
3. **Exécution** — modifier un fichier à la fois. Pour fix chirurgical 1-2 fichiers : **`caveman:cavecrew-builder`**.
4. **Test** — `.venv\Scripts\pytest serveur\src\tests\ -v` + `cd client\src\frontend && npm test`. Navigateur : **Google Chrome uniquement**.
5. **Validation** — vérifier imports + routes (`/api/health` doit répondre 200) + diff via **`caveman:cavecrew-reviewer`** ou **`engineering:code-review`**.

---

## 2. Skills à utiliser selon la tâche

### Investigation / audit
| Tâche | Skill |
|---|---|
| Cartographier un domaine, trouver où X est défini | `caveman:cavecrew-investigator` |
| Audit de dette technique | `engineering:tech-debt` |
| Onboarding / doc d'archi générée | `anthropic-skills:codebase-onboarding` |

### Modification de code
| Tâche | Skill |
|---|---|
| Edit chirurgical 1-2 fichiers (rename, typo) | `caveman:cavecrew-builder` |
| Bugfix avec minimum de changements | `anthropic-skills:focused-fix` |
| Debug structuré (reproduire → isoler → fixer) | `engineering:debug` |

### Review et qualité
| Tâche | Skill |
|---|---|
| Review diff/branche | `caveman:cavecrew-reviewer` |
| Review sécurité/perf/correctness | `engineering:code-review` |
| Review ultra-compressée | `caveman:caveman-review` |
| Message de commit | `caveman:caveman-commit` |

### Architecture & design
| Tâche | Skill |
|---|---|
| Créer un ADR | `engineering:architecture` |
| Design système, API, modèle données | `engineering:system-design` |
| Analyse risques pré-release | `anthropic-skills:pre-mortem` |

### Documentation
| Tâche | Skill |
|---|---|
| README, runbook, doc API | `engineering:documentation` |
| Audit/rapport en .docx | `anthropic-skills:docx` |
| BOM Excel (format principal du projet) | `anthropic-skills:xlsx` |
| Spec/datasheet PDF | `anthropic-skills:pdf` |

### Tests & déploiement
| Tâche | Skill |
|---|---|
| Plan de test (couverture, types) | `engineering:testing-strategy` |
| Checklist avant release | `engineering:deploy-checklist` |
| Bug prod / postmortem | `engineering:incident-response` |

### Système Windows
| Tâche | Skill |
|---|---|
| Manipulations fichiers/dossiers Windows | `anthropic-skills:cmd-file-ops` |

### Skills à NE PAS utiliser
`wiki*`, `save`, `autoresearch`, `canvas`, `email-sort`, `add-model-descriptions`, `adr-*` (sauf `engineering:architecture`), `mcp-server-builder`.

---

## 3. Règles structure (loi)

Détail complet : `STRUCTURE.md`. Règles critiques :

- Code Python → `serveur/src/`
- Code React → `client/src/frontend/src/`
- Code Electron → `client/src/desktop/src/`
- Config serveur → `serveur/.env` (modèle : `serveur/.env.example`)
- Config client → `client/client.env` (copié vers `client/src/frontend/.env` par `DEMARRER_CLIENT.bat`)
- Specs → `docs/specs/` · Audits → `docs/audits/` · ADR → `docs/adr/` · Guides → `docs/guides/` · Archive → `docs/archive/`
- Scripts utilitaires universels (auto_push, restart_serveur, test_api) → racine
- Scripts spécifiques serveur/client → `serveur/` ou `client/`
- **Interdit à la racine** : `.vbs`, `.exe`, code source

---

## 4. Conventions de code

### Python (backend)
- Package = **`src`** (PAS `src.backend`) → `from src.app import app`
- Imports **relatifs** dans le package (`from .config import settings`)
- Imports **absolus** depuis `launch.py` et tests (`from src.app import app`)
- Pydantic v2 avec shims v1 (cf `src/config.py`)
- Timestamps : utiliser `from ..database import utcnow` (PAS `datetime.utcnow()` qui est déprécié)
- DB session : `from ..database import get_db` (canonique)
- Modèles → `src/models/` · Routes → `src/routes/` · Services → `src/services/` · Schémas → `src/schemas/`
- Tests → `src/tests/` avec `conftest.py` (ajoute `serveur/` au sys.path)

### React (frontend)
- Composants : `components/{domaine}/NomComposant.jsx` (`bom`, `import`, `machine`, `common`, `dashboard`, `layout`)
- Pages : `pages/NomPage.jsx`
- API : `api/client.js` (axios avec `REACT_APP_API_URL`)
- State global : Zustand
- UI : MUI v5 (`@mui/material`)
- Tests : `__tests__/` colocalisé (préférer ce pattern aux tests à la racine de `src/`)
- ⚠ Composants à découper si >300 lignes (cf `docs/audits/Audit_2026-05-29_final.md`)

### Electron (desktop)
- `main.js` = process principal · `preload.js` = bridge main↔renderer
- Build : `client/dist/ECB Production Manager.exe`

---

## 5. Lancement et test

```powershell
# --- Serveur ---
.\serveur\DEMARRER_SERVEUR.bat                    # double-clic OK
.venv\Scripts\python.exe serveur\launch.py --reload  # dev manuel

# --- Client ---
.\client\DEMARRER_CLIENT.bat                      # double-clic OK
cd client\src\frontend; npm start                 # React seul (port 3000)

# --- Tests ---
.venv\Scripts\pytest serveur\src\tests\ -v
cd client\src\frontend; npm test

# --- Build ---
.\client\CONSTRUIRE_CLIENT.bat                    # produit dist/ECB Production Manager.exe
```

URLs : API → `http://localhost:8000` · Swagger → `/docs` · Frontend → `http://localhost:3000`

---

## 6. Base de données

- **Dev** : SQLite (`serveur/database/dev.db`, auto-créée)
- **Prod** : SQL Server via ODBC Driver 17 (config dans `serveur/.env`)
- Migrations : Alembic (`serveur/src/alembic/`)
- Helper timestamp : `utcnow()` dans `database.py` (timezone-aware)

---

## 7. Points d'attention (acquis lors des audits)

1. **Imports critiques** : package = `src` (jamais `src.backend`). Vérifier avec :
   ```powershell
   Select-String -Path 'serveur\**\*.py' -Pattern 'src\.backend\.' -Recurse
   ```

2. **`.venv` à la racine** — ne pas déplacer. Pour recréer :
   ```powershell
   python -m venv .venv
   .venv\Scripts\pip install -r serveur\requirements_flexible.txt
   ```

3. **Variable d'env `API_KEY` polluée** : peut contenir `${user_config.api_key}` (template non résolu). Pour la nettoyer :
   ```powershell
   [Environment]::SetEnvironmentVariable('API_KEY', $null, 'User')
   ```

4. **React-scripts 5.0.1 + Node 22+** : le `.env` frontend doit contenir `DANGEROUSLY_DISABLE_HOST_CHECK=true` en dev.

5. **CWD du serveur** : `launch.py` change le CWD vers `serveur/` → chemins du `.env` relatifs à `serveur/`.

6. **CORS** : si client sur autre machine, ajouter IP dans `CORS_ORIGINS` du `.env` ET vérifier `build_allowed_origins()` de `app.py`.

7. **datetime.utcnow() déprécié** (Python 3.12+) : utiliser le helper `utcnow()` de `database.py`. Vérifier :
   ```powershell
   Select-String -Path 'serveur\src\**\*.py' -Pattern 'datetime\.utcnow' -Recurse
   ```

---

## 8. Contexte métier

| Terme | Définition |
|---|---|
| PCB | Fabrication cartes électroniques |
| PnP (Pick & Place) | Machines de placement automatique de composants |
| BOM | Bill of Materials (liste composants d'un circuit) — formats `.xlsx`, `.csv` |
| Feeders | Chargeurs de composants sur PnP (fixes ou variables) |
| Harmonisation | Normalisation des références composants (formats fournisseurs hétérogènes) |
| HARMONY_RULES | Règles assignation feeders↔composants (`serveur/src/services/harmony_rules.py`) |

---

## 9. Workflow pour nouvelle fonctionnalité

1. `TaskCreate` la liste des étapes
2. `engineering:system-design` ou `engineering:architecture` si choix d'archi
3. `caveman:cavecrew-investigator` pour cartographier l'existant
4. Coder (ou `caveman:cavecrew-builder` si fix < 2 fichiers)
5. `engineering:testing-strategy` pour le plan de test
6. Lancer pytest + npm test
7. `caveman:cavecrew-reviewer` ou `engineering:code-review` sur le diff
8. `caveman:caveman-commit` pour le message de commit
9. `engineering:deploy-checklist` avant merge
10. Mettre à jour `docs/reports/` si audit/rapport produit
