# Audit — État des lieux avant nouvelles fonctionnalités (réception, scan, dashboard)

- **Date** : 2026-07-15
- **Contexte** : app déployée en atelier (web LAN :8000, plusieurs postes, plusieurs productions en parallèle). Avant d'implémenter 3 nouvelles fonctionnalités (réception avec création de composant, scan code-barres fournisseurs, refonte dashboard Production), état des lieux complet.
- **Branche auditée** : `dev` (HEAD `8dd93b9`)
- **Portée** : audit statique complet (backend, frontend, DB, docs, git). Aucune modification de code.

---

## 1. Résumé exécutif

La base est **globalement saine** : dette structurelle historique purgée (imports `src.backend` : 0, `datetime.utcnow()` en prod : 0, TODO/FIXME : 0), 10 migrations Alembic linéaires (head unique `d4e5f6a7b8c9`), 404 fonctions de test backend, architecture routes→services→models respectée.

Les défauts restants sont concentrés sur **3 axes** :

| Axe | Gravité | Impact sur les 3 features |
|---|---|---|
| Pages frontend surdimensionnées (7 pages >300 lignes, dont `DashboardPage` 1085 L) | 🔴 Haute | **Bloque** la refonte dashboard : refactorer avant d'enrichir |
| Réception actuelle limitée (composants existants uniquement, pas de fournisseur, pas de traçabilité opérateur) | 🟠 Moyenne | Socle direct des features 1 et 2 |
| Documentation périmée (Projet.md du 29/05, CHANGELOG sans les 2 dernières sessions) | 🟡 Basse | Risque de dérive doc/code |

**Verdict** : pas de blocage architectural pour les 3 features. Prérequis : découpe `DashboardPage` et `StockPanel` avant enrichissement, + décision sur l'identité de poste (audit 2026-07-07 §3.4) car la réception scannée sans traçabilité opérateur est une occasion manquée.

---

## 2. État des lieux

### 2.1 Backend (serveur/src/)

| Indicateur | Valeur |
|---|---|
| Modèles SQLAlchemy | 30 classes / **24 tables** (7 fichiers) |
| Fichiers routes | 24 (domaines : bom, marketplace, stock, commands, reports, costing) |
| Services | 34 fichiers (28 services + 6 connecteurs fournisseurs) |
| Tests | 40 fichiers / **404 fonctions test** |
| Migrations Alembic | 10, tête unique `d4e5f6a7b8c9` (lifecycle ADR 0014) |
| Imports `src.backend.` | **0** ✅ |
| `datetime.utcnow()` en code prod | **0** ✅ (1 en test, 1 en docstring) |
| TODO/FIXME/XXX | **0** ✅ |

Points forts :
- **Stock** (ADR 0010→0013) : `stock_service.py` (607 L) = source de vérité journal append-only, idempotence, réservation multi-productions (`production_stock_service.py`), stock engagé feeders (ADR 0012), vérification physique + concurrence optimiste pilote (ADR 0013).
- **Fournisseurs** : 4 connecteurs API OAuth2 (`services/suppliers/` : Mouser, DigiKey, Farnell, RS) + `SupplierOffer` (prix/dispo/délai par composant×fournisseur) + `supplier_credentials.py`. **Pas d'entité `Supplier` dédiée en base** — fournisseur = chaîne dans `SupplierOffer.supplier`.
- **Réception existante** : deux chemins — auto-IN via `StockService.post_reception()` (édition `CommandReceipt.qty_received`) et manual-receive via `POST /api/marketplace/stock/movements`. Composant **doit déjà exister**.
- **Multi-postes** (ADR 0013 phases 1-3 en prod) : présence in-memory, événements SSE (`marketplace_events.py`), concurrence optimiste sur `Component` et `Production` (champs `version`).

### 2.2 Frontend (client/src/frontend/src/)

| Indicateur | Valeur |
|---|---|
| Pages | 13 |
| Composants | 62 .jsx / 9 domaines |
| Tests | 15 fichiers .test.jsx |
| Code barcode/scan existant | **Aucun** |
| TODO/FIXME | 0 |

Pages hors règle « >300 lignes = à découper » :

| Page | Lignes | Note |
|---|---|---|
| `MachinePnpPageLegacy.jsx` | 1191 | Legacy conservé, bug boucle infinie connu, audit dédié en attente |
| `DashboardPage.jsx` | **1085** | 🔴 Cible directe de la feature 3 |
| `CommandPage.jsx` | 904 | Déjà réduit de 1137→855 en mai, a regonflé |
| `BomViewerPage.jsx` | 790 | Idem (650→790) |
| `ImportBomPage.jsx` | ~550 | |
| `BomFilesPage.jsx` | 469 | |
| `CostingPage.jsx` | 320 | Limite |

`components/library/StockPanel.jsx` (625 L) contient **les 2 onglets** Inventaire + Réception dans un seul fichier — même problème en devenir.

### 2.3 Onglet Stock → Réception (état actuel, commit `907aee0`)

- Autocomplete composant (valeur/MPN, stock affiché) + champ « Quantité reçue » + bouton « Ajouter au stock ».
- Liste « Réceptions récentes » (état local, perdu au refresh).
- **Limites** : composant existant obligatoire ; pas de notion de fournisseur ; pas de scan ; pas d'opérateur/poste tracé ; réceptions récentes non persistées côté UI.

### 2.4 Dashboard Production (état actuel)

`DashboardPage.jsx` (1085 L) : cartes KPI via `StatCard` (seul composant du domaine `dashboard/`), recherche + liste des productions avec statut/session/actions, dialogs création/renommage. Données : `GET /api/reports/overview` + productions. **Pas de vue synthétique par production en cours** (avancement, stock manquant, machine assignée, qui travaille dessus) — exactement le manque exprimé.

### 2.5 Git & CI

- Modèle `main` + `dev` respecté ; merges récents propres (PR #42, #44, #45, feat/stock-reception).
- 🟡 Branches locales mergées non supprimées : `feat/extensions-multipostes`, `feat/inventaire-stock-composants`, `fix/production-delete-cascade` (règle §10.3 : supprimer après merge).
- ℹ️ `git status` depuis le sandbox affiche 184 fichiers modifiés (37159+/37159−) : **bruit CRLF du mount Linux**, pas de vraies modifications (diff = réécriture ligne à ligne identique).

### 2.6 Documentation

- 🟡 `docs/Projet.md` : « Mis à jour 2026-05-29, v1.0.0, 19 tables » — réalité : v1.0.9+, **24 tables**, pages Stock/Costing absentes du doc.
- 🟡 `docs/CHANGELOG.md` : dernière entrée 2026-07-03 (session 10). Les sessions suivantes (onglet Réception `907aee0`, ménage scripts `3537e38`, EOL PR #42) n'y figurent pas.
- ✅ ADR à jour (0010→0014), audits réguliers.

### 2.7 Risques résiduels multi-postes (rappel audit 2026-07-07)

Toujours ouverts : pas de traçabilité par poste/opérateur (§3.4), lectures périmées sans refresh (§3.1), concurrence optimiste limitée au pilote Component/Production (§3.2). **La feature réception/scan est le bon moment pour trancher l'Option 1 (identité de poste)** : chaque mouvement de stock scanné devrait porter « qui/quel poste ».

---

## 3. Défauts classés

### 🔴 À traiter avant les features
1. **`DashboardPage.jsx` 1085 L** — refondre le visuel sans découper d'abord = aggraver. Extraire : table productions, cartes KPI, dialogs → `components/dashboard/`.
2. **`StockPanel.jsx` 625 L, 2 onglets dans 1 fichier** — extraire `ReceptionTab.jsx` + `InventoryTab.jsx` avant d'y ajouter scan + création composant.

### 🟠 À traiter pendant/juste après
3. **Pas d'entité fournisseur réutilisable** pour la réception : `SupplierOffer.supplier` (chaîne) suffit peut-être, mais la feature scan impose de formaliser la liste des fournisseurs actifs (3 selon Eric ; 4 connecteurs en code — clarifier lequel est inutilisé).
4. **Traçabilité opérateur absente** sur `StockMovement` — décision Option 1 (identité de poste) à prendre via ADR.
5. **Réceptions récentes non persistées** (état local UI) — le journal `/stock/journal` existe déjà côté backend, le brancher.

### 🟡 Hygiène (non bloquant)
6. `CommandPage.jsx` (904 L) et `BomViewerPage.jsx` (790 L) ont regonflé depuis le refactor de mai.
7. `MachinePnpPageLegacy.jsx` (1191 L) : à archiver ou auditer (bug boucle infinie documenté).
8. Branches locales mergées à supprimer (PowerShell Windows, pas depuis le sandbox).
9. `Projet.md` et `CHANGELOG.md` à rafraîchir.
10. Taux de réussite pytest à re-mesurer sur PC dev (`.venv\Scripts\pytest serveur\src\tests\ -v`) — dernière mesure connue : 133/192 (mai), suite passée à 404 tests depuis ; limitation isolation SQLite toujours documentée (ADR 0002).

---

## 4. Ce qui est déjà en place pour les 3 features (constats)

### Feature 1 — Réception avec création de composant
- ✅ Endpoint mouvement IN existe (`POST /stock/movements`), idempotent.
- ✅ `component_library_service.py` : normalisation/matching composants (utilisé par l'import BOM) — réutilisable pour « composant inconnu → créer ».
- ❌ Pas d'endpoint « créer composant seul » côté réception ; création composant passe aujourd'hui par l'import BOM / catalogue Paramètres.
- ⚠️ Champs minimaux à définir pour un composant créé à la réception : MPN, valeur, empreinte ?, type (règles `COMPONENT_TYPE_RULES` peuvent auto-typer), statut lifecycle (ADR 0014).

### Feature 2 — Scan code-barres/QR (3 fournisseurs)
- ✅ Connecteurs API Mouser/DigiKey/Farnell(/RS) déjà en place → après décodage du code, **enrichissement auto** (MPN → description, prix, empreinte) possible.
- ❌ Aucun code scan côté UI. À savoir sur le contenu des codes (à valider en phase spec avec de vraies étiquettes) :
  - **DigiKey** : Data Matrix 2D au standard **ECIA / ANSI MH10.8.2** — contient MPN (`1P`), réf client (`P`), quantité (`Q`), lot, date code.
  - **Mouser** : étiquettes avec Data Matrix ECIA similaire + codes 1D par champ.
  - **Farnell** : étiquettes 1D/2D, contenu moins normalisé selon les lignes de produits.
  - Un **parseur ECIA** couvre probablement DigiKey + Mouser ; Farnell à vérifier sur étiquettes réelles. La sélection préalable du fournisseur (idée d'Eric) est un bon fallback, mais l'en-tête ECIA permet souvent l'auto-détection.
- ⚠️ Matériel : douchette USB (mode clavier = simple champ texte à focus) vs caméra (lib type `html5-qrcode`/`zxing-js`). La douchette est le chemin le plus court en atelier.

### Feature 3 — Dashboard production enrichi
- ✅ Données déjà exposées : `GET /reports/overview`, `/reports/bom-stats?production_id`, `/stock/can-produce/{prod_id}` (manques par production), présence par poste (`marketplace_presence.py`), runs (`ProductionRun`), statuts commande (DRAFT→RECEIVED).
- ❌ Pas d'endpoint agrégé « résumé par production » (aujourd'hui il faudrait N appels par carte) → prévoir un `GET /reports/productions-summary` côté backend.
- 🔴 Prérequis : découpe `DashboardPage` (défaut #1).

---

## 5. Recommandations priorisées

1. **P0 — Assainissement ciblé** (petit chantier, 1 branche `refactor/`) : découpe `DashboardPage` + `StockPanel` en composants ; suppression branches mergées ; re-mesure pytest sur PC dev.
2. **P0 — ADR identité de poste** (Option 1 audit 2026-07-07) : header `X-Workstation`, colonne `created_by` sur `StockMovement`. Petit, débloque la traçabilité des réceptions scannées.
3. **P1 — Feature 1** (réception + création composant) : endpoint `POST /stock/receptions` acceptant composant existant **ou** payload de création minimale (réutiliser `component_library_service`), UI dans `ReceptionTab` extrait.
4. **P1 — Feature 2** (scan) : phase spec courte avec **étiquettes réelles des 3 fournisseurs** (photos/scans bruts) → parseur ECIA + fallback sélection fournisseur → champ scan douchette dans `ReceptionTab` → enrichissement via connecteurs existants. S'appuie sur la feature 1 (composant inconnu scanné = création).
5. **P1 — Feature 3** (dashboard) : endpoint agrégé `productions-summary` + cartes par production (avancement, manques stock via can-produce, machine, commande, présence postes).
6. **P2 — Hygiène** : `CommandPage`/`BomViewerPage` re-découpe, sort de `MachinePnpPageLegacy`, mise à jour `Projet.md`/`CHANGELOG.md`.

---

## Annexe — Fichiers de référence

| Sujet | Fichier |
|---|---|
| Réception UI actuelle | `client/src/frontend/src/components/library/StockPanel.jsx` (onglet `reception`, ~L295-560) |
| Mouvements stock (manual-receive) | `serveur/src/routes/marketplace_stock.py` · `serveur/src/services/stock_service.py` |
| Réception auto sur commande | `serveur/src/services/production_command_service.py` (`set_receipt` → `post_reception`) |
| Connecteurs fournisseurs | `serveur/src/services/suppliers/{mouser,digikey,farnell,rs}.py` |
| Offres fournisseurs | `serveur/src/models/commands.py` (`SupplierOffer`) · `routes/marketplace_supplier_offers.py` |
| Dashboard actuel | `client/src/frontend/src/pages/DashboardPage.jsx` (1085 L) · `components/dashboard/StatCard.jsx` |
| Reports backend | `serveur/src/routes/reports.py` · `services/report_service.py` |
| Multi-postes / présence | `serveur/src/routes/marketplace_presence.py` · audit `Audit_2026-07-07_multi-postes_multi-productions.md` |
