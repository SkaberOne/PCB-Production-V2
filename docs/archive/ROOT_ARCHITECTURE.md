# ARCHITECTURE TECHNIQUE - PCB Flow Production Suite

**Version** : 1.0  
**Date** : 18/03/2026  

---

## 📐 OVERVIEW ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                    PCB Flow Production Suite               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │   Desktop App    │         │   Web App        │     │
│  │   (Electron)     │◄───────►│   (React)        │     │
│  │   • BOM Import   │         │   • Marketplace  │     │
│  │   • PnP Mgmt     │         │   • Reports      │     │
│  │   • Local UI     │         │   • Dashboard    │     │
│  └──────────────────┘         └──────────────────┘     │
│           ▲                            ▲                │
│           │        HTTP/REST           │                │
│           └────────────┬───────────────┘                │
│                        │                               │
│  ┌─────────────────────▼────────────────────────┐      │
│  │        Backend API (FastAPI / Python)        │      │
│  │                                              │      │
│  │  ┌──────────────┐  ┌──────────────────────┐ │      │
│  │  │   Routing    │  │  Business Logic      │ │      │
│  │  │   (Endpoints)│  │  • BOM Harmony       │ │      │
│  │  └──────────────┘  │  • Feeder Assignment │ │      │
│  │  ┌──────────────┐  │  • Sourcing Logic    │ │      │
│  │  │  Auth/Config │  │  (Phase 2: APIs)     │ │      │
│  │  └──────────────┘  └──────────────────────┘ │      │
│  │  ┌──────────────┐  ┌──────────────────────┐ │      │
│  │  │ File Mgmt    │  │  Utils & Helpers     │ │      │
│  │  │ (BOM parse)  │  │  • Excel I/O         │ │      │
│  │  └──────────────┘  └──────────────────────┘ │      │
│  └─────────────────────┬────────────────────────┘      │
│                        │                               │
│                     SQLAlchemy ORM                      │
│                        │                               │
│  ┌─────────────────────▼────────────────────────┐      │
│  │       SQL Server Database                    │      │
│  │                                              │      │
│  │  • BOM_REFERENCES, BOM_REVISIONS           │      │
│  │  • BOM_ITEMS, COMPONENTS                   │      │
│  │  • FOOTPRINT_MAPPING, PNP_MACHINES         │      │
│  │  • COMMANDS, PRODUCTION_PLANS              │      │
│  └──────────────────────────────────────────────┘      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ STACK TECHNOLOGIQUE

### Backend
| Component | Technology | Justification |
|-----------|----------|---------------|
| **Framework Web** | FastAPI (Python) | Rapide, moderne, docs auto, français-friendly |
| **ORM Database** | SQLAlchemy | Support SQL Server, migrations, async ready |
| **Validation** | Pydantic | Modèles de données robustes |
| **File Processing** | openpyxl, pandas | Manipulation Excel native |
| **BOM Parsing** | Custom parser (regex) | Flexible, contrôlé |
| **Async/Workers** | APScheduler (optionnel) | Tâches background (Phase 2) |
| **Logging** | Python logging | Traçabilité |
| **Testing** | pytest | Qualité assurance |
| **API Documentation** | Swagger/OpenAPI | Auto-generated |

### Frontend Web
| Component | Technology | Justification |
|-----------|----------|---------------|
| **Framework** | React 18 | Performant, vaste écosystème |
| **State Management** | Zustand ou Redux | Gestion état complexe |
| **UI Components** | Material-UI ou Ant Design | Composants professionnels |
| **HTTP Client** | Axios | Requêtes REST simplifié |
| **Charts** | Chart.js / Recharts | Visualisations |
| **Excel Export** | SheetJS | Export client-side |
| **Testing** | Jest + React Testing Library | QA frontend |

### Desktop App
| Component | Technology | Justification |
|-----------|----------|---------------|
| **Framework** | Electron | Accès OS native + même code que web |
| **Integration** | Calls backend via HTTP | Partage logique métier |
| **File System** | Node.js fs / electron.ipc | Gestion fichiers locaux |
| **UI** | Réutilise frontend React | Pas de duplication |

### Database
| Component | Technology | Justification |
|-----------|----------|---------------|
| **SGBDR** | SQL Server 2019+ | Infrastructure existante |
| **Migrations** | Alembic | Versioning schema |
| **Connection** | pyodbc ou sqlalchemy-odbc | Native support |

### DevOps
| Component | Technology | Justification |
|-----------|----------|---------------|
| **Git** | Standard | Versioning |
| **Build Desktop** | electron-builder | Packaging Windows/Mac/Linux |
| **Deploy Web** | IIS (Windows) ou Linux | Déploiement facile |
| **Containerization** | Docker (optionnel) | Isolation, reproductibilité |

---

## 📁 STRUCTURE DOSSIERS

```
PCB_Production_Manager/
├── README.md
├── SPECS.md                          # Specifications (ce doc)
├── ARCHITECTURE.md                   # Architecture (ce doc)
├── ROADMAP.md                       # Plan de dev
│
├── src/
│   ├── backend/                     # API Python
│   │   ├── app.py                   # Point d'entrée FastAPI
│   │   ├── config.py                # Configuration (DB, settings)
│   │   ├── requirements.txt         # Dépendances Python
│   │   ├── .env.example             # Variables d'env
│   │   │
│   │   ├── routes/                  # Endpoints API
│   │   │   ├── __init__.py
│   │   │   ├── bom.py               # Routes BOM
│   │   │   ├── marketplace.py       # Routes Commandes
│   │   │   ├── pnp.py               # Routes PnP
│   │   │   ├── database.py          # Routes gestion BDD
│   │   │   └── settings.py          # Routes paramètres
│   │   │
│   │   ├── models/                  # Modèles SQLAlchemy + Pydantic
│   │   │   ├── __init__.py
│   │   │   ├── bom.py               # BOM_REFERENCES, BOM_ITEMS, etc
│   │   │   ├── components.py        # COMPONENTS, FOOTPRINT
│   │   │   ├── machines.py          # PNP_MACHINES, FEEDERS
│   │   │   └── commands.py          # COMMANDS, PRODUCTION_PLANS
│   │   │
│   │   ├── services/                # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── bom_service.py       # Import, harmonization
│   │   │   ├── harmony_rules.py     # Règles harmonisation
│   │   │   ├── feeder_assignment.py # Bin packing PnP
│   │   │   ├── sourcing_service.py  # Sélection fournisseur (Phase 2)
│   │   │   └── excel_export.py      # Export Excel
│   │   │
│   │   ├── utils/                   # Utilitaires
│   │   │   ├── __init__.py
│   │   │   ├── file_parser.py       # Parser BOM .txt
│   │   │   ├── validators.py        # Validation données
│   │   │   └── logger.py            # Logging
│   │   │
│   │   ├── tests/                   # Tests unitaires
│   │   │   ├── __init__.py
│   │   │   ├── test_bom.py
│   │   │   ├── test_harmony.py
│   │   │   ├── test_feeder.py
│   │   │   └── test_excel.py
│   │   │
│   │   └── migrations/              # Alembic (SQL migrations)
│   │       ├── env.py
│   │       ├── script.py.mako
│   │       └── versions/
│   │           └── 001_initial.py
│   │
│   │
│   ├── frontend/                    # React Web App
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── App.jsx
│   │   │   ├── package.json
│   │   │   │
│   │   │   ├── components/          # Composants React
│   │   │   │   ├── BOM/
│   │   │   │   │   ├── BomImport.jsx
│   │   │   │   │   ├── BomList.jsx
│   │   │   │   │   └── HarmonyReview.jsx
│   │   │   │   ├── Marketplace/
│   │   │   │   │   ├── CommandCreate.jsx
│   │   │   │   │   ├── CommandList.jsx
│   │   │   │   │   └── ExcelExport.jsx
│   │   │   │   ├── PnP/
│   │   │   │   │   ├── MachineSelect.jsx
│   │   │   │   │   ├── FeederAssignment.jsx
│   │   │   │   │   └── ProductionPlan.jsx
│   │   │   │   ├── Database/
│   │   │   │   │   ├── ComponentManager.jsx
│   │   │   │   │   ├── FootprintManager.jsx
│   │   │   │   │   └── MachineManager.jsx
│   │   │   │   ├── Settings/
│   │   │   │   │   └── SettingsPanel.jsx
│   │   │   │   └── Common/
│   │   │   │       ├── Navigation.jsx
│   │   │   │       ├── Layout.jsx
│   │   │   │       └── LoadingSpinner.jsx
│   │   │   │
│   │   │   ├── pages/               # Pages principales
│   │   │   │   ├── HomePage.jsx
│   │   │   │   ├── BomPage.jsx
│   │   │   │   ├── MarketplacePage.jsx
│   │   │   │   ├── PnpPage.jsx
│   │   │   │   ├── DatabasePage.jsx
│   │   │   │   └── SettingsPage.jsx
│   │   │   │
│   │   │   ├── api/                 # Client HTTP
│   │   │   │   ├── client.js        # Axios instance
│   │   │   │   ├── bom.js           # Appels API BOM
│   │   │   │   ├── marketplace.js   # Appels API Marketplace
│   │   │   │   ├── pnp.js           # Appels API PnP
│   │   │   │   └── database.js      # Appels API Database
│   │   │   │
│   │   │   ├── store/               # State management (Zustand)
│   │   │   │   ├── index.js
│   │   │   │   ├── bomStore.js
│   │   │   │   ├── commandStore.js
│   │   │   │   └── uiStore.js
│   │   │   │
│   │   │   ├── styles/              # CSS/SCSS
│   │   │   │   ├── App.css
│   │   │   │   └── components.css
│   │   │   │
│   │   │   └── tests/
│   │   │       ├── __snapshots__/
│   │   │       ├── BomImport.test.js
│   │   │       └── ExcelExport.test.js
│   │   │
│   │   └── .env.example
│   │
│   │
│   └── desktop/                     # Electron App
│       ├── main.js                  # Process principal Electron
│       ├── preload.js               # IPC security
│       ├── package.json
│       ├── public/                  # Assets
│       │   └── icon.png
│       │
│       └── src/                     # Réutilise frontend React
│           └── electron-utils.js    # Utilitaires Electron
│
│
├── database/                        # SQL & migrations
│   ├── migrations/
│   │   ├── 001_initial_schema.sql   # Création tables
│   │   └── 002_add_indexes.sql      # Optimisations
│   │
│   └── seeds/                       # Données initiales
│       └── initial_data.sql
│
│
├── docs/                           # Documentation
│   ├── GETTING_STARTED.md
│   ├── BOM_FORMAT.md               # Format fichier BOM Eagle
│   ├── HARMONY_RULES.md            # Règles harmonisation complètes
│   ├── API_DOCUMENTATION.md        # Endpoints API détaillé
│   └── DEPLOYMENT.md               # Guide déploiement
│
│
├── .gitignore
├── .env.example                    # Variables d'env (remplir avant use)
├── docker-compose.yml              # (Optionnel) Local dev with SQL Server
└── README.md                       # Vue d'ensemble projet

```

---

## 🔌 API ENDPOINTS (Sommaire)

### BOM Module
```
GET    /api/bom/references           # List toutes les références
GET    /api/bom/references/{ref}     # Détails une référence + revisions
POST   /api/bom/import               # Importer BOM .txt (multipart form)
GET    /api/bom/items/{revision_id}  # Items d'une révision
POST   /api/bom/harmonize            # Commencer harmonization review
PUT    /api/bom/harmonize/confirm    # Confirmer harmonization changes
```

### Marketplace Module
```
POST   /api/commands/create          # Créer liste commande
GET    /api/commands                 # List les commandes
GET    /api/commands/{id}            # Détails commande
POST   /api/commands/{id}/export     # Export Excel
DELETE /api/commands/{id}            # Supprimer
```

### PnP Module
```
GET    /api/pnp/machines             # List machines
POST   /api/pnp/assign-feeders       # Assigner feeders auto
GET    /api/pnp/assignments/{cmd_id} # Résultat assignment
POST   /api/pnp/production-plan      # Générer plan production
```

### Database Module
```
GET    /api/db/components            # List composants
POST   /api/db/components            # Ajouter composant
PUT    /api/db/components/{id}       # Modifier
DELETE /api/db/components/{id}       # Supprimer

GET    /api/db/footprints            # List footprints
POST   /api/db/footprints            # Ajouter
PUT    /api/db/footprints/{id}       # Modifier
DELETE /api/db/footprints/{id}       # Supprimer

GET    /api/db/machines              # List machines PnP
POST   /api/db/machines              # Ajouter
PUT    /api/db/machines/{id}         # Modifier
DELETE /api/db/machines/{id}         # Supprimer
```

### Settings Module
```
GET    /api/settings                 # Récupérer config
PUT    /api/settings                 # Modifier config
POST   /api/settings/test-db-connection  # Test connexion SQL
POST   /api/settings/export-db       # Backup BDD
POST   /api/settings/import-db       # Restore BDD
```

---

## 🗄️ SCHEMA BASE DE DONNÉES (Simplifié)

```sql
-- CORE TABLES
BOM_REFERENCES (id, reference, description, created_at, updated_at)
BOM_REVISIONS (id, bom_ref_id, revision, type, created_at, status)
BOM_ITEMS (id, bom_revision_id, reference_item, value_raw, value_harmonized, 
           footprint_eagle, footprint_pnp, quantity, dnp, notes)

-- COMPONENTS & MAPPING
COMPONENTS (id, reference, value, package, supplier_code, description, notes)
FOOTPRINT_MAPPING (id, footprint_eagle, footprint_pnp, machine_compatible, notes)

-- PNP DATA
PNP_MACHINES (id, name, num_positions, notes)
PNP_FEEDERS (id, size_mm, capacity, compatible_machines)

-- COMMANDS
COMMANDS (id, name, created_at, updated_at, status)
COMMAND_ITEMS (id, command_id, bom_revision_id, quantity_to_produce)
COMMAND_COMPONENTS (id, command_id, component_id, quantity_needed, supplier_preference)

-- PRODUCTION
PRODUCTION_PLANS (id, command_id, machine_id, created_at)
PLAN_ASSIGNMENTS (id, production_plan_id, feeder_position, component_id, quantity)
```

---

## 🚀 FLUX DE DONNÉES

### Flow 1: Import & Harmonization BOM
```
1. User choisit fichier .txt
2. Backend parse fichier (file_parser.py)
3. Validation format → erreurs si malformé
4. Extraction valeurs
5. Application règles harmonisation (harmony_rules.py)
6. Affichage diff avant/après
7. User confirme ou corrige
8. Stockage en BDD
9. Notification "BOM importée avec succès"
```

### Flow 2: Create Command
```
1. User sélectionne N BOMs + révisions + quantité
2. Backend agrège tous les items
3. Multiplie par quantité produite
4. Deduplique par composant
5. Crée entrée COMMANDS
6. Crée entrées COMMAND_ITEMS pour chaque composant
7. Status = "DRAFT"
8. List affichée en frontend
```

### Flow 3: PnP Feeder Assignment
```
1. User sélectionne commande + machine
2. Backend récupère items BOM + machine specs
3. Algorithme bin-packing:
   - Pour chaque composant: trouve feeder compatible
   - Assigne à position libre sur machine
   - Gère overflow (alerte ou split)
4. Calcule stats (nb feeders utilisés, compacité, etc)
5. Génère vue graphique
6. Sauvegarde en BDD (PRODUCTION_PLANS)
```

---

---

## 🎨 FRONTEND ARCHITECTURE (Phase 1)

### React Components Structure
```
src/frontend/
├── public/
│   └── index.html
├── src/
│   ├── index.jsx (React entry)
│   ├── App.jsx (Main layout)
│   ├── App.css
│   ├── index.css
│   └── components/
│       ├── BomImport.jsx (📌 Primary feature)
│       │   ├── File upload (drag & drop)
│       │   ├── Progress tracking
│       │   ├── Results display
│       │   ├── Statistics panel
│       │   └── Save dialog
│       └── BomImport.css
└── package.json
```

### Frontend Technologies
- **React 18.2.0** - UI framework
- **Material-UI 5.14** - Component library
- **Axios** - HTTP client
- **Zustand** - State management (ready for future use)

### Frontend Data Flow
```
BomImport Component
├─ State Management
│  ├─ file: Selected file
│  ├─ loading: Processing indicator
│  ├─ result: Harmonized data
│  ├─ error: Error messages
│  └─ dragActive: Drag state
├─ API Integration
│  └─ axios.post('/api/bom/import', formData)
├─ UI Elements
│  ├─ Drag & drop zone
│  ├─ Statistics cards
│  ├─ Warnings alert
│  └─ Results table
└─ User Actions
   ├─ Upload file
   ├─ Review results
   ├─ Save to database
   └─ Clear all
```

### Material-UI Components Used
- AppBar - Header navigation
- Container - Main layout wrapper
- Card - Grouped content sections
- Table - Detailed results display
- Dialog - Save confirmation
- Alert - Error/warning messages
- Chip - Status indicators
- Button - User actions
- Grid - Responsive layout
- TextField - Input fields
- CircularProgress - Loading state

### Environment Configuration
```javascript
// .env file for frontend
REACT_APP_API_URL=http://localhost:8000/api
REACT_APP_ENV=development
```

---

## ⚡ DESKTOP APPLICATION (Electron - Phase 1.5)

### Electron Main Process
```
src/desktop/src/
├── main.js (App initialization)
│  ├─ createWindow() - Create browser window
│  ├─ Load React dev server (dev)
│  ├─ Load production build (prod)
│  └─ Menu template
├── preload.js (Security layer)
│  └─ Expose safe APIs to React
└── package.json (Dependencies)
```

### Electron Window Configuration
```javascript
{
  width: 1400,
  height: 900,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: './preload.js'
  }
}
```

### Development vs Production
- **Dev**: Loads from http://localhost:3000 (React dev server)
- **Prod**: Loads from ./build/index.html (Optimized React build)

---

## 🔐 SÉCURITÉ & PERFORMANCE

### Sécurité
- ✅ CORS configuré (frontend + desktop)
- ✅ Validation input (Pydantic)
- ✅ SQL Injection protection (ORM SQLAlchemy)
- ✅ Logs sensibles masqués (mots de passe)
- ⏳ Phase 2: Auth (JWT, user roles)

### Performance
- ✅ Index SQL sur colonnes frequently queried
- ✅ Pagination pour listes longues (BOM > 200 composants)
- ✅ Caching frontend (localStorage)
- ✅ Async backend (FastAPI async)
- ⏳ Phase 2: Full-text search composants

---

## 📦 DÉPLOIEMENT

### Développement Local
```bash
# Backend
cd src/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py  # Runs http://localhost:8000

# Frontend Web
cd src/frontend
npm install
npm start  # Runs http://localhost:3000

# Desktop (from frontend build)
cd src/desktop
npm install
npm start  # Electron window opens
```

### Production
- Backend : Déployé sur serveur Windows (IIS) ou Linux (Gunicorn)
- Frontend : Build statique (React) servi par serveur web
- Desktop : Package avec electron-builder (ECB_Setup.exe)
- Database : SQL Server existant

---

## 📋 DÉPENDANCES CLÉS

### Backend (Python)
```
FastAPI==0.104.1
SQLAlchemy==2.0.23
pydantic==2.4.2
pyodbc==4.0.39  # SQL Server
pandas==2.1.1
openpyxl==3.10.10
python-dotenv==1.0.0
pytest==7.4.3
```

### Frontend (Node.js)
```
react==18.2.0
react-router-dom==6.15.0
axios==1.6.0
zustand==4.4.1
@mui/material==5.14.10
recharts==2.10.0
```

### Desktop (Electron)
```
electron==27.0.0
electron-builder==24.6.4
```

---

## ⏭️ PROCHAINES ÉTAPES ARCHITECTURE

1. **Valider** ce document
2. **Affiner** :
   - Format exact BOM Eagle (voir SPECS)
   - Règles harmonisation complètes
   - Détails bin-packing algorithm
3. **Valider** schema DB avec vous
4. **Commencer développement** phase par phase

