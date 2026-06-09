# ADR 0005 — Modèle de données « Prix carte à la production » (costing)

**Date** : 2026-06-09
**Statut** : ✅ Accepté
**Décideurs** : Eric (décisions métier) · Claude (architecture + implémentation)
**Référence** : `docs/audits/Audit_2026-06-09_prix_carte_production.md`

---

## Contexte

Nouvel onglet « Prix carte » : chiffrer le **coût de revient** d'une carte produite
(matière + main d'œuvre + frais fixes), en HT et TTC, et conserver ce coût comme
**prix de référence** consultable par carte. Maquette validée avec le demandeur :
un **sélecteur de carte** + deux sous-onglets (*Coût de la production* = lot entier ;
*Coût unitaire / carte* = prix de revient unitaire + historique).

L'app couvre déjà la brique matière la plus lourde : `BOM_ITEMS` (quantités) reliés
à `COMPONENTS` puis aux offres `SUPPLIER_OFFERS` (`price_breaks` + `price_at_quantity()`).
Manquent : les **paramètres de coût** (taux horaire, TVA, pâte, défaut, temps), les
**données non-matière par production** (PCB nu, stencil, temps d'assemblage), et un
**stockage du résultat** servant d'historique de prix.

Décisions de cadrage figées (cf. audit §6) : **coût de revient seul** (pas de marge),
**taux horaire unique chargé** (≈ 40 €/h), temps d'assemblage **hybride** (auto +
surcharge manuelle), **prix agrégé TOP + BOT**, pas de conversion devise en v1.

---

## Décision

### 1. Granularité du chiffrage = (production × carte)

La « carte » est une `BOM_REFERENCES`. Une production (`PRODUCTIONS`) référence des
révisions BOM (`PRODUCTION_BOM_REVISIONS`, TOP/BOT) avec leur `quantity_to_produce`.
Un chiffrage porte sur le couple **(production_id, bom_reference_id)** et **agrège
les faces TOP + BOT** de cette carte. Le coût matière = somme sur les `BOM_ITEMS`
des deux faces (hors lignes `dnp`).

### 2. Table `COST_PARAMETERS` — paramètres atelier (ligne unique)

Mêmes mécaniques que `ErpDefaults` (`get_or_seed`, une seule ligne, valeurs par
défaut semées) :

`labor_rate` (€/h, défaut 40), `vat_pct` (défaut 20), `solder_paste_per_board`
(défaut 2), `defect_rate_pct` (défaut 10), `repair_time_h` (défaut 3),
`test_time_h` (défaut 1), `prep_time_bom_h`, `prep_time_top_h`, `prep_time_bot_h`
(NRE temps, amortis), `updated_at`.

*Champs réservés (non exposés v1, schéma extensible)* : `machine_rate`,
`overhead_rate`, `margin_pct`.

### 3. Table `PRODUCTION_COST_INPUT` — données chiffrage par production (1:1)

Données non-matière propres à une production, éditables, surchargeant les défauts :

`production_id` (FK, unique), `quantity_produced` (distinct de
`quantity_to_produce` → lève l'incohérence 15/20 de l'Excel), `pcb_total_price`,
`stencil_cost`, `amortize_stencil` (bool, défaut `true` → **corrige le bug Excel**
du stencil non amorti), `assembly_time_top_h`, `assembly_time_bot_h`, `tht_time_h`,
`updated_at`. Les temps sont **pré-estimés auto** mais surchargeables (décision hybride).

### 4. Table `PRODUCTION_COSTING` — snapshot + historique de prix par carte

Une ligne figée par chiffrage validé ; sert d'**historique** (la plus récente par
carte = prix de référence) :

`id`, `bom_reference_id` (FK, indexé), `production_id` (FK), `quantity`,
`unit_cost_ht`, `unit_cost_ttc`, `total_ht`, `total_ttc`, `material_cost`,
`labor_cost`, `nre_cost`, `is_reference` (bool), `computed_at`,
`params_snapshot` (JSON figeant taux + inputs utilisés → reproductibilité).

*Champs réservés* : `machine_cost`, `overhead_cost`, `margin_amount`, `sell_price`.

### 5. Calcul = service pur `costing_service.py`

`compute_costing(db, production_id, bom_reference_id) -> CostingResult` :
matière via réutilisation de `component_library_service.match_bom_item` +
`supplier_offer_service` / `price_at_quantity(breaks, quantity_produced)` ; MO via
`temps_total × labor_rate` (prépa amortie, rework = `defect × repair`) ; HT/TTC.
Fonction **pure et testable**, sans effet de bord ; la persistance du snapshot est un
appel séparé (`snapshot_costing`).

### 6. API — domaine `/api/costing/*`

Nouveau router `routes/costing.py` (assemblé comme `marketplace`), enregistré dans
`app.py` (`include_router(costing.router, prefix="/api", tags=["Costing"])`) :

- `GET /costing/parameters` · `PUT /costing/parameters`
- `GET /costing/productions/{production_id}` (calcul live, toutes cartes du lot)
- `GET/PUT /costing/productions/{production_id}/inputs`
- `POST /costing/productions/{production_id}/snapshot` (valide → écrit l'historique)
- `GET /costing/cards/{bom_reference_id}/history` (référence + historique des prix)
- `GET /costing/cards` (liste des cartes chiffrables, pour le sélecteur)

### 7. Frontend

Page `CostingPage.jsx` + `components/costing/` : sélecteur de carte, sous-onglets
*Coût de la production* / *Coût unitaire / carte*, panneaux paramètres/données,
décomposition, table historique. Branché sur `api/client.js`.

### 8. Migration

Migration Alembic `n8c9d0e1f2g3_add_costing_tables` chaînée sur le head actuel
`m7b8c9d0e1f2`. En dev SQLite, tables auto-créées par `ensure_sqlite_schema()`.

---

## Conséquences

- ✅ Réutilise la brique matière existante (`SUPPLIER_OFFERS`) → prix au palier,
  fini les composants oubliés / prix en texte de l'Excel.
- ✅ Historique de prix par carte natif (`PRODUCTION_COSTING`), traçable et reproductible
  (`params_snapshot`).
- ✅ Corrige les défauts Excel dès la conception : stencil amorti, quantité produite
  explicite, TVA sur total HT.
- ✅ Schéma extensible (champs réservés) → marge / coût machine / overhead ajoutables
  sans refonte.
- ⚠️ 3 nouvelles tables + migration Alembic ; à appliquer en prod SQL Server.
- ⚠️ Coût matière dépend de la complétude des `SUPPLIER_OFFERS` ; composants sans offre
  → signalés (coût partiel) plutôt que silencieusement à 0.

---

## Alternatives écartées

- **Inputs costing en JSON sur `Production.erp_context`** : non typé, non requêtable ;
  table dédiée `PRODUCTION_COST_INPUT` retenue.
- **Recalcul à la volée sans snapshot** : pas d'historique ni de prix de référence
  stable ; snapshot retenu.
- **Coût matière saisi à la main (comme l'Excel)** : régression vs l'existant ;
  dérivation depuis `SUPPLIER_OFFERS` retenue.
- **Marge / taux machine / overhead dès la v1** : hors cadrage ; réservés pour extension.

---

## Références
- Audit : `docs/audits/Audit_2026-06-09_prix_carte_production.md`
- Modèles à créer : `serveur/src/models/costing.py`
- Service : `serveur/src/services/costing_service.py`
- Routes : `serveur/src/routes/costing.py`
- Réutilise : `services/component_library_service.py`, `services/supplier_offer_service.py`,
  `services/suppliers/base.py` (`price_at_quantity`)
- ADR lié : `0004-supplier-api-connectors.md`
