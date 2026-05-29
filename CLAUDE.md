# CLAUDE.md — Guide de travail AI pour ECB Production Manager

> **Protocole obligatoire** pour toute intervention de Claude sur ce projet.
> Lire ce fichier + `STRUCTURE.md` + `APP_DESCRIPTION.md` avant toute action.

---

## 1. LECTURE OBLIGATOIRE AU DÉMARRAGE

Avant toute tâche, Claude lit dans cet ordre :

1. `CLAUDE.md` (ce fichier) — process, skills, conventions
2. `STRUCTURE.md` — structure des dossiers (loi)
3. `APP_DESCRIPTION.md` — contexte app, stack, fonctionnalités
4. `docs/reports/` — dernier audit en date pour connaître l'état réel du projet

---

## 2. PROCESSUS OBLIGATOIRE : ANALYSE → PLAN → EXÉCUTION → TEST → VALIDATION

### Étape 1 — ANALYSE
- Utiliser `Read` sur les fichiers concernés AVANT de coder
- Pour cartographier un domaine, utiliser le subagent **caveman:cavecrew-investigator** (output compressé, économise du contexte)
- Identifier les dépendances et impacts
- Ne jamais modifier un fichier sans l'avoir lu d'abord

### Étape 2 — PLANIFICATION
- Décrire explicitement ce qui va être fait
- Lister les fichiers qui seront modifiés/créés
- Identifier les risques (imports, chemins, breaking changes)
- Pour tâches non triviales : utiliser **TaskCreate** pour structurer (la todo s'affiche à l'utilisateur)
- Pour décisions d'architecture : utiliser **engineering:architecture** (ADR)
- Pour risques avant release : utiliser **anthropic-skills:pre-mortem**

### Étape 3 — EXÉCUTION
- Modifier un fichier à la fois
- Respecter `STRUCTURE.md` pour tout nouveau fichier
- Préserver les imports relatifs Python (`from .config import settings` dans le package `src`)
- Pour fix minimal et chirurgical (1-2 fichiers) : déléguer à **caveman:cavecrew-builder**
- Pour fix de bug ciblé : utiliser **anthropic-skills:focused-fix**

### Étape 4 — TEST
- **Tests navigateur : Google Chrome EXCLUSIVEMENT**
- API : Swagger UI (`http://localhost:8000/docs`) ou `Invoke-RestMethod`
- Python : `.venv\Scripts\pytest serveur\src\tests\ -v`
- Frontend : `cd client\src\frontend && npm test`

### Étape 5 — VALIDATION
- Vérifier qu'aucun import n'est cassé : `grep -r "from src\.backend"` doit retourner 0
- Vérifier les routes API : `/api/health` doit répondre 200
- Vérifier le rendu Chrome si interface modifiée
- Pour review du diff : utiliser **caveman:cavecrew-reviewer** ou **engineering:code-review**

---

## 3. SKILLS À UTILISER PAR TYPE DE TÂCHE

### Audit / exploration / investigation
| Skill | Quand l'utiliser |
|---|---|
| **caveman:cavecrew-investigator** (subagent) | Cartographier un domaine, trouver où X est défini, lister les usages de Y. Output compressé. |
| **anthropic-skills:codebase-onboarding** | Générer une doc d'onboarding complète |
| **engineering:tech-debt** | Audit de dette technique, priorisation refactor |

### Modification de code
| Skill | Quand l'utiliser |
|---|---|
| **caveman:cavecrew-builder** (subagent) | Edit chirurgical 1-2 fichiers (rename, typo, refactor ciblé). Refuse 3+ fichiers. |
| **anthropic-skills:focused-fix** | Bugfix avec le minimum de changements |
| **engineering:debug** | Debugging structuré : reproduire → isoler → diagnostiquer → fixer |

### Review et qualité
| Skill | Quand l'utiliser |
|---|---|
| **caveman:cavecrew-reviewer** (subagent) | Review d'un diff/branche, un finding par ligne |
| **engineering:code-review** | Review pour sécurité, perf, correctness (N+1, injection, etc.) |
| **caveman:caveman-review** | Review ultra-compressée |
| **caveman:caveman-commit** | Génération de message de commit conventionnel |

### Architecture et design
| Skill | Quand l'utiliser |
|---|---|
| **engineering:architecture** | Créer un ADR (Architecture Decision Record) |
| **engineering:system-design** | Design système/service, API design, data modeling |
| **anthropic-skills:pre-mortem** | Analyse de risques avant lancement (Tigres / Tigres en papier / Éléphants) |

### Documentation
| Skill | Quand l'utiliser |
|---|---|
| **engineering:documentation** | README, runbook, docs API |
| **anthropic-skills:docx** | Audit/rapport en .docx (cf `docs/reports/AUDIT_*.docx`) |
| **anthropic-skills:pdf** | Manipulation PDF (specs, datasheets composants) |
| **anthropic-skills:xlsx** | **Important pour ce projet** : manipulation Excel pour BOM (xlsx est le format BOM principal) |

### Tests et déploiement
| Skill | Quand l'utiliser |
|---|---|
| **engineering:testing-strategy** | Définir un plan de test (couverture, types de tests) |
| **engineering:deploy-checklist** | Avant chaque release (CI status, migrations, rollback) |
| **engineering:incident-response** | Bug en prod, triage, postmortem |

### Manipulations système Windows
| Skill | Quand l'utiliser |
|---|---|
| **anthropic-skills:cmd-file-ops** | Déplacements/copies/renommages de fichiers Windows (français) |

### Skills à NE PAS utiliser sur ce projet
- `wiki`, `wiki-*`, `save`, `autoresearch`, `canvas` — Obsidian, hors scope projet
- `email-sort` — Gmail, hors scope projet
- `add-model-descriptions` — HuggingFace, hors scope
- `adr-*` (sauf `engineering:architecture`) — utilisent AgentDB non configuré ici
- `mcp-server-builder` — sauf si on décide d'exposer l'API ECB via MCP

---

## 4. RÈGLES STRUCTURE (LOI)

> Détail complet dans `STRUCTURE.md`.

**Règles critiques :**
- Code Python → `serveur/src/`
- Code React → `client/src/frontend/src/`
- Code Electron → `client/src/desktop/src/`
- Config serveur → `serveur/.env` (modèle : `serveur/.env.example`)
- Config client → `client/client.env` (copié vers `client/src/frontend/.env` par `DEMARRER_CLIENT.bat`)
- Specs/cahiers des charges → `docs/specs/`
- Rapports d'audit → `docs/reports/`
- Guides utilisateur/déploiement → `docs/guides/`
- Fichiers historiques → `docs/archive/`
- Scripts legacy archivés → `docs/archive/legacy-scripts/`
- **Jamais de scripts .bat/.vbs/.ps1/.exe à la racine**
- **Jamais de code source à la racine**

---

## 5. CONVENTIONS DE CODE

### Python (backend)
- Le package s'appelle **`src`** (PAS `src.backend`) → imports : `from src.app import app`
- Imports **relatifs** dans les modules du package (ex: `from .config import settings`)
- Imports **absolus** depuis `launch.py` et tests (ex: `from src.app import app`)
- Pydantic v2 (avec shims v1 si Python < 3.8) — voir `serveur/src/config.py`
- Modèles → `src/models/`, routes → `src/routes/`, services → `src/services/`, schémas → `src/schemas/`
- Tests → `src/tests/` avec `conftest.py` qui ajoute `serveur/` au `sys.path`

### React (frontend)
- Composants : `components/{domaine}/NomComposant.jsx` (domaines : `bom`, `import`, `machine`, `common`, `dashboard`, `layout`)
- Pages : `pages/NomPage.jsx` (7 routes mappées dans `App.jsx`)
- Appels API : via `api/client.js` (axios avec `REACT_APP_API_URL`)
- State global : Zustand stores
- UI : MUI v5 (`@mui/material`)
- Tests : `__tests__/` colocalisé avec ce qu'il teste (préférer ce pattern aux tests à la racine de `src/`)

### Electron (desktop)
- `main.js` = process principal (gestion fenêtre, menu)
- `preload.js` = bridge main ↔ renderer
- Build : `dist/ECB Production Manager.exe` (portable, généré par `CONSTRUIRE_CLIENT.bat`)

---

## 6. DÉPLOIEMENT ET LANCEMENT

### Serveur
```
serveur\DEMARRER_SERVEUR.bat   ← lance le serveur (double-clic)
serveur\INSTALLER_SERVEUR.bat  ← installation initiale du .venv
```
- Config : `serveur\.env` (créer depuis `serveur\.env.example`)
- Le `.venv` est à la **racine** du projet (`PCB-Production-V2\.venv\`)

### Client dev (navigateur Chrome)
```
client\DEMARRER_CLIENT.bat     ← lance Electron + React dev
```
Puis ouvrir `http://localhost:3000` dans **Google Chrome**.

### Client packagé (.exe)
```
client\CONSTRUIRE_CLIENT.bat   ← build React + package Electron
```
Produit : `client\dist\ECB Production Manager.exe` (portable)

---

## 7. COMMANDES UTILES

### Serveur (depuis la racine projet)
```powershell
# Dev avec reload
.venv\Scripts\python.exe serveur\launch.py --reload

# Prod sans reload
.venv\Scripts\python.exe serveur\launch.py --no-reload

# Tests Python (depuis racine)
.venv\Scripts\pytest serveur\src\tests\ -v

# Tests Python d'un fichier précis
.venv\Scripts\pytest serveur\src\tests\test_harmony_rules.py -v
```

### Client
```powershell
# Dev frontend React seul (port 3000)
cd client\src\frontend; npm start

# Dev Electron complet (React + fenêtre Electron)
cd client\src\desktop; npm start

# Tests React
cd client\src\frontend; npm test

# Build portable .exe
cd client\src\desktop; npm run build:portable
```

### Git
```powershell
# Branche actuelle après audit du 29/05/2026
git checkout audit-restructure-2026-05

# Voir l'historique
git log --oneline -20
```

---

## 8. BASE DE DONNÉES

- **Dev / déploiement simple** : SQLite (`serveur/database/dev.db`, créée automatiquement)
- **Production** : SQL Server (config dans `serveur/.env`, driver ODBC 17 requis)
- Migrations : Alembic (`serveur/src/alembic/`)
- Schema auto-créé au démarrage si SQLite (cf `database.py:ensure_sqlite_schema`)

---

## 9. POINTS D'ATTENTION (acquis lors de l'audit 2026-05-29)

### 1. Imports Python critiques
Le package s'appelle **`src`** (et non `src.backend`). Tout import en `from src.backend.X` est **cassé** et doit être corrigé en `from src.X`. Vérifier avec :
```powershell
Select-String -Path 'serveur\**\*.py' -Pattern 'src\.backend\.' -Recurse
```

### 2. `.venv` à la racine
Le `.venv` reste **à la racine** du projet (chemins absolus hardcodés à la création). Ne pas le déplacer dans `serveur/`. Si recréation nécessaire :
```powershell
python -m venv .venv
.venv\Scripts\pip install -r serveur\requirements_flexible.txt
```

### 3. Variable d'environnement `API_KEY` polluée
**Bug système** : la variable d'environnement utilisateur `API_KEY` contient `${user_config.api_key}` (template non résolu). Elle **override** le `.env`. Pour la supprimer :
```powershell
[Environment]::SetEnvironmentVariable('API_KEY', $null, 'User')
# Redémarrer la session PowerShell
```

### 4. React-scripts 5.0.1 + Node 22+
La présence de `"proxy"` dans `client/src/frontend/package.json` active le firewall check de webpack-dev-server qui plante avec Node récent. Le `.env` frontend doit contenir `DANGEROUSLY_DISABLE_HOST_CHECK=true` en dev.

### 5. CWD du serveur
Le `launch.py` change le CWD vers `serveur/` → les chemins relatifs du `.env` sont relatifs à `serveur/`.

### 6. Proxy React inutilisé
Le proxy `http://localhost:8000` dans `package.json` du frontend n'est **pas utilisé** : `client.js` lit `REACT_APP_API_URL` directement. À nettoyer si on veut être propre.

### 7. CORS
Si le client est sur une autre machine, ajouter l'IP dans `CORS_ORIGINS` du `.env` serveur ET vérifier `build_allowed_origins()` de `app.py`.

---

## 10. CONTEXTE MÉTIER

- **PCB** = fabrication de cartes électroniques
- **PnP (Pick & Place)** = machines de placement automatique de composants
- **BOM** = Bill of Materials (liste des composants d'un circuit) — formats `.xlsx`, `.csv`
- **Feeders** = chargeurs de composants sur machine PnP (fixes ou variables)
- **Harmonisation** = normalisation des références composants (formats fournisseurs hétérogènes)
- **HARMONY_RULES** = règles d'assignation feeders ↔ composants (`serveur/src/services/harmony_rules.py`)

---

## 11. WORKFLOW RECOMMANDÉ POUR UNE NOUVELLE FONCTIONNALITÉ

1. **TaskCreate** la liste des étapes
2. **engineering:system-design** ou **engineering:architecture** si choix d'archi
3. **caveman:cavecrew-investigator** pour cartographier l'existant
4. Coder (ou déléguer à **caveman:cavecrew-builder** si fix < 2 fichiers)
5. **engineering:testing-strategy** pour le plan de test
6. Lancer pytest + npm test
7. **caveman:cavecrew-reviewer** ou **engineering:code-review** sur le diff
8. **caveman:caveman-commit** pour le message de commit
9. **engineering:deploy-checklist** avant merge
10. Mettre à jour `docs/reports/` si audit/rapport produit
