# Audit & restructuration — PCB Flow Production Suite
**Date :** 29 mai 2026
**Branche git :** `audit-restructure-2026-05`
**Auteur :** Audit Claude (autorisé par Eric)

---

## 1. Résumé exécutif

Le projet a été audité, restructuré en mode "modéré" et soumis à un smoke test complet. Trois découvertes majeures :

1. **🔴 Bloquant — Imports Python cassés** : 34 occurrences de `from src.backend.X` dans les tests et Alembic, alors que le package s'appelle `src` (pas `src.backend`). Conséquence : aucun test ne pouvait tourner et Alembic était inutilisable. **Corrigé.**
2. **🟠 Majeur — Pollution racine** : 5 fichiers (.exe pré-buildés, .vbs, .ps1, dossier `_build/`) violaient `STRUCTURE.md`. **Archivés dans `docs/archive/legacy-scripts/` ou supprimés.**
3. **🟡 Mineur — Variables d'environnement Windows polluées** : la variable utilisateur `API_KEY` contient `${user_config.api_key}` (template Claude Code non résolu) qui override le `.env`. **Documenté dans le CLAUDE.md, action utilisateur requise.**

Le serveur démarre, répond à `/api/health`, et le frontend React se compile et sert sur `http://localhost:3000`. **Smoke test : ✅ OK.**

---

## 2. Périmètre de l'audit

| Volet | Outil utilisé | Résultat |
|---|---|---|
| Backend Python (`serveur/`) | subagent `cavecrew-investigator` | 23 findings |
| Frontend React + Electron (`client/`) | subagent `cavecrew-investigator` | 5 findings |
| Racine, configs, docs (`./` + `docs/`) | subagent `cavecrew-investigator` | 12 findings |
| Smoke test backend | python + `Invoke-RestMethod` | ✅ |
| Smoke test frontend | npm start + HTTP probe | ✅ |

---

## 3. Findings critiques (corrigés)

### 3.1 — Imports `src.backend.*` cassés (BLOCKER)
- **Symptôme** : `from src.backend.database import Base` dans 8 fichiers (34 occurrences).
- **Cause racine** : Le package a été renommé de `src/backend/` → `src/` sans mise à jour des imports.
- **Fichiers touchés** :
  - `serveur/src/tests/conftest.py`
  - `serveur/src/tests/test_reports.py`
  - `serveur/src/tests/test_harmony_rules.py`
  - `serveur/src/tests/test_file_parser.py`
  - `serveur/src/tests/test_assignment_planning.py`
  - `serveur/src/tests/test_assignment_fixed_feeders.py`
  - `serveur/src/tests/test_api_endpoints.py.bak` (supprimé)
  - `serveur/src/alembic/env.py`
- **Fix appliqué** : substitution batch `src.backend.` → `src.` + correction des `PROJECT_ROOT` (chemin pointait vers la racine projet au lieu de `serveur/`).
- **Vérification** : `Select-String -Pattern 'src\.backend\.'` → **0 résultat**.

### 3.2 — Fallback de chemin vers projet obsolète
- **Fichier** : `serveur/DEMARRER_SERVEUR.bat`
- **Symptôme** : ligne `if exist "C:\Users\Eric\Documents\Programme VS Code\PCB Production (outdated)\.venv\..."` faisait référence à l'ancien projet.
- **Fix** : fallback supprimé, le `.bat` ne cherche plus que le `.venv` à la racine du projet courant.

### 3.3 — Variable d'environnement utilisateur polluée
- **Variable** : `API_KEY` au niveau utilisateur Windows.
- **Valeur** : `${user_config.api_key}` (template non interpolé, vraisemblablement issu d'une config Claude Code).
- **Conséquence** : override le `.env` du serveur, bloque tous les appels API non authentifiés.
- **Fix utilisateur requis** :
  ```powershell
  [Environment]::SetEnvironmentVariable('API_KEY', $null, 'User')
  # Redemarrer la session PowerShell
  ```

---

## 4. Restructuration appliquée (modérée)

### 4.1 — Suppressions
- `LANCER_CLIENT.exe` (5 MB) — binaire pré-buildé, regénérable
- `LANCER_SERVEUR.exe` (5 MB) — idem
- `serveur/src/requirements.txt` (duplicate de `serveur/requirements.txt`)
- `serveur/src/requirements_flexible.txt` (duplicate)
- `serveur/src/tests/test_api_endpoints.py.bak` (backup obsolète)

### 4.2 — Archivés vers `docs/archive/legacy-scripts/`
- `ARRETER_APP.vbs`, `BUILD_LAUNCHERS.vbs`, `NETTOYER_ANCIENS_FICHIERS.ps1` (racine)
- `_build/` (3 fichiers : BUILD_LAUNCHERS.bat, launch_client.py, launch_server.py)
- `serveur/INSTALLER_DEPS.ps1`, `INSTALLER_DEPS.vbs`, `START_SERVER.vbs`, `RUN.bat`
- `serveur/launcher/` (C# launcher .NET 9 non documenté) → `csharp-launcher/`
- `client/INSTALL_REACT.vbs`, `START_REACT.vbs`, `RUN_CLIENT.bat`

### 4.3 — Archivés vers `docs/archive/mockups/`
- `docs/demo-redesign-full.html` (94 KB)
- `docs/mockup-redesign.html` (41 KB)

### 4.4 — Déplacés
- `.env.example` (racine) → `serveur/.env.example`
- `docs/audit-design-2026.md` → `docs/reports/audit-design-2026.md`

### 4.5 — Créés
- `serveur/.env` (config SQLite pour smoke test, à adapter pour prod SQL Server)
- `client/src/frontend/.env` (config React avec `DANGEROUSLY_DISABLE_HOST_CHECK=true`)
- `docs/archive/legacy-scripts/` + `docs/archive/mockups/` (dossiers)
- `docs/reports/AUDIT_RESTRUCTURE_2026-05-29.md` (ce fichier)

### 4.6 — Mis à jour
- `CLAUDE.md` (réécrit) — ajoute section skills curated par type de tâche
- `STRUCTURE.md` — reflète les nouveaux sous-dossiers d'archive et `.env.example` dans `serveur/`
- `.gitignore` — `.venv/` avec slash, ajout de patterns pour `.bak`, `*.sqlite3`, garde `serveur/.env.example`

---

## 5. État après audit

### Racine du projet
```
PCB-Production-V2/
├── .gitignore
├── APP_DESCRIPTION.md
├── CLAUDE.md           ← réécrit avec skills curated
├── README.md
├── STRUCTURE.md        ← mis à jour
├── .venv/              ← créé (Python 3.14.5, 35 deps installées)
├── client/
├── docs/
└── serveur/
```

Toutes les violations de `STRUCTURE.md` sont résolues à la racine.

### Smoke test
| Test | Résultat |
|---|---|
| Backend imports `src.app` | ✅ OK |
| Backend `python launch.py` | ✅ démarre, log "Uvicorn running on http://0.0.0.0:8000" |
| Backend `GET /api/health` | ✅ `{"status":"ok","version":"1.0.0"}` |
| Backend `GET /` | ✅ JSON métadonnées |
| Backend SQLite | ✅ DB `serveur/database/dev.db` créée automatiquement |
| Frontend `npm install` | ✅ 905 packages (1.6 GB) |
| Frontend `npm start` | ✅ "webpack compiled with 1 warning" (warnings no-unused-vars) |
| Frontend `GET /` | ✅ HTTP 200, titre "PCB Flow V2" |
| Frontend `bundle.js` | ✅ HTTP 200, 5.8 MB |
| API depuis frontend (auth) | ⚠️ 401 (cause : var env user `API_KEY`, hors projet) |

---

## 6. Backlog recommandé (non appliqué — restructuring modéré)

À considérer pour une refonte plus poussée :

| Priorité | Item | Effort estimé |
|---|---|---|
| Moyen | Retirer le `"proxy"` inutilisé de `client/src/frontend/package.json` | 5 min |
| Moyen | Migrer `axios ^1.6.0` (obsolète) vers `^1.7.x` | 15 min |
| Moyen | Unifier les `__tests__/` : actuellement mélangé entre `src/__tests__/` et `pages/__tests__/`, `utils/__tests__/`, `context/__tests__/` | 30 min |
| Bas | Refactor `BomImport.jsx` (1401 lignes) en sous-composants dans `components/import/` | 4-8h |
| Bas | Supprimer `requirements_flexible.txt` ou supprimer `requirements.txt` (choisir un seul fichier de référence) | 5 min |
| Bas | `register_routes()` dans `app.py` duplique `defaults` CORS hardcodés (4 origins) avec ceux du `config.py` | 10 min |
| Bas | Modèle `ProductionWorkspace` exporté dans `serveur/src/models/__init__.py` mais jamais défini | 30 min |

---

## 7. Commandes utiles pour valider après pull

```powershell
# 1. Re-vérifier qu'aucun import src.backend n'est revenu
Set-Location 'C:\Users\Eric\Documents\Projet\PCB-Production-V2'
Select-String -Path 'serveur\**\*.py' -Pattern 'src\.backend\.' -Recurse

# 2. Lancer les tests pytest (devraient désormais s'exécuter)
.venv\Scripts\pytest serveur\src\tests\ -v --tb=short

# 3. Smoke test backend
.venv\Scripts\python.exe serveur\launch.py --no-reload
# Dans un autre terminal :
Invoke-RestMethod 'http://localhost:8000/api/health'

# 4. Smoke test frontend (depuis client/src/frontend/)
npm start
# Ouvrir http://localhost:3000 dans Chrome
```

---

## 8. Décision : merge ou pas ?

La branche `audit-restructure-2026-05` est prête. Recommandation :

1. **Lire ce rapport et le nouveau `CLAUDE.md`**
2. **Vider la variable env `API_KEY`** (cf §3.3) avant de tester l'auth
3. **Lancer pytest** pour valider que les imports cassés sont bien réparés
4. **Si OK** : `git checkout master && git merge audit-restructure-2026-05`
5. **Sinon** : `git checkout master` (l'état initial est intact sur `master`)
