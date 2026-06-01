# Database Audit 2026-03-27

## Scope

This audit covers every data store currently used by the application:

- SQLite database: `database/dev.db`
- machine footprint source file: `database/machine_footprint_catalog.txt`
- derived BOM snapshots: `exports/bom_harmonized/**`
- frontend session persistence in browser `localStorage`
- runtime folders created from config: `uploads`, `exports`, `backups`, `logs`

## Current storage map

### Primary business data

- `database/dev.db`
  - Active local database defined by `DATABASE_URL=sqlite:///./database/dev.db`
  - Current size: `819200` bytes
  - Engine: SQLite
  - Tables found: `18`

### Secondary / side stores

- `database/machine_footprint_catalog.txt`
  - UTF-8 with BOM
  - `87` rows
  - Mirrors the content of `MACHINE_FOOTPRINT_RULES`
- `exports/bom_harmonized/**`
  - `45` files / `159303` bytes
  - Snapshot export generated from SQL data
  - Not a primary source of truth
- Frontend `localStorage`
  - Keys:
    - `pcb-production:active-production`
    - `pcb-production:current-bom:*`
    - `pcb-production:import-workspace:*`
    - `pcb-production:bom-workspace:*`
  - UI/session cache, not master data

### Duplicate runtime folders

- Root folders are actively used:
  - `exports`: `45` files
  - `logs`: `2` files
- Mirrored folders under `src/backend/` are mostly empty:
  - `src/backend/exports`: `0` files
  - `src/backend/uploads`: `0` files
  - `src/backend/backups`: `0` files
  - `src/backend/logs`: `1` small legacy log file

## Main findings

### 1. Schema drift exists in SQLite dev database

The codebase expects migrations and constraints, but the active SQLite file is not migration-tracked:

- no `alembic_version` table
- `PRAGMA user_version = 0`
- `ensure_sqlite_schema()` auto-adds missing columns with raw `ALTER TABLE`

Impact:

- columns can appear without their expected foreign keys
- columns can appear without their expected indexes
- local dev schema can diverge from models and Alembic history

### 2. Several expected indexes and foreign keys are missing in the real DB

Model definitions expect these links/indexes:

- `COMMANDS.production_id -> PRODUCTIONS.id`
- `COMPONENTS.fixed_cart_id -> PNP_CARTS.id`
- `PRODUCTIONS.machine_id -> PNP_MACHINES.id`
- indexed access on:
  - `BOM_REFERENCES.category`
  - `COMPONENTS.component_type`
  - `COMPONENTS.fixed_cart_id`
  - `COMMANDS.production_id`
  - `PRODUCTIONS.machine_id`

These are not fully present in the current `dev.db`.

Impact:

- integrity is enforced only by application code, not by the database
- query performance will degrade as data grows
- future migrations become harder because the local schema is already off-spec

### 3. SQLite foreign key enforcement is disabled

Current DB check:

- `PRAGMA foreign_keys = 0`

Current data has no detected orphan rows, but this is fragile because SQLite will not protect referential integrity unless the connection enables FK enforcement.

### 4. `MACHINE_FOOTPRINT_CATALOG` looks like a dead table

Observed state:

- table exists but contains `0` rows
- routes named "machine footprints" actually read `MACHINE_FOOTPRINT_RULES`
- application logic is built on `MachineFootprintRule` plus aggregation in service code

Impact:

- duplicated concepts
- confusing naming
- unnecessary schema surface

### 5. The machine footprint catalog currently has two sources of truth

Observed state:

- `database/machine_footprint_catalog.txt`: `87` rows
- `MACHINE_FOOTPRINT_RULES`: `87` rows
- same business content, different storage formats

This is manageable if the text file is treated as an import source only. It becomes risky if users edit both the file and the DB independently.

### 6. Categories are semi-normalized

Current model:

- `BOM_REFERENCES.category` stores category as free text
- `BOM_CATEGORIES` stores a reusable category catalog
- helper logic auto-creates missing catalog entries
- category listings merge both the catalog and distinct category strings already used by references

Current data:

- `BOM_CATEGORIES`: `2` rows
- `BOM_REFERENCES`: `16` rows
- references with category filled: `0`

Impact:

- flexible, but not fully normalized
- no hard relation between a reference and a catalog row
- hard to enforce naming consistency if categories start growing

### 7. BOM snapshots on disk duplicate SQL content by design

`exports/bom_harmonized/**` stores files derived from `BOM_ITEMS` / `BOM_REVISIONS`.

This is valid if they are treated as:

- exports
- compatibility snapshots
- cache for file-based workflows

This is risky if they are edited manually and later assumed to be authoritative.

### 8. Frontend localStorage is a separate persistence layer

The frontend keeps active production, imported BOM state, import workspace and BOM workspace in `localStorage`.

This is useful UX-wise, but it means some "current session truth" may differ from the SQL database until the user explicitly saves or refreshes.

### 9. Data quality is mixed but still manageable

Selected indicators from current DB:

- `BOM_ITEMS`: `5410`
- `COMPONENTS`: `363`
- `FOOTPRINT_MAPPING`: `169`
- `MACHINE_FOOTPRINT_RULES`: `87`
- `MACHINE_FOOTPRINT_CATALOG`: `0`

Null / completion observations on `COMPONENTS`:

- missing `mpn`: `355`
- missing `component_type`: `295`
- missing `feeder_type`: `106`
- missing `tape_width_mm`: `118`
- missing `pitch_mm`: `154`

Interpretation:

- the schema is usable
- the library is not mature enough yet to act as a fully curated master data source

## Optimization opportunities

### High priority

1. Re-baseline SQLite schema so local DB matches models/migrations again.
2. Stop relying on automatic additive schema sync for structural changes.
3. Recreate missing indexes and foreign keys through controlled migrations.
4. Enable SQLite foreign key enforcement on every connection.

### Medium priority

5. Decide whether machine footprint truth lives in:
   - SQL only
   - text file only
   - SQL with explicit import/export pipeline
6. Remove or repurpose `MACHINE_FOOTPRINT_CATALOG`.
7. Decide whether BOM categories should stay free-text + catalog, or become fully normalized.
8. Mark `exports/bom_harmonized` as cache/export only, not editable source data.

### Low priority

9. Consider SQLite tuning for desktop usage:
   - `journal_mode = WAL`
   - periodic `VACUUM`
   - periodic `ANALYZE`
10. Clean unused mirrored runtime folders under `src/backend/`.

## Suggested roadmap

### Phase 1: safety and observability

- backup current `dev.db`
- dump current schema
- compare all local databases against models
- add a startup warning when schema drift is detected

### Phase 2: schema normalization

- restore missing FK/index coverage
- reintroduce Alembic tracking for local DBs
- disable structural drift from auto-sync

### Phase 3: source-of-truth cleanup

- choose one authority for machine footprint data
- choose one authority for BOM category data
- classify filesystem snapshots as export/cache or promote them intentionally

### Phase 4: performance and maintenance

- add maintenance commands for backup, vacuum, analyze, integrity check
- remove unused runtime mirror folders

## Conclusion

The application does not currently suffer from obvious data corruption, and integrity checks are clean today. The main problem is architectural drift:

- one primary SQLite DB
- several secondary persistence layers
- a local schema that no longer exactly matches the code and migrations

The next step should not be "compact blindly". The right first move is to choose the desired source of truth for each data domain, then align schema, constraints, folders and workflows around that decision.
