# ADR 0010 — Inventaire physique interne des composants (4e notion de stock)

**Date** : 2026-07-01
**Statut** : ✅ Accepté
**Décideurs** : Eric (décisions métier actées) · Claude (architecture)
**Référence** : décisions actées 2026-07-01 (feature « Bibliothèque / Stock ») ; mémoire `pcb-flow-stock-feature-design`

---

## Contexte

L'atelier a besoin d'un **inventaire physique interne** des composants pour
**anticiper les manques AVANT de lancer une production** (éviter de commander en
pleine prod). Il est alimenté **automatiquement** (réceptions de commande, saisies
BOM, clôtures de production en Phase 2) et interrogé via un écran « Puis-je
produire ? » (Phase 2).

### ⚠️ Trois notions de « stock » existent DÉJÀ — cet inventaire est une 4e, distincte

| # | Notion | Où | Nature |
|---|---|---|---|
| 1 | Brouillon front `stockDraftByComponentKey` | `client/.../utils/bomPlanning.js:75` | Estimation UI éphémère (bobine/sachet/tube) pendant la revue BOM |
| 2 | `SupplierOffer.stock_qty` | `models/bom.py` (SUPPLIER_OFFERS) | Stock **fournisseur** (API Mouser/DigiKey), pas le nôtre |
| 3 | `CommandReceipt.qty_received` | `models/commands.py:126` | Quantité **reçue** par ligne de commande (suivi réception) |
| **4** | **`ComponentStock` (NOUVEAU)** | `models/stock.py` | **Inventaire physique interne détenu en atelier** |

La notion 3 (`CommandReceipt`) est **la source** qui déclenche les entrées
automatiques de la notion 4 ; elles ne se confondent pas.

---

## Décision

### 1. Ancrage sur `Component.id` (bibliothèque existante)

Le stock est rattaché à un **`Component`** existant (`models/bom.py:99`,
`reference = LIB-{SHA1}`, `get_or_create` via `component_library_service`). Le pont
BOM→biblio réutilise le matching existant (`bom_support.py:268` : `mpn > value >
description + footprint`). Les `BomItem` non matchés (`component_library_id = null`)
n'ont pas de stock et sont **signalés visuellement** (statut « non-matché »).

Pas de nouvelle notion d'identité composant : on greffe le stock sur l'existant.

### 2. Modèle de données (2 tables + 1 table de réglage)

**`ComponentStock`** — 1 ligne par composant, **cache** dérivable du journal :
- `component_id` (FK `COMPONENTS.id`, **unique**)
- `qty_pieces` (solde total **cache**, recalculable depuis le journal)
- `qty_reel` / `qty_bag` / `qty_tube` (détail du **dernier recomptage déclaré** —
  nombre de PIÈCES sous chaque forme ; aligné sur `BomStockDialog.jsx`)
- `safety_stock` (seuil « bas » par composant, défaut 0)
- `loss_pct` (surcharge composant du coefficient de perte ; `null` ⇒ valeur globale)
- `updated_at`

**`StockMovement`** — **journal append-only signé** (source de vérité du solde) :
- `component_id` (FK)
- `sens` (`IN` / `OUT`) ; `qty` (magnitude ≥ 0) ; effet signé = `+qty` (IN) / `−qty` (OUT)
- `motif` (`declaration` / `reception` / `production` / `correction`)
- `conditionnement` (`reel` / `bag` / `tube` / `null`)
- `source_type`, `source_id` (identifiant de l'événement d'origine)
- `production_run_id` (**nullable, réservé Phase 2** — pas de FK tant que la table
  `ProductionRun` n'existe pas)
- `date` (défaut `utcnow()` de `database.py`), `note` (libre, optionnelle)
- `reversed` (booléen) et `reverses_id` (self-FK) — voir §4

**PAS de champ `user`** : appli mono-utilisateur, aucune auth (`auth.py` = clé API
optionnelle, pas de modèle `User`).

**`StockSettings`** — table mono-ligne (motif ErpDefaults) : `global_loss_pct`
(défaut **0.0 = neutre** ; l'utilisateur saisira sa propre valeur).

> **Solde** : `qty_pieces = Σ signed(qty)` sur **toutes** les lignes du journal
> (le flag `reversed` n'exclut PAS du solde — voir §4). `qty_reel/bag/tube` = snapshot
> du dernier `declaration`. Une fonction `recompute_solde()` reconstruit le cache.

### 3. Sémantique des mouvements

- **Réception commande** (`CommandReceipt`, `qty_received`) → **IN auto** `motif=reception`.
  `CommandReceipt` est agrégé par `line_key` (« value__footprint__type ») **sans FK
  composant** : on résout `line_key → Component` via le matching biblio, et **à défaut
  on `get_or_create` un `Component`** (décision actée) pour toujours créditer le stock.
- **Saisie BOM reel/bag/tube** (réutilise `BomStockDialog.jsx` dans l'onglet Stock)
  → **IN `motif=declaration`**, en **recomptage absolu (set-to)** : le total déclaré
  = vérité physique ; on poste le **delta** `déclaré − solde_courant`. Delta nul ⇒
  aucun mouvement (idempotent au re-save). Élimine le **double comptage** réception
  auto vs déclaration du même lot (déclarer 100 après avoir reçu 100 ⇒ delta 0).
- **Correction d'inventaire périodique** (`motif=correction`) : même mécanisme set-to
  (recomptage qui réajuste le solde). Absorbe le **drain SAV/réparations** (non lié à
  la prod) — pas de mouvement dédié SAV.
- **Fin de production** → **OUT auto** `motif=production` (**Phase 2**, non codé ici).

**Coefficient de perte production** (couvre feeders + repicks, **PAS le SAV**) :
global (`StockSettings.global_loss_pct`) surchargeable par composant
(`ComponentStock.loss_pct`). Appliqué au décompte OUT **et** à la prévision en
Phase 2 : `sortie = besoin_théorique × (1 + perte%)`. Stocké dès la Phase 1.

**Stock initial : aucun.** On part de zéro ; le stock se remplit au fil des
déclarations et réceptions. **Pas de backfill** des commandes/prods passées.
**Stock négatif autorisé** + alerte « manque » (ne bloque pas la prod).

### 4. Idempotence en base + réversibilité (append-only)

Deux exigences apparemment contradictoires — contrainte **unique
`(source_type, source_id)`** ET **mouvements réversibles par inverse, jamais de
suppression** — sont conciliées par un **index unique filtré** :

```
UNIQUE (source_type, source_id) WHERE reversed = 0     -- SQLite & SQL Server (index filtré)
```

- Au plus **un mouvement ACTIF** (`reversed = 0`) par événement source ⇒ **idempotence
  matérielle** : ré-éditer / ré-ouvrir / re-sauver ne double jamais.
- **Annuler / modifier** un événement = marquer l'actif `reversed = 1` **+** insérer
  une ligne **inverse** (audit, `reverses_id` → l'original) **+** éventuellement un
  nouvel actif. **Aucune suppression.**
- Le flag `reversed` ne pilote **que** l'unicité active : il **n'exclut pas** du
  `Σ` du solde (la ligne inverse compense l'originale ⇒ solde correct).
- Événements automatiques (réception, production Phase 2) : `source_id` stable
  (`receipt_id`, `run_id`) → « reconcile-to-target » (l'actif vaut toujours la valeur
  courante de la source). Événements manuels (declaration/correction) : `source_id`
  unique par saisie (uuid) — l'idempotence vient du set-to (delta 0 ⇒ no-op).

### 5. Feature flag `libraryStock` (défaut OFF)

Toute la feature est livrée derrière le flag **`libraryStock`** (motif
`machinePnpPlan`, `utils/featureFlags.js`), **désactivé par défaut** (ADR 0008 §5).
Permet de tester sur le PC atelier sans risque pour la release. UI : nouvelle
section **« Bibliothèque »** (masquée si flag OFF), onglets **Composants** (réutilise
le panneau existant) / **Stock**.

---

## Conséquences

- ✅ Anticipation des manques avant prod (objectif métier), sur données communes SQL Server.
- ✅ Journal auditable, idempotent et réversible sans suppression (traçabilité totale).
- ✅ Migration **additive** (ADR 0008 §3) : tables/colonnes nouvelles uniquement ;
  compatible postes en retard.
- ✅ Cache `qty_pieces` reconstructible → robustesse (pas de dérive silencieuse).
- ⚠️ Résolution `line_key → Component` à la réception peut créer des composants via
  `get_or_create` (décision actée) : à surveiller côté propreté du référentiel.
- ⚠️ Index unique **filtré** : vérifié sur SQLite ET SQL Server (syntaxe `WHERE`
  supportée par les deux) ; couvert par un test.
- ⚠️ `qty_reel/bag/tube` = snapshot du dernier recomptage, pas forcément égal à
  `qty_pieces` (qui inclut réceptions/prod) — documenté dans l'UI.

---

## Alternatives écartées

- **Nouvelle entité identité composant** (au lieu d'ancrer sur `Component.id`) :
  redondant avec la bibliothèque, casse le pont BOM→biblio ; rejeté.
- **Stock stocké en colonnes sur `Component`** (sans journal) : perd l'auditabilité,
  l'idempotence et la réversibilité ; rejeté au profit du journal append-only.
- **Unique `(source_type, source_id)` non filtré** : incompatible avec la
  réversibilité append-only (collision au ré-édit) ; remplacé par l'index filtré.
- **Déclaration additive (+qty)** : re-save double le stock, double comptage avec
  réception ; rejeté au profit du **set-to recount**.
- **Mouvement SAV dédié** : complexité inutile ; le drain SAV passe par la
  correction d'inventaire périodique (décision actée).

---

## Phasage

- **Phase 1 (cette PR)** : modèles + migration (SQLite + SQL Server) ; paramètre perte
  (global + surcharge) + `safety_stock`/composant ; section Bibliothèque + onglets
  derrière flag ; onglet Stock (liste + statut + édition via `BomStockDialog` → IN
  declaration) ; IN auto à la réception ; correction d'inventaire ; routes (GET stock,
  POST mouvement, GET journal, annulation réversible) ; tests.
- **Phase 2** : clôture de production (OUT auto, `ProductionRun`, `produce`
  idempotent, DNP/NC exclus, `×(1+perte%)`) ; réservation entre prods ; écran « Puis-je
  produire ? ».
- **Phase 3** : stock engagé sur feeders (stock libre vs chargé) — **requiert** un
  nouveau modèle (aucun état loaded/mounted n'existe aujourd'hui) ; à ne pas inventer avant.

---

## Références
- Modèles : `serveur/src/models/stock.py`, `models/bom.py` (Component/BomItem),
  `models/commands.py` (CommandReceipt)
- Service/route : `serveur/src/services/stock_service.py`,
  `serveur/src/routes/marketplace_stock.py`
- Front : `client/src/frontend/src/utils/featureFlags.js`,
  `pages/BibliothequePage.jsx`, `components/library/StockPanel.jsx`,
  `components/bom/BomStockDialog.jsx`
- ADR liés : `0004-supplier-api-connectors.md`, `0008-base-partagee-sql-server.md`
