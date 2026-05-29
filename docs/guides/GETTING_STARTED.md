# Getting Started

## Prerequis

- Python 3.11+
- Node.js 18+
- Windows pour le flux desktop

Pour le local simple, utiliser SQLite via `DATABASE_URL=sqlite:///./database/dev.db`.

## Installation

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r src/backend/requirements.txt
npm install --prefix src/frontend
npm install --prefix src/desktop
```

## Configuration

1. Copier `.env.example` vers `.env`
2. Pour le local, definir:

```text
DATABASE_URL=sqlite:///./database/dev.db
API_ENV=development
API_RELOAD=true
```

## Lancement

Mode recommande:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-dev-stack.ps1
```

Sans Electron:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\start-dev-stack.ps1 -SkipElectron
```

Arret:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\stop-dev-stack.ps1
```

## Lancement manuel

Backend:

```powershell
.venv\Scripts\python.exe launch.py --reload
```

Frontend:

```powershell
npm --prefix src/frontend start
```

Desktop:

```powershell
npm --prefix src/desktop start
```

## Validation

```powershell
.venv\Scripts\python.exe -m pytest src/backend/tests -q
npm --prefix src/frontend test -- --watchAll=false
npm --prefix src/frontend run build
```

## URLs

- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000`

## Suite logique

- importer une BOM
- relire la session dans `Import BOM`
- ouvrir la revue `BOM`
- rattacher les revisions a une production
- preparer la commande composants
