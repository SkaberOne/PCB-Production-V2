# CHANGELOG — PCB Flow Production Suite

> Historique des sessions de développement, commits et corrections de bugs.
> Format : `## YYYY-MM-DD — Session N : titre`

---

## 2026-06-19 — Session 5 : Correctifs test terrain v1.0.6 (T-001/T-002/T-003)

### Contexte
Traitement des anomalies remontées par le test terrain de la release v1.0.6 sur le
poste atelier (mode prod **SQL Server**). Audit source :
`docs/audits/Audit_2026-06-18_test_terrain_release_v1.0.6.md` ; suivi :
`docs/JOURNAL_TESTS_RELEASE.md`. Trois correctifs livrés et mergés dans `dev`.

### T-001 / T-002 — dialecte SQL Server `dnp IS NOT 1` (PR #11, `4533ea6`)
- **Symptôme** : modules **Commande** et **Prix carte** bloqués en SQL Server (erreur
  pyodbc 102 « Syntaxe incorrecte vers '1' »). Invisible en SQLite (mode dev mono-poste).
- **Cause** : `BomItem.dnp.isnot(True)` rendu en `dnp IS NOT 1` ; T-SQL n'accepte
  `IS [NOT]` qu'avec `NULL`.
- **Fix** : 4 occurrences (`command_service.py:708`, `production_service.py:131` & `:583`,
  `report_service.py:89`) → forme NULL-safe `or_(BomItem.dnp == False, BomItem.dnp.is_(None))`.
- **Garde-fou** : `serveur/src/tests/test_sql_dialect_guard.py` échoue si `.isnot(<bool>)` /
  `.is_(<bool>)` réapparaît. Vérifié sur `ECB_Production` : sync commande + costing → HTTP 200.

### T-003 — import lot 2 faces → une seule face en revue (PR #12, `cae93ef`)
- **Symptôme** : import d'un lot recto/verso (TOP + BOT) → la revue n'exposait qu'une face ;
  production avec 1 BOM liée, 2ᵉ face silencieusement exclue de Commande / Machine PnP.
- **Fix** : helper `buildReviewSelectionFromSettled()` (`utils/importReview.js`) reconstruit
  la sélection de revue à partir de **toutes** les faces persistées du lot (face active en
  tête), câblé dans `components/BomImport.jsx` ; test `utils/__tests__/importReview.test.js`.
- **Vérifié E2E** : « 2 BOM dans la session » + `bom_count = 2`.

### Bonus — boot Alembic (PR #10, `db5cae9`)
- Erreur d'interpolation `%` d'Alembic au démarrage corrigée : `database.py` échappe
  l'URL (`set_main_option(..., settings.database_url.replace("%", "%%"))`).
  Test : `serveur/src/tests/test_alembic_url_escape.py`.

### Tests
- pytest : **376 passed, 1 skipped**. jest : suite frontend verte (dont `importReview.test.js`).

### Reste à faire
- Anomalies P3 T-004 → T-008 (cf audit §4). Puis release `dev → main` + re-test terrain
  (passer T-001/T-002/T-003 à « ✔️ Vérifié terrain »).

---

## 2026-06-05 — Session 4 : Réintégration Machine PnP en V2 (feature flag) + complétion P0/P1

### Contexte
Réintégration du « code mort » Machine PnP (~2 600 l. d'une 2e implémentation jamais
branchée) en une page V2 derrière feature flag, puis audit et complétion
fonctionnelle/dette. Audits : `docs/audits/Audit_2026-06-04_complet_pre_deploiement.md`
(§4.5) et `docs/audits/Audit_2026-06-04_machine_pnp_v2.md`. Branche `audit-restructure-2026-05`.

### Architecture & flag
- `pages/MachinePnpPage.jsx` devient un **routeur de flag** : page historique extraite
  en `MachinePnpPageLegacy.jsx` (repli, défaut) ; V2 = `components/machine/MachinePnpWorkspace.jsx`.
- `utils/featureFlags.js` : flag runtime `machinePnpPlan` (Electron > env > défaut `false`).

### Réintégration — Phase C (commits `b1b4c78` → `23f6309`)
- Fix de la **boucle infinie** historique de `useMachineConfig` (ref de fonction stable +
  signature de contenu + garde d'idempotence).
- Écriture des écrans d'assemblage absents du cluster : `MachineConfigDialog` (plan
  d'implantation : slot-strip, séquence, validation d'OF, détachement, feeders),
  `FixedFeederDialog`, `MachineCrudDialogs`.
- Suppression du code mort résiduel : `MachinePnpDialogs.jsx` (erreur de syntaxe l.195,
  jamais branché) + `useBomCategories.js`. Plus aucune implémentation en double.

### Complétion fonctionnelle — P0 (`a2c3f48`, `2abf60a`)
- Recherche / filtres / tri des feeders fixes (régression vs V1 comblée).
- Édition de machine via menu contextuel ; filtrage du plan par révision BOM + filtre
  commun/implantation.

### Robustesse & dette — P1 (`443aa62`, `221f1d0`, `ee156af`, `03f6361`)
- Garde de montage + « dernière requête gagne » sur les chargeurs des 3 hooks.
- Découpe : `MachineConfigDialog` 461→85 l. (panneaux), `useFixedFeeders` 375→241 l.,
  `useMachineConfig` 802→582 l. (sélecteurs extraits dans `useMachineConfigSelectors`).
- Bug corrigé **au test live** : `mountedRef` non remis à `true` au montage → spinner
  bloqué sous React 18 StrictMode (non détecté par `npm test` qui ne rend que la V1).

### Tests
- `npm test` : **73/73 verts** à chaque incrément. Test live Chrome (flag activé via env,
  clé API injectée pour contourner l'auth dev) : V2 rend, données chargent, dialogue de
  configuration OK.

### Reste à faire
- Découpe finale de `useMachineConfig` sous 300 l. — nécessite de fractionner le cœur
  effets/loop-fix ; reporté (ajouter d'abord un test de rendu V2 comme filet).
- Phase 3 : redesign du slot-strip / vue machine (lisibilité à 80 positions).

---

## 2026-06-03 — Session 3 : Intégration API fournisseurs (Mouser + DigiKey) + export ERP 12 colonnes

### Contexte
Intégrer les API fournisseurs dans la section Commande : prix/disponibilité,
tri multi-fournisseurs (moins cher / priorisé), enrichissement MPN, et refonte de
l'export ERP. Audit + décisions : `docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md`,
ADR `docs/adr/0004-supplier-api-connectors.md`.

### Backend
- **Modèle** : table `SUPPLIER_OFFERS` (cache prix/dispo/lien par composant×fournisseur)
  + table `ERP_DEFAULTS` (valeurs par défaut éditables). Migrations Alembic
  `g1b2c3d4e5f6` et `h2c3d4e5f6a7`.
- **Connecteurs** : `services/suppliers/` — interface commune `SupplierConnector` +
  `OfferDTO` (`base.py`), `MouserConnector` (clé query string), `DigiKeyConnector`
  (OAuth2 2-legged via `oauth.py`, inactif sans Client ID/Secret). Farnell/RS = un
  fichier à ajouter plus tard.
- **Service** `supplier_offer_service.py` : cache (TTL 24h), refresh temps réel,
  tri `cheapest`/`priority`, proposition + application MPN en revue manuelle.
- **Routes** : `/marketplace/supplier-offers` (cache), `/refresh`, `/best`,
  `/mpn-proposals`, `/mpn-apply` ; `/marketplace/erp-defaults` (GET/PUT).
- **Export ERP** : `ERP_HEADERS` passe de 10 → **12 colonnes** alignées sur le
  formulaire « Nouvelle Demande d'Achat ». Référence KT = `COMPONENTS.reference` ;
  fournisseur/réf/lien/description depuis l'offre retenue ; défauts ERP préremplis
  (Projet `PJ2601-00241…`, Demandeur `Eric Bouquet`, Validateur `Kevin Surrier`,
  Délai `URGENT`, Remarques `mise en bobine`, Unité `pièce`).
- **Config** : nouveaux champs `.env` (Mouser, DigiKey OAuth, TTL cache, défauts ERP) ;
  `.env.example` mis à jour ; `httpx` ajouté à `requirements_flexible.txt`.
- **Tests pytest** : `test_suppliers.py`, `test_supplier_offers.py`,
  `test_erp_export_v2.py` (17 verts) ; `test_export_command_erp_workbook` mis à jour
  pour le format 12 colonnes.

### Frontend
- `components/command/SupplierOffersPanel.jsx` : panneau prix/dispo avec menu de tri
  (moins cher / prioriser un fournisseur), bouton « Actualiser » (temps réel), chip
  de fraîcheur du cache. Intégré dans `CommandPage` sous le contexte ERP.
- `pages/ErpDefaultsPage.jsx` : écran admin des valeurs par défaut ERP
  (route `/parametre-erp`).
- `utils/supplierOffers.js` (tri/pricing purs) + tests jest
  `utils/__tests__/supplierOffers.test.js` (logique validée).

### À faire (Eric)
- Créer le compte DigiKey (developer.digikey.com) → renseigner `DIGIKEY_CLIENT_ID`
  / `DIGIKEY_CLIENT_SECRET` dans `serveur/.env`.
- Renseigner `MOUSER_API_KEY` (et **régénérer** la clé partagée en clair).
- Confirmer le libellé fournisseur attendu par l'import ERP (Mouser / Digi-Key).

---

## 2026-06-02 — Session 2 : Calcul bobine + extraction datasheets (EIA-481, sans LLM)

### Contexte
Deux objectifs : (1) fiabiliser le calcul du nombre de composants en bobine dans
l'onglet « Composant et stock » ; (2) extraire (sans LLM) les infos production des
datasheets PDF Mouser pour aider à remplir la base et le calcul.

### Objectif 1 — Calcul bobine (`client/src/frontend/src/utils/bomPlanning.js`)
- **Bug corrigé** : `buildStockSummary()` ne transmettait jamais `tapeThicknessMm`
  à `estimateReelQuantity()` → l'épaisseur de bande était toujours figée à la
  valeur par défaut, quel que soit le composant.
- Ajout du helper `defaultTapeThicknessMm(tapeWidthMm)` (1,0 / 1,2 / 1,5 mm selon
  largeur 8 / 12 / 16+ mm) ; défaut générique relevé de 0,8 → 1,0 mm.
- Agrégation de `componentTapeWidthMm` (parallèle au pitch) pour dériver le défaut.
- UI : champ « Épaisseur de bande (mm) » ajouté dans `BomStockDialog.jsx` (carte
  Bobine), avec affichage du défaut appliqué quand le champ est vide.
- Tests jest : `bomPlanning.test.js` (8/8 verts).

### Objectif 2 — Extraction datasheets (ADR 0003)
- **ADR 0003** + `STRUCTURE.md` + `.gitignore` : nouveau domaine `data/datasheets/`
  (`pdf/` source gitignored, `md/` généré versionné).
- **Table EIA-481** : `serveur/src/services/eia481_rules.py` (boîtier → pitch /
  largeur / feeder `CL8/CL12/CL16/CL24` / épaisseur défaut). Tests pytest.
- **Migration DB** `f2a8c1d4e6b0` : `qty_per_reel`, `reel_outer_diameter_mm`,
  `reel_hub_diameter_mm` ajoutés à `COMPONENTS` (+ modèle + schéma). Tête unique
  vérifiée, upgrade/downgrade OK.
- **Script** `serveur/extract_datasheet.py` (sans LLM) : pdfplumber/pypdf + regex
  (sections Tape & Reel / Packaging), table EIA-481 d'abord + PDF en complément,
  détection auto best-effort du boîtier, rendu Markdown en sections. Tests pytest.
- `pdfplumber>=0.11.0` ajouté à `requirements_flexible.txt`.
- 32 datasheets copiées depuis `pcb-debug-assistant` → fiches `.md` générées dans
  `data/datasheets/md/`.

### Tests
- pytest (nouveaux fichiers) : 18/18 verts · jest `bomPlanning` : 8/8 verts.
- Note : `test_migrations.py` reste obsolète (REVISION_CHAIN codée en dur, déjà
  signalé audit 2026-05-29) — non lié à cette session.

### Limitation connue
- L'auto-détection du boîtier ne couvre pas toutes les notations (ex. « SO-8 » vs
  « SOIC8 ») → confiance « basse » sur ces composants ; passer `--package` ou
  étendre la table EIA-481.

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
