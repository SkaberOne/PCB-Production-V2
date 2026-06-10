# PCB Flow Production Suite - Description Application

## Vue d'ensemble

**PCB Flow Production Suite** est une application de gestion de production PCB orientée Windows desktop.
Elle couvre l'import BOM, la revue et harmonisation, la préparation de commandes composants, et la gestion machines PnP (Pick & Place).

---

## Stack technique

| Couche | Technologie | Version |
|---|---|---|
| Backend API | FastAPI + Uvicorn | Python 3.8+ |
| ORM / DB | SQLAlchemy + Alembic | - |
| Base locale | SQLite | dev / déploiement simple |
| Base cible prod | SQL Server | via ODBC Driver 17 |
| Frontend | React 18 + MUI v5 | Node 18+ |
| State mgmt | Zustand + axios | - |
| Desktop shell | Electron | v34 |
| Build desktop | electron-builder | - |

---

## Fonctionnalités

### BOM (Bill of Materials)
- Import de fichiers BOM (formats divers)
- Révisions et historique des imports
- Harmonisation des références composants
- Bibliothèque de BOM harmonisées
- Export BOM harmonisée

### Marketplace / Commandes
- Préparation de commandes composants
- Plans de commande par fournisseur
- Gestion inventaire
- Calcul besoins production

### Machine PnP
- Catalogue machines (footprints)
- Gestion feeders (fixes et variables)
- Assignation composants → feeders
- Règles d'harmonie (HARMONY_RULES)
- Workspace de production

### Rapports
- Rapports de production
- Exports BOM harmonisée

---

## Architecture

```
Client (Electron + React)  →  API REST (FastAPI port 8000)  →  DB (SQLite / SQL Server)
```

- Communication : HTTP REST + JSON
- Auth : API Key optionnelle (header `X-API-Key`)
- CORS configuré pour localhost dev + IPs réseau configurées

---

## URLs de développement

| Service | URL |
|---|---|
| API Backend | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| Frontend dev | http://localhost:3000 |

---

## Pages frontend

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Vue d'ensemble stats |
| Import BOM | `/import` | Importer un fichier BOM |
| BOM Files | `/bom-files` | Bibliothèque BOM |
| BOM Viewer | `/bom/:id` | Visualiser une BOM |
| Machine PnP | `/machine` | Gestion feeders machine |
| Commande | `/command` | Préparation commande |
| Paramètres | `/settings` | Config application |

---

## Modèles de données principaux

- **BOM** : fichier BOM importé avec révisions
- **BomRevision** : version d'une BOM (import)
- **BomComponent** : ligne composant dans une révision
- **Machine** : machine PnP avec slots feeders
- **Feeder** : emplacement physique sur machine
- **ProductionWorkspace** : session de travail production
- **Command** : ordre de préparation commande

---

## Configuration

### Serveur (`serveur/.env`)
- `DATABASE_URL` : chemin SQLite ou string SQL Server
- `API_HOST` / `API_PORT` : adresse d'écoute
- `API_KEY` : clé optionnelle pour sécuriser l'API
- `CORS_ORIGINS` : URLs client autorisées

### Client (`client/client.env`)
- `REACT_APP_API_URL` : URL du serveur API (ex: `http://192.168.1.50:8000`)
- `PORT` : port du serveur dev React

---

## Déploiement réseau

Pour utiliser l'app en réseau (serveur sur un PC, client sur un autre) :

1. **Serveur** : éditer `serveur/.env`
   - `API_HOST=0.0.0.0` (écoute toutes interfaces)
   - Ajouter l'IP client dans `CORS_ORIGINS`

2. **Client** : éditer `client/client.env`
   - `REACT_APP_API_URL=http://192.168.1.50:8000` (IP du serveur)

3. Rebuild client avec `CONSTRUIRE_CLIENT.bat`
