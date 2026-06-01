# CHANGELOG — ECB Production Manager

> Historique des sessions de développement, commits et corrections de bugs.
> Format : `## YYYY-MM-DD — Session N : titre`

---

## 2026-05-29 — Session 1 : Audit complet + restructure profonde + setup vault Obsidian

### Contexte
Session inaugurale après migration vers nouveau PC. Plusieurs problèmes constatés :
incohérences UI (7), compatibilité Python 3.14, composants frontend de 1000+ lignes,
tests pytest cassés. L'utilisateur veut un audit complet, fixes, restructure, et
mise en place d'un système de suivi durable (vault Obsidian).

### Travail réalisé (26 phases au total)

**Backend Python** :
- Migration `datetime.utcnow()` → `utcnow()` helper timezone-aware (16 occurrences sur 9 fichiers)
  Critique car Python 3.14.5 émet DeprecationWarning sur chaque appel.
- Doublon `get_db()` retiré (re-export propre depuis `database.py`)
- Fix `CommandItem.bom_item_id` → `CommandItem.bom_revision_id` dans `report_service.py:164`
- Création `serveur/pytest.ini` (`pythonpath = src .`) — sans ça aucun test ne se collectait
- Fix `reference_designator` → `reference_item` dans 2 tests (drift modèle)
- Fix `value=` → `value_harmonized=` dans 2 tests
- Wrappage SQL textuel dans `text()` (SQLAlchemy 2.0 strict)
- Path Alembic corrigé (`src/backend/alembic` → `serveur/src/alembic`)

**Frontend React** :
- Page "Bibliothèque BOM" reconstruite (était placeholder) — layout tree+detail d'après le mockup
  Nouveaux composants : `BomLibraryDetail.jsx`, `BomFilesPage.jsx` réécrit
- Découpe `CommandPage.jsx` : 1137 → 855 lignes (-25%) — extraction `CommandLineRow`, `StockStatusChip`, `ErpContextForm`
- Découpe `BomImport.jsx` : 1431 → 1224 lignes (-14%) — extraction `runWithConcurrencyLimit` → `utils/concurrencyPool.js`
- Découpe `BomViewerPage.jsx` : 718 → 650 lignes (-9.5%) — extraction `downloadCsvFile` → `utils/csvDownload.js`

**Fixes UI (7 incohérences résolues)** :
- I1 : Page "Bibliothèque BOM" placeholder → reconstruite
- I2 : Doublon numéros sidebar/stepper → badges sidebar retirés
- I3 : "Save draft"/"Validate" en anglais → "Sauvegarder brouillon"/"Valider"
- I4 : Naming confus "Bibliothèque BOM" vs "Bibliothèque composants" → "BOM enregistrées" + "Catalogue composants"
- I5 : 11 chaînes sans accents sur SettingsPage (référentiels, Paramètres, sélectionné, démarrer, etc.)
- I6 : URL `/dashboard` → titre incohérent → `title: 'Productions'` aligné
- I7 : KPI Dashboard `--` froid → "En attente de session" italique grisé

**Documentation** :
- `CLAUDE.md` réécrit (concis, mapping skills→tâche, workflow 9 étapes)
- Audits consolidés dans `docs/audits/`
- Nouveau vault Obsidian à la racine (`.obsidian/`)
- Documents principaux créés : `Projet.md`, `Plan_Deploiement.md`, `CHANGELOG.md`, `Roadmap.md`

**Structure** :
- Racine nettoyée : suppression des runtime dirs résiduels (`backups/`, `exports/`, `logs/`, `uploads/`, `.pytest_cache/`)
- `docs/reports/` renommé en `docs/audits/`
- Audits renommés au format `Audit_YYYY-MM-DD_titre.md`
- Création `docs/adr/` (Architecture Decision Records)

**Investigation bug isolation tests** :
- Pattern transaction-per-test (canonical SQLAlchemy 2.x) implémenté
- Découverte : le pattern ne fonctionne pas avec SQLite (savepoints non strictement transactionnels)
- Vérifié par 3 PoC isolés en Python pur
- Solutions à terme documentées : migration tests SQL Server / PostgreSQL / pytest-postgresql

### Métriques avant/après

| Indicateur | Avant | Après |
|---|---|---|
| Tests backend pytest | 122/193 (63%) | **133/192 (69%)** |
| Incohérences UI majeures | 7 | **0** |
| Pages placeholder en prod | 1 | **0** |
| `datetime.utcnow()` déprécié | 16 | **0** |
| BomImport.jsx | 1431 lignes | 1224 (-14%) |
| CommandPage.jsx | 1137 lignes | 855 (-25%) |
| BomViewerPage.jsx | 718 lignes | 650 (-9.5%) |

### Découverte importante
**Perte de données DB diagnostiquée** : `serveur/database/dev.db` a été créé from scratch
le 2026-05-29 à 15:22 sur le nouveau PC. Le fichier n'avait jamais existé avant.
Cause : `.gitignore` exclut `*.db`, donc le clonage du projet n'a pas apporté la DB
de l'ancien PC. La DB de production (24 BOM, 380 composants, 1 machine PNP-01, 73 feeders,
3 chariots) est encore sur l'ancien PC et doit être copiée manuellement.

Voir : `docs/audits/Audit_2026-05-29_final.md` section 5 pour le détail technique.

### Commits associés
- `6671a4f` chore: snapshot initial avant audit-restructure
- `f51c952` refactor: audit & restructure 2026-05-29
- `2c3e88e` fix: bugs preexistants decouverts apres restructuring
- (En cours) docs: setup vault Obsidian + restructure docs/

### Notes
- Tests qui passent seuls mais échouent en suite : limitation SQLite, pas régression
- `MachinePnpPage.jsx` (1179 lignes) **non refactoré** : bug boucle infinie connu, mérite audit dédié

---
