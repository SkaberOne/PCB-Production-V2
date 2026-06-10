# ROADMAP DE DÉVELOPPEMENT - PCB Flow Production Suite

**Version** : 1.0  
**Date** : 18/03/2026  
**Durée estimée** : 12-16 semaines (MVP)  

---

## 📊 VUE D'ENSEMBLE

```
Phase 1: Fondations (Semaines 1-3)
├── Infrastructure dev
├── Schema BDD + migrations
└── Structure backend/frontend

Phase 2: BOM (Core) (Semaines 4-7)
├── Parser BOM Eagle
├── Harmonisation composants
├── Import/export
└── Tests

Phase 3: Marketplace (Semaines 8-10)
├── Création commandes
├── Agrégation composants
├── Export Excel
└── Tests

Phase 4: PnP (Semaines 11-13)
├── Feeder assignment (bin packing)
├── Visualisation machine
├── Production planning
└── Tests

Phase 5: Polish & Deployment (Semaines 14-16)
├── Database UI management
├── Settings & Configuration
├── Electron packaging
├── User testing & bugfixes
└── Documentation finale

Phase 2+ : Intégrations Avancées (Post-MVP)
├── APIs fournisseurs (Farnell, Digi-Key, RS, Mouser)
├── Costing avancé
├── Analytics
└── Multi-user synchronization
```

---

## 📅 DÉTAIL PAR PHASE

### PHASE 1: FONDATIONS (3 SEMAINES)

#### Semaine 1: Setup & Infrastructure

**Tâches**
- [ ] Git repo setup (branches: main, develop, feature/*)
- [ ] Structure dossiers (backend, frontend, desktop, database)
- [ ] Backend :
  - [ ] Créer venv Python 3.11+
  - [ ] Installer dépendances (FastAPI, SQLAlchemy, etc)
  - [ ] Config fichier (settings.py)
  - [ ] Connexion SQL Server (test)
  - [ ] Alembic setup pour migrations
- [ ] Frontend :
  - [ ] Create React App
  - [ ] Structure composants
  - [ ] Setup Zustand store
  - [ ] Setup Axios client
- [ ] Desktop :
  - [ ] Setup Electron boilerplate
  - [ ] IPC communication (electron.js ↔ backend)

**Dépendances** : Aucune (commencer)  
**Validations** : 
- ✅ `python app.py` lance API sur 8000
- ✅ `npm start` lance React sur 3000
- ✅ Connection test.sql fonctionne ou existe

---

#### Semaines 2-3: Database Schema & Migrations

**Tâches**
- [ ] Créer schema SQL Server (tous les ALTER TABLE de SPECS.md)
- [ ] Créer migrations Alembic
  - [ ] 001_initial_schema.py
  - [ ] 002_add_indexes.py
  - [ ] 003_add_constraints.py
- [ ] Tester migrations (up/down)
- [ ] Créer seed data initial (machines, feeders, composants de test)
- [ ] Backend : Écrire modèles SQLAlchemy
  - [ ] models/bom.py
  - [ ] models/components.py
  - [ ] models/machines.py
  - [ ] models/commands.py
- [ ] Backend : Setup ORM tests
  - [ ] Test création/lecture/update/delete

**Dépendances** : Semaine 1  
**Validations** :
- ✅ `alembic upgrade head` crée toutes tables
- ✅ `SELECT COUNT(*) FROM BOM_REFERENCES` = 0 ou seed data OK

---

### PHASE 2: BOM (CORE) (4 SEMAINES)

#### Semaine 4: Parser & Import

**Tâches**

**PRIORITÉ 1 - Récupérer format BOM Eagle**
- [ ] **Vous** : Fournir exemple fichier BOM Eagle (.txt)
- [ ] Analyser structure (colonnes, délimiteurs, encodage)
- [ ] Documenter dans `docs/BOM_FORMAT.md`

**Implémenter Parser**
- [ ] Backend : Create `utils/file_parser.py`
  - [ ] Fonction `parse_bom_txt(file_bytes) → list of dicts`
  - [ ] Validation colonnes requises
  - [ ] Handling de Erreurs (malformé, encoding issues)
  - [ ] Tests (10+ BOM examples de test)
- [ ] Frontend : Créer `components/BOM/BomImport.jsx`
  - [ ] File upload UI
  - [ ] Type sélection (TOP/BOT)
  - [ ] Reference + revision input
  - [ ] Preview des données parsées

**Routes API**
- [ ] `POST /api/bom/import` (multipart form-data)
- [ ] Validation (reference unique par revision)
- [ ] Stockage en BDD
- [ ] Return: `{ status, bom_id, items, errors }`

**Dépendances** : Phase 1 + Format BOM  
**Validations** :
- ✅ Upload fichier .txt → parsed correctement ou erreur explicite
- ✅ BDD : `SELECT * FROM BOM_ITEMS WHERE bom_revision_id = X` = correct count

---

#### Semaines 5-6: Harmonisation

**Tâches**

**PRIORITÉ 1 - Définir règles complètes**
- [ ] **Vous** : Fournir liste complète harmonisation
  - [ ] Résistances (ohm, k, M formats)
  - [ ] Capacités (µF, nF, pF formats)
  - [ ] Inductances (H, mH, µH)
  - [ ] Diodes, transistors, ICs (standards ?)
  - [ ] Custom rules (à vos BOM spécifiques)
- [ ] Documenter dans `docs/HARMONY_RULES.md`

**Implémenter Harmonisation**
- [ ] Backend : Create `services/harmony_rules.py`
  - [ ] Parse valeur + unité
  - [ ] Dictionnaire règles (case-insensitive, alias, etc)
  - [ ] Fonction `harmonize(value_raw) → value_standard`
  - [ ] Score confiance "auto-correct" vs "need review"
- [ ] Tests unitaires (100+ cas)
  - [ ] Cas normaux (nF→nF, 10k→10kΩ)
  - [ ] Cas edge (sans unité, typos courants)
  - [ ] Cas ambigus (need review)

**Frontend : Review UI**
- [ ] Créer `components/BOM/HarmonyReview.jsx`
  - [ ] Table : original | harmonisé | confiance
  - [ ] Filtrer par "auto OK", "need review", "error"
  - [ ] Editer manuellement corrections
  - [ ] Bouton "Confirm Changes"

**Routes API**
- [ ] `POST /api/bom/harmonize` (bom_revision_id)
  - [ ] Return: list de (original, harmonized, confidence, suggestions)
- [ ] `PUT /api/bom/harmonize/confirm` (corrections user)

**Dépendances** : Semaine 4 + Règles harmonisation  
**Validations** :
- ✅ 95%+ des cas courants auto-harmonisés correctement
- ✅ Cas ambigus flagged "need review" avec alternatives proposées
- ✅ BDD stocke value_raw et value_harmonized séparément

---

#### Semaines 7: Management UI + Export

**Tâches**

**Frontend : List & Management**
- [ ] `components/BOM/BomList.jsx`
  - [ ] List toutes références
  - [ ] Expander par référence (revisions A, B, C)
  - [ ] Affiche TOP/BOT items count
  - [ ] Boutons Delete, Export, View
- [ ] Details view (editable)
  - [ ] Items avec valeurs harmonisées
  - [ ] Footprint Eagle/PnP
  - [ ] Quantity, DNP toggle

**Implémenter Routes API**
- [ ] `GET /api/bom/references` (search, pagination)
- [ ] `GET /api/bom/references/{ref}` (détails + revisions)
- [ ] `GET /api/bom/{revision_id}/items` (all items)
- [ ] `DELETE /api/bom/{revision_id}` (soft delete)
- [ ] `POST /api/bom/{revision_id}/export` (Excel/txt export)

**Tests**
- [ ] Integration tests (import → harmonize → list → export)
- [ ] Performance (> 200 items BOM, query speed < 1s)

**Dépendances** : Semaines 4-6
**Validations** :
- ✅ Import 5 BOMs → list OK → harmonize → export OK
- ✅ Edit item footprint → persist en BDD
- ✅ Delete revision → cascade OK ou soft-delete

---

### PHASE 3: MARKETPLACE (3 SEMAINES)

#### Semaine 8: Create Command & Aggregation

**Tâches**

**Frontend**
- [ ] `components/Marketplace/CommandCreate.jsx`
  - [ ] Multiselect BOMs (référence, revision, TOP/BOT)
  - [ ] Input qty to produce par BOM
  - [ ] Preview aggrégé (total components)
  - [ ] Bouton "Create Command"

**Backend : Aggregation Logic**
- [ ] `services/sourcing_service.py` (placeholder for Phase 2)
  - [ ] Fonction `aggregate_bom_items(list of bom_revisions, quantities) → list of aggregated_items`
  - [ ] Deduplicate par component
  - [ ] Multiplie par quantity produced
  - [ ] Sort par référence/valeur
  - [ ] Tests (simple + complex scenarios multi-BOM)

**Routes API**
- [ ] `POST /api/commands/create`
  - [ ] Input: `{ name, items: [{ bom_revision_id, qty }, ...] }`
  - [ ] Output: `{ command_id, total_components, items_aggregated }`
  - [ ] Status = "DRAFT"
- [ ] `GET /api/commands` (list + filtering)
- [ ] `GET /api/commands/{id}` (détails)

**Dépendances** : Phase 2  
**Validations** :
- ✅ Create 2 BOMs × 10 cartes each = correct aggregation
- ✅ Duplicate components merged correctly
- ✅ BDD : COMMANDS + COMMAND_ITEMS created

---

#### Semaine 9: Excel Export

**Tâches**

**Spécification Format Excel**
- [ ] **Vous** : Définir format exact pour Excel export
  - [ ] Colonnes requises ?
  - [ ] Filtres/groupement ?
  - [ ] Mise en forme spéciale ?

**Implémenter Export**
- [ ] Backend : `services/excel_export.py`
  - [ ] Fonction `export_command_to_excel(command_id) → bytes (xlsx file)`
  - [ ] Utilise openpyxl
  - [ ] Format professionnel (header, couleurs, formulas optionnel)
- [ ] Frontend : `components/Marketplace/ExcelExport.jsx`
  - [ ] Bouton "Export to Excel"
  - [ ] Download file
  - [ ] Confirmation "Exported successfully"

**Routes API**
- [ ] `POST /api/commands/{id}/export`
  - [ ] Return: file (xlsx)

**Tests**
- [ ] Export → open Excel → verify données → matches DB

**Dépendances** : Semaine 8 + Spécification Excel  
**Validations** :
- ✅ Export command → .xlsx file valid
- ✅ Open in Excel, data OK, formulas work
- ✅ Re-import en Python (pandas) parse OK

---

#### Semaine 10: List Management & Status

**Tâches**

**Frontend : Command Management**
- [ ] `components/Marketplace/CommandList.jsx`
  - [ ] Table commands (name, date, status, items count)
  - [ ] Filtrer par status (DRAFT, READY, ARCHIVED, etc.)
  - [ ] Boutons Edit, Export, View Details, Delete
- [ ] Details view
  - [ ] Items aggregés en table
  - [ ] Modify quantities
  - [ ] Ajouter/supprimer items

**Routes API**
- [ ] `PUT /api/commands/{id}` (update name, qty, status)
- [ ] `DELETE /api/commands/{id}` (soft delete)
- [ ] Workflow: DRAFT → READY → SENT → RECEIVED → ARCHIVED

**Tests**
- [ ] CRUD operations complets

**Dépendances** : Semaines 8-9  
**Validations** :
- ✅ Create, Read, Update, Delete, Export all working

---

### PHASE 4: PnP (3 SEMAINES)

#### Semaine 11: Feeder Assignment Algorithm

**Tâches**

**PRIORITÉ 1 - Clarifier specifications**
- [ ] **Vous** : Détails machines PnP
  - [ ] Types exactes (Neoden NLX600 ?, autres ?)
  - [ ] Nombre positions par machine ?
  - [ ] Feeders supportés (8mm, 12mm, 16mm ?) ?
  - [ ] Contraintes spéciales ?
- [ ] Documenter dans specs

**Implémenter Algorithm**
- [ ] `services/feeder_assignment.py`
  - [ ] Fonction `assign_feeders(command_id, machine_id, top_bot) → assignment`
  - [ ] Bin packing algorithm :
    ```
    FOR EACH component IN command:
      - Get footprint (package 0603, LQFP48, etc)
      - Find compatible feeder type (8/12/16mm)
      - Find first available position on machine
      - IF no position: 
        - Option A: Alert "overflow", split to 2nd machine
        - Option B: Error + suggest smaller machine
        - (decider avec vous)
      - Assign component to position
    OUTPUT:
      - position → component mapping
      - stats (usage %, n feeder types, etc)
      - warnings if any
    ```
  - [ ] Tests : >10 scenarios (simple → complex multi-feeder)

**Routes API**
- [ ] `POST /api/pnp/assign-feeders`
  - [ ] Input: `{ command_id, machine_id, top_bot }`
  - [ ] Output: `{ assignments, stats, warnings }`
  - [ ] Status = "ASSIGNED"

**Dépendances** : Phase 3 + Specs machines  
**Validations** :
- ✅ Simple BOM (5 items) → correct assignment
- ✅ Complex BOM (50 items) → handled correctly
- ✅ Overflow scenario → alerte ou split

---

#### Semaine 12: Visualization & Production Plan

**Tâches**

**Frontend : PnP UI**
- [ ] `components/PnP/MachineSelect.jsx`
  - [ ] List machines (refresh from DB)
  - [ ] Select one
  - [ ] Select TOP/BOT/BOTH
- [ ] `components/PnP/FeederAssignment.jsx`
  - [ ] Add button "Generate Assignment"
  - [ ] View result (position → component table)
  - [ ] Show stats (feeder types, usage %)
  - [ ] Show warnings if any
- [ ] Visual representation (nice-to-have)
  - [ ] Graphe machine (position 1-60 mapped to feeders)
  - [ ] Color code by feeder type

**Backend : Production Plan Generation**
- [ ] `services/pnp_service.py`
  - [ ] Fonction `generate_production_plan(command_id, assignment_data) → plan_id`
  - [ ] Crée entrée PRODUCTION_PLANS
  - [ ] Crée entrées PLAN_ASSIGNMENTS
  - [ ] Stocke visual data (JSON pour position→component)

**Routes API**
- [ ] `GET /api/pnp/machines` (list + details: num positions, etc)
- [ ] `GET /api/pnp/assignments/{command_id}/{machine_id}` (fetch existing)
- [ ] `POST /api/pnp/production-plan` (save plan)
- [ ] `GET /api/pnp/plans/{plan_id}` (fetch for view)

**Downloads : Production Plan**
- [ ] Export as PDF (machine graphe + item list)
- [ ] Export as proprietary format (if machine-specific)

**Tests**
- [ ] Assign → Generate plan → Export → verify

**Dépendances** : Semaine 11  
**Validations** :
- ✅ Assign → visualize OK
- ✅ Statistics correct
- ✅ Export PDF/proprietary readable

---

#### Semaine 13: Machines & Feeders Management

**Tâches**

**Database Management UI**
- [ ] `components/Database/MachineManager.jsx`
  - [ ] CRUD machines
  - [ ] Define : name, num positions, compatible feeders
  - [ ] Add/edit/delete
- [ ] `components/Database/FeederManager.jsx`
  - [ ] CRUD feeder types
  - [ ] Define : size (8/12/16mm), capacity, compatible machines
  - [ ] Add/edit/delete (avec validations)

**Routes API**
- [ ] `GET /api/db/machines`
- [ ] `POST /api/db/machines`
- [ ] `PUT /api/db/machines/{id}`
- [ ] `DELETE /api/db/machines/{id}`
- [ ] `GET /api/db/feeders`
- [ ] `POST /api/db/feeders`
- [ ] `PUT /api/db/feeders/{id}`
- [ ] `DELETE /api/db/feeders/{id}`

**Tests**
- [ ] CRUD + validation

**Dépendances** : Semaines 11-12  
**Validations** :
- ✅ CRUD machines OK
- ✅ CRUD feeders OK
- ✅ Constraints respected (can't delete feeder in use, etc)

---

### PHASE 5: POLISH & DEPLOYMENT (3 SEMAINES)

#### Semaine 14: Database Management UI

**Tâches**

**Backend : Import/Export BDD**
- [ ] Routes API :
  - [ ] `POST /api/settings/export-db` (SQL backup ou JSON export)
  - [ ] `POST /api/settings/import-db` (restore)

**Frontend : Database Management**
- [ ] `components/Database/ComponentManager.jsx`
  - [ ] List all COMPONENTS
  - [ ] Search / filter
  - [ ] CRUD individual component
  - [ ] Bulk import Excel ? (optionnel)
- [ ] `components/Database/FootprintManager.jsx`
  - [ ] List FOOTPRINT_MAPPING
  - [ ] Search Eagle ↔ PnP
  - [ ] CRUD mapping
  - [ ] Bulk import Excel (vous aviez mentionné)
- [ ] `components/Settings/SettingsPanel.jsx`
  - [ ] DB Connection test
  - [ ] Backup/Restore
  - [ ] Folder settings

**Routes API**
- [ ] (Most already done in Phase 4)
- [ ] `GET /api/settings`
- [ ] `PUT /api/settings`
- [ ] `POST /api/settings/test-connection`

**Tests**
- [ ] Export → Import → Verify data intact

**Dépendances** : Toutes phases précédentes  
**Validations** :
- ✅ Full CRUD all DB tables working
- ✅ Backup/restore OK

---

#### Semaine 15: Configuration & Packaging

**Tâches**

**Frontend : Final UI Polish**
- [ ] Navigation menu (consistent style)
- [ ] Error handling UI (toasts for errors)
- [ ] Loading states
- [ ] Responsive design (tablets ?)
- [ ] Localization : FR labels all screens

**Backend : Final Optimizations**
- [ ] Query performance (add indexes if needed)
- [ ] Error handling / validation complete
- [ ] Logging setup
- [ ] .env configuration (DB credentials, etc)

**Desktop : Electron Packaging**
- [ ] Build React : `npm run build`
- [ ] Package Electron : `electron-builder`
  - [ ] Output: `ECB_Manager_1.0.0_Setup.exe`
  - [ ] Auto-updater (optionnel Phase 2)

**Tests**
- [ ] Full end-to-end workflow :
  - [ ] Import BOM → Harmonize → Create Command → Assign Feeders → Export
  - [ ] All DB operations

**Dépendances** : Semaine 14  
**Validations** :
- ✅ .exe can be installed + runs
- ✅ All features working in packaged app
- ✅ DB connection from packaged app OK

---

#### Semaine 16: Documentation & User Testing

**Tâches**

**Documentation**
- [ ] `docs/GETTING_STARTED.md` - Installation guide
- [ ] `docs/BOM_FORMAT.md` - BOM file specs
- [ ] `docs/HARMONY_RULES.md` - All harmonization rules
- [ ] `docs/API_DOCUMENTATION.md` - API reference (auto-gen from Swagger)
- [ ] `docs/DEPLOYMENT.md` - Production deployment
- [ ] `docs/TROUBLESHOOTING.md` - Common issues & fixes
- [ ] In-app help ? (optionnel)

**User Testing**
- [ ] Vous testez workflow complet
- [ ] Report bugs / improvements
- [ ] Final tweaks

**Bugfixes & Polish**
- [ ] Address user feedback
- [ ] Final visual polish
- [ ] Performance optimizations if needed

**Dépendances** : Semaine 15  
**Validations** :
- ✅ All docs complete
- ✅ User can follow guide → app working
- ✅ No critical bugs

---

## 🎯 PHASE 2+ : POST-MVP FEATURES

**À planifier après Phase 1:**

### Phase 2a: Supplier APIs (✨ High Value)
- Integrate Farnell, Digi-Key, RS, Mouser APIs
- Fetch real-time prices + stock
- Implement smart supplier selection algorithm
- Estimated: 3-4 weeks

### Phase 2b: Advanced Costing
- Implement costing engine (PCB + stencil + components + labor)
- Cost per board / per batch calculations
- Reporting
- Estimated: 2 weeks

### Phase 2c: Analytics & Reporting
- Historical data (costs, suppliers, production times)
- Dashboards
- Estimated: 2-3 weeks

### Phase 2d: Multi-User & Sync
- User authentication (JWT)
- Role-based access control (Technician, Buyer, Admin)
- Real-time sync (WebSockets)
- Estimated: 3-4 weeks

---

## 📊 TIMELINE SUMMARY

| Phase | Focus | Weeks | Start | End |
|-------|-------|-------|-------|-----|
| **1** | Foundation | 3 | W1 | W3 |
| **2** | BOM (Core) | 4 | W4 | W7 |
| **3** | Marketplace | 3 | W8 | W10 |
| **4** | PnP | 3 | W11 | W13 |
| **5** | Polish | 3 | W14 | W16 |
| **MVP** | **Ready** | **16 weeks** | - | **W16** |

**Dépendances critiques :**
- Format BOM Eagle → doit être fourni Semaine 1
- Règles harmonisation complètes → doit être fourni Semaine 4
- Spécification Excel format → doit être fourni Semaine 8
- Spécifications machines PnP → doit être fourni Semaine 10

---

## 🚚 DELIVERABLES PAR PHASE

### Fin Phase 1
- Git repo with structure
- Working dev environment (API + React + Electron building)
- Database schema created & tested
- SQLAlchemy models
- Documentation: Architecture, Tech Stack

### Fin Phase 2
- BOM import working
- Harmonization working
- UI for import + review
- Tests coverage ~90%
- Documentaton: BOM format, Harmony Rules

### Fin Phase 3
- Command creation working
- Excel export working
- Complete CRUD for commands
- Tests ~90%

### Fin Phase 4
- Feeder assignment algorithm working
- Production planning working
- PnP UI complete
- Tests ~90%

### Fin Phase 5 (MVP)
- All features integrated
- Full documentation
- Packaged .exe installer
- Ready for production use
- User manual

---

## 🎓 SKILLS NEEDED

| Role | Skills | Commitment |
|------|--------|-----------|
| **Backend Dev** | Python, FastAPI, SQL, SQLAlchemy | Part/Full time |
| **Frontend Dev** | React, JavaScript, TypeScript (optional) | Part/Full time |
| **Database Admin** | SQL Server, performance tuning | Part time |
| **QA/Tester** | Test design, automation (pytest), Excel | Part time |

---

## ✅ ACCEPTANCE CRITERIA (MVP Complete)

- [ ] All 5 modules functional
- [ ] Can import BOM → export Excel → generate PnP plan
- [ ] Database fully integrated
- [ ] Packaged Windows installer works
- [ ] Documentation complete
- [ ] No critical bugs
- [ ] User testing approved

