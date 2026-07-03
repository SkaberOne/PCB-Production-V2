# ADR 0012 — Stock engagé sur feeders (libre vs chargé sur machine) — Phase 3

**Date** : 2026-07-02
**Statut** : ✅ Accepté
**Décideurs** : Eric (décisions métier actées) · Claude (architecture)
**Contexte** : suite des [ADR 0010](0010-inventaire-stock-composants.md) (inventaire) et
[ADR 0011](0011-cloture-production-reservation-stock.md) (clôture/anticipation). Feature
derrière le flag `libraryStock`.

---

## Contexte

Sur une machine PnP, l'opérateur **clipse des bobines/réglettes** de composants sur les
feeders : ces pièces sont **physiquement engagées** sur la machine. Le reste dort en tiroir
(**libre**). Pour préparer une **nouvelle production sur une autre machine**, il faut savoir
combien de pièces sont **vraiment disponibles** (libres), sans compter celles déjà chargées
ailleurs.

Aujourd'hui aucun état « chargé/mounted » n'existe (`ComponentStock` = stock libre ;
`PlanAssignment`/`PnpSlotPin` = plan d'implantation, sans quantité physiquement chargée).

---

## Décisions (actées avec Eric)

### 1. Modèle **annotation** (pas un transfert)

Charger une bobine **ne consomme rien** : les pièces restent au solde. On **annote**
simplement combien est physiquement sur les machines. Le solde total ne baisse **que** quand
on **produit** (Phase 2, inchangée).

- **engagé(composant)** = Σ des quantités chargées sur toutes les machines.
- **libre(composant)** = `solde − engagé`.

### 2. Granularité **par (machine + composant)**

Une quantité chargée par composant et par machine (ex. « 500 × 10k sur PNP-01 »). Suffisant
pour distinguer libre/engagé, simple à gérer. Pas de suivi par slot (le plan d'implantation
reste dans `PlanAssignment`/`PnpSlotPin`).

Nouvelle table **`COMPONENT_MACHINE_LOADS`** : `machine_id` (FK), `component_id` (FK),
`qty_loaded`, `note`, `updated_at`, **unique (machine_id, component_id)**. C'est une table
d'**état courant** (upsert set-to), pas un journal append-only — l'annotation n'affecte pas
le solde, donc pas besoin d'audit/réversibilité comme les mouvements de stock.

### 3. Déclenchement **manuel**

Boutons **« Charger » / « Décharger »** dans **Machine PnP** : l'opérateur saisit « j'ai
clipsé N pièces de ce composant sur cette machine » (set-to), ou décharge (qty → 0). Pas
d'auto depuis le plan (choix d'Eric : contrôle total). L'engagé n'est **pas** auto-décrémenté
par la production (annotation manuelle ; l'opérateur ajuste au déchargement).

### 4. Impact sur les vues stock

- **Inventaire** (`StockPanel`) : colonnes **Engagé** et **Libre** (= solde − engagé).
- **« Puis-je produire ? »** (`can_i_produce`) : colonne **engagé** ; la disponibilité
  devient `disponible = solde − réservé − engagé` (prudent : ni réservé par une autre prod,
  ni physiquement chargé ailleurs ne comptent comme dispo). L'engagé par défaut 0 ⇒ les
  invariants Phase 2 restent valides.

### 5. Endpoints

- `GET /marketplace/machines/{machine_id}/loads` — composants chargés sur une machine.
- `PUT /marketplace/machines/{machine_id}/loads/{component_id}` `{ qty_loaded, note? }` —
  set-to (0 = déchargé → suppression de la ligne).

---

## Conséquences

- ✅ Distinction libre/engagé sans toucher au journal de stock ni à la Phase 2.
- ✅ Modèle minimal (une table d'état), migration additive.
- ✅ « Puis-je produire ? » reflète la vraie disponibilité (− réservé − engagé).
- ⚠️ L'engagé est une **annotation manuelle** : peut se désynchroniser du réel si l'opérateur
  oublie de décharger. Assumé (choix manuel) ; `libre` peut devenir négatif (comme le stock
  négatif, ADR 0010) → signal d'annotation à corriger.
- ⚠️ Pas de suivi par slot en Phase 3 (par machine+composant). Un raffinement par feeder/slot
  reste possible plus tard sans casser ce modèle.

---

## Alternatives écartées

- **Transfert (2 compartiments libre/chargé)** : la conso prod devrait décompter l'engagé,
  ce qui modifie la logique Phase 2 ; rejeté au profit de l'annotation (plus simple, non
  disruptif).
- **Granularité par slot/feeder** : plus précis mais plus complexe ; repoussé.
- **Auto depuis le plan validé** : écarté (Eric veut le contrôle manuel).
- **Journal append-only pour l'engagé** : inutile (n'affecte pas le solde) ; table d'état
  courant suffit.

---

## Références
- ADR liés : `0010-inventaire-stock-composants.md`, `0011-cloture-production-reservation-stock.md`
- Modèle : `serveur/src/models/stock.py` (**ComponentMachineLoad**), `models/machines.py`, `models/bom.py`
- Service/route : `serveur/src/services/stock_service.py`, `services/production_stock_service.py`,
  `routes/marketplace_machines.py`
- Front : `client/src/frontend/src/components/machine/MachineLoadPanel.jsx`,
  `components/library/StockPanel.jsx`, `components/library/ProduceCheckPanel.jsx`
