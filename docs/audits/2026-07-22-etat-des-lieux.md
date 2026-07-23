# Audit — État des lieux PCB Flow Production Suite — 2026-07-22

> Audit exhaustif multi-agent (back + front + transverse) avec vérification adverse, complété d'une passe test-à-l'usage sur staging. Commit `dev` audité : intégration 001→012. **Lecture seule sur le code.**

## Résumé exécutif

Le socle est sain : **732 tests verts** (568 pytest + 164 npm) à l'intégration, aucune erreur console sur les écrans parcourus, architecture models/routes/services respectée dans l'ensemble. L'audit remonte **33 findings confirmés** (sur 58 bruts) + 3 findings d'usage.

Les points saillants :

- **Sécurité** : plusieurs faiblesses réelles exploitables surtout en **mode ouvert** (API_KEY non définie par défaut) — fuite de détails d'exception, path traversal, énumération de répertoires serveur, upload non plafonné. Aucune n'est un désastre en LAN de confiance authentifié, mais l'ensemble mérite un durcissement groupé.
- **Correctness** : 4 bugs francs côté backend, dont **2 endpoints capacité machine cassés à 100 %** (mauvais modèle interrogé) et une **suppression de production qui plantera en prod SQL Server** (FK oubliées — invisible en test car SQLite n'applique pas les FK).
- **Performance** : le **dashboard** cumule un N+1 massif (table Component relue plusieurs fois par production) — la latence grimpera avec le volume. Cluster de N+1 similaires ailleurs.
- **Front** : suppressions destructrices **sans confirmation**, erreurs d'action **invisibles** (affichées derrière le backdrop des dialogues), quelques props ignorées.

Aucun bloquant absolu, mais **3 dossiers prioritaires** avant d'optimiser : (1) bugs correctness francs, (2) durcissement sécurité, (3) N+1 dashboard.

## Risques prioritaires (à traiter en premier)

| # | Finding | Sévérité | Effort | Fichier |
|---|---------|----------|--------|---------|
| R1 | `delete_production` oublie `ProductionRun` + `ProductionComponentProgress` → IntegrityError FK en **prod SQL Server** (invisible en test SQLite) | majeur | M | serveur/src/services/production_workspace_service.py:622 |
| R2 | `check_machine_capacity` interroge `PnpCart` avec un id de `PnpMachine` → endpoint capacité **toujours cassé** (404 trompeur ou 500) | majeur | S | serveur/src/services/assignment_planning.py:1061 |
| R3 | `num_assignments` compté via une requête sur la **PK du plan** → toute la sortie capacité est fausse (carte pleine vue vide) | majeur | S | serveur/src/services/assignment_planning.py:1069 |
| R4 | `auto_assign_components` **tronque silencieusement** (zip) les composants si capacité insuffisante → plan incomplet annoncé « OK » | majeur | M | serveur/src/services/production_service.py:194 |
| R5 | Fuite systématique de `str(e)` (SQL/pyodbc/chemins) dans les 500 (~65 handlers) → divulgation schéma/arborescence | majeur | M | serveur/src/routes/marketplace_machines.py:67 |
| R6 | Path traversal : `sanitize_segment` ne neutralise pas `..` → écriture/suppression hors de `exports/bom_harmonized` via PATCH /bom/files | majeur | S | serveur/src/services/bom_file_service.py:35 |
| R7 | Énumération de répertoires serveur arbitraires via `root_path` (dry-run, non authentifié en mode ouvert) | majeur | S | serveur/src/routes/bom_catalogue_import.py:126 |
| R8 | Upload PDF lu sans plafond (`await file.read()`) → DoS mémoire ; seul upload qui contourne `read_upload_capped` | majeur | S | serveur/src/routes/marketplace_order_import.py:39 |

## Quick-wins (fort impact / faible effort)

R2, R3 (1 ligne chacun), R6, R7, R8 (quelques lignes), `defusedxml` sur le parseur Eagle, `get_db` canonique (6 imports), `PageHeader subtitle` ignoré (2 pages perdent leur sous-titre), `CostingPage` bouton actif avec `params=null`.

## Chantiers (fort impact / gros effort)

- **N+1 dashboard** (R-perf) : refonte de `report_service.get_productions_summary` + `can_i_produce` (joinedload, agrégats GROUP BY, sortir les full-scans Component de la boucle).
- **Durcissement sécurité** groupé (R5–R8 + TLS + CORS + fail-fast API_KEY).
- **Découpe** des méthodes/fichiers monolithiques (`assignment_planning` 447 lignes, `bom_components.py` 1060, `command_service` export ERP).

## Findings par domaine (confirmés)

### Backend — Correctness (5)

1. **[majeur/S]** `assignment_planning.py:1061` — `check_machine_capacity` fait `db.query(PnpCart)` avec un id de `PnpMachine`, puis lit `machine.num_positions` (attribut absent de PnpCart). Endpoint capacité toujours en échec. *Fix : `db.query(PnpMachine)`.*
2. **[majeur/S]** `assignment_planning.py:1069` — `num_assignments = len(query(ProductionPlan).filter(id==plan_id).all())` → toujours 0/1. *Fix : `query(PlanAssignment).filter(production_plan_id==plan_id).count()`.*
3. **[majeur/M]** `production_service.py:194` — `auto_assign_components` : `zip` tronque silencieusement si capacité insuffisante (docstring promet une ValueError). *Fix : lever ValueError listant les composants qui ne rentrent pas.*
4. **[majeur/M]** `production_workspace_service.py:622` — `delete_production` oublie `ProductionRun` et `ProductionComponentProgress` (FK NOT NULL, pas de cascade) → IntegrityError en prod SQL Server. *Fix : purger ces enfants avant `db.delete(production)` ; prévoir StockMovement liés.*
5. **[mineur/M]** `marketplace_command_core.py:40` — `except Exception → HTTPException(500, str(exc))` masque les vrais bugs et expose l'interne (pattern répété). *Fix : logger.exception + detail générique ; `except HTTPException: raise` avant le catch.*

### Backend — Sécurité (8)

1. **[majeur/M]** `marketplace_machines.py:67` (+~65 handlers) — `str(e)` renvoyé au client dans les 500 → fuite SQL/chemins ; court-circuite le handler global. *Fix : message générique + logger.exception.*
2. **[majeur/S]** `bom_file_service.py:35` — `sanitize_segment` ne neutralise pas `..`. *Fix : rejeter les segments `.`/`..` + vérifier `Path.resolve()` descendant de `storage_root`.*
3. **[majeur/S]** `bom_catalogue_import.py:126` — `root_path` client override sans validation → `os.listdir` sur chemin arbitraire. *Fix : ignorer root_path client ou valider confinement (`is_relative_to`).*
4. **[majeur/S]** `marketplace_order_import.py:39` — upload PDF sans plafond. *Fix : `read_upload_capped`.*
5. **[majeur/M]** `config.py:120` — `Encrypt=no` codé en dur (SQL en clair sur LAN) + user `sa`. *Fix : `Encrypt=yes` configurable via .env ; login applicatif dédié.*
6. **[mineur/S]** `parser_eagle.py:107` — `xml.etree.ElementTree` sur .brd/.sch utilisateur (expansion d'entités = DoS). *Fix : `defusedxml`.* (Étiquette « XXE » imprécise : impact = DoS authentifié.)
7. **[mineur/S]** `app.py:110` — `allow_credentials=True` + origine `'null'`. *Fix : retirer `'null'` ou `allow_credentials=False` (auth par header, impact faible).*
8. **[mineur/S]** `config.py:85` — API ouverte par défaut, aucun garde-fou en `api_env=production`. *Fix : fail-fast si production sans API_KEY.*

### Backend — Performance (10)

1. **[majeur/L]** `report_service.py:124` — `get_productions_summary` : toutes productions sans limite, puis par production SUM + can_i_produce + last Command + lazy-loads, sans joinedload. *Fix : joinedload + agrégats GROUP BY + sortir can_i_produce de la boucle.*
2. **[majeur/M]** `production_stock_service.py:256` — `can_i_produce` relit Component 2× et fait un N+1 loss (`_effective_loss_pct` requête par composant alors que le stock est déjà en mémoire). *Fix : lire `stocks[id].loss_pct` ; passer le lookup Component.*
3. **[majeur/M]** `costing_service.py:394` — `list_cards` : une requête ProductionCosting **par référence**. *Fix : 1 requête (window/MAX) → dict.*
4. **[majeur/S]** `production_service.py:516` — `get_plan_summary` : une requête Component **par assignation**. *Fix : `.in_(ids)` → dict.*
5. **[majeur/M]** `bom_components.py:918` — imports lourds (openpyxl/PDF) en `async def` avec corps synchrone → gèlent l'event loop. *Fix : handlers `def` ou `run_in_threadpool`.*
6. **[mineur/M]** `costing_service.py:305` — N+1 BomReference dans compute_production. *Fix : `.in_()`.*
7. **[mineur/M]** `bom_catalogue_import.py:77` — requêtes DB par ligne de BOM (existence + footprint rules). *Fix : précharger set de références + règles hors boucle.*
8. **[mineur/S]** `assignment_planning.py:835` — requête Component par pin épinglé. *Fix : `.in_()`.*
9. **[mineur/S]** `supplier_offer_service.py:326` — requête Component par item du batch MPN. *Fix : `.in_()`.*

### Backend — Architecture / dette (6)

1. **[majeur/L]** `assignment_planning.py:311` — méthode `get_machine_production_feeder_plan` de ~447 lignes. *Fix : extraire en helpers cohésifs.*
2. **[mineur/M]** `command_service.py:145` — export Excel ERP (openpyxl) mêlé au CRUD (classe 1008 lignes). *Fix : `command_export_service.py`.*
3. **[mineur/L]** `bom_components.py:1` — route 1060 lignes / ~25 endpoints, ORM en direct. *Fix : scinder par sous-domaine + pousser vers services.*
4. **[mineur/S]** `bom_components.py:38` — `from .bom import get_db` (6 modules) au lieu du canonique `..database`. *Fix : import canonique + retirer le re-export.*
5. **[mineur/M]** `command_service.py:718` — `get_command_summary` de 224 lignes. *Fix : extraire helpers.*
6. **[mineur/S]** `supplier_offer_service.py:189` — règle de tri d'offres dupliquée 3×. *Fix : centraliser clé de tri + prédicat in_stock.*

### Frontend — Correctness (2)

1. **[majeur/S]** `ClientOrdersPage.jsx:72` — `loadShared` avale les erreurs (`{/* ignore */}`) → Autocomplete cartes/machines vides sans message. *Fix : `setError(...)` dans le catch.*
2. **[mineur/S]** `CostingPage.jsx:114` — bouton « Appliquer » actif avec `params=null` → TypeError (message générique). *Fix : `if (!params||!inputs) return;` + condition disabled.*

### Frontend — UX/UI (3)

1. **[majeur/M]** `ClientOrdersPage.jsx:357` — suppressions destructrices (client + son historique, commande, modèle machine) **sans confirmation** (ConfirmDialog existe mais non utilisé). *Fix : intercaler ConfirmDialog avec portée.*
2. **[majeur/M]** `ClientOrdersPage.jsx:83` — erreurs d'action affichées **derrière le backdrop** des dialogues (invisibles) ; pas de feedback de succès. *Fix : Alert dans le DialogContent ou Snackbar global (zIndex).*
3. **[mineur/S]** `ClientOrdersPage.jsx:81` / `BoardStockPage.jsx:112` — prop `subtitle` ignorée par PageHeader (sous-titre jamais rendu). *Fix : `description=` (API réelle) ou alias `subtitle`.*

## Findings d'usage (staging, Chrome)

- **`/command` s'affiche vide** en accès direct (aucun état-vide/guidage ; titre « Productions » incohérent avec l'onglet Commande). *Ajouter un empty-state.*
- **Prix carte** : la rangée de cartes de résultat **+ le bouton « Appliquer » débordent horizontalement** (coupés à largeur standard, pas responsive). *Rendre la rangée scrollable/wrap et fixer l'action.*
- **Stock cartes** : libellés de révision **incohérents** (`REV_A` / `A` / `F` / `—`) selon la source d'import (011 = `Rev.X` → `A` ; legacy = `REV_A`), + doublons de référence avec révision `—`. *Normaliser l'affichage/stockage des révisions.*
- Positif : **zéro erreur console** sur les écrans parcourus (dashboard, import, revue, commande, PnP, stock, cartes, prix, import catalogue, paramètres).

## Pistes NON vérifiées (limite de session atteinte pendant le run)

La vérification adverse des lentilles **front-archi** et **transverse** n'a pas pu s'exécuter (limite session ~17h UTC). Les agents avaient signalé des pistes sur les fichiers suivants — **à re-vérifier** avant action (rerun de la phase Verify possible) :

- Front-archi : `ReglesTypePanel.jsx`, `BomImport.jsx`, `MachinePnpPageLegacy.jsx`, `BomSessionContext.jsx:314`, `CommandPage.jsx:81`, `ComposantsPanel.jsx:112`, `useEventStream.js:38` (probables : composants > 300 lignes, gestion d'état, hooks).
- Transverse : `eia481_rules.py` / `eia481Footprint.js` (duplication back↔front des règles EIA-481 ?), `auth.py:46`, `marketplace.py` (agrégateur de routes).

## Méthodologie & limites

- **Multi-agent** : 8 lentilles d'audit (correctness/sécurité/perf/archi back, correctness/UX/archi front, transverse) → **vérification adverse** de chaque finding (lecture du fichier cité, real=false par défaut si doute). 58 findings bruts → **33 confirmés** ; les non confirmés/non vérifiés ont été écartés du corps du rapport.
- **Usage** : parcours manuel Chrome sur staging :8001 (à jour de dev).
- **Limite** : quota de session atteint → lentilles front-archi/transverse non vérifiées (cf ci-dessus). Un re-run de la phase Verify (cache des findings) les confirmerait à moindre coût.
- **Périmètre** : code applicatif serveur/src + client front src + conventions. Hors périmètre : infra de déploiement, données prod.

## Backlog proposé (voir `docs/prompts/1-a-faire/`)

Les actions sont regroupées en prompts orchestrateur thématiques plutôt qu'en 33 micro-tâches :

- **013** — Correctness backend (R1–R4 : capacité machine, auto_assign, delete_production).
- **014** — Durcissement sécurité backend (R5–R8 + defusedxml + TLS + CORS + fail-fast API_KEY).
- **015** — Performance : N+1 dashboard + cluster (productions-summary, can_i_produce, list_cards, get_plan_summary, async-blocking).
- **016** — Frontend robustesse & UX (confirmations suppression, erreurs dans dialogs, PageHeader subtitle, loadShared, CostingPage params, responsive Prix carte).
- **017** — Dette/archi backend (get_db canonique, découpe assignment_planning/bom_components/command_service, dédup supplier_offer).
- **018** — Normalisation des révisions de cartes (affichage/stockage `REV_A` vs `A` vs `—`).
