# ADR 0017 — Gestion de stock des cartes produites & commandes client/machine

**Date :** 2026-07-20
**Statut :** Accepté
**Contexte :** Le logiciel gère le stock de **composants** (ADR 0010) mais rien pour les **cartes finies** produites, ni pour les **commandes de cartes** (client externe ou besoin machine interne). Eric veut une section dédiée.

## Décision

Nouvelle section de menu **« Gestion de stock »** regroupant : l'onglet **Stock** (composants, existant, déplacé), **Stock Cartes** (stock de cartes produites) et **Commande Client/Machine** (demandes de cartes). Une section **« Cartes à produire »** sur le dashboard liste les manques (demandes de fabrication).

Décisions de conception (validées par Eric le 20/07) :
- **Unité de stock cartes = la référence de carte** (`BOM_REFERENCES`, ex. « BISTABLE BOARD »). Les cartes du même type produites par plusieurs productions s'additionnent.
- **Prix par carte = Costing (auto) + override manuel** : le prix de référence vient du sous-système Costing existant (`PRODUCTION_COSTING.is_reference`, `CostingService`), surchargeable à la main. Prix total = prix effectif × quantité.
- **Commande = client externe OU machine/interne** : type `CLIENT | MACHINE` + destinataire libre + lignes (référence de carte + quantité).

## Modèle de données (3 nouvelles tables)

**BOARD_STOCK** — une ligne par référence de carte (unique) :
`bom_reference_id` (FK unique), `qty_in_stock` (Int≥0), `min_stock` (Int≥0), `unit_price_override` (Float nullable — prix manuel), `cards_tested`/`cards_validated`/`cards_to_debug` (Int, état QA du stock, éditables), `notes`, timestamps.

**CLIENT_ORDERS** — une commande :
`reference` (unique, auto `CMD-####`), `order_type` (`CLIENT|MACHINE`), `recipient` (nom client ou libellé machine/besoin), `status` (`OPEN|READY|DELIVERED|CANCELLED`, défaut OPEN), `due_date` (nullable), `notes`, timestamps.

**CLIENT_ORDER_LINES** — lignes d'une commande :
`order_id` (FK), `bom_reference_id` (FK carte demandée), `quantity` (demandée), `quantity_prepared` (préparée « dans la boîte », défaut 0), `notes`.

## Logique

- **Prix effectif** d'une carte = `unit_price_override` sinon `reference_unit_cost_ht` (Costing). Valeur du stock = prix effectif × `qty_in_stock`.
- **Sous le minimum** = `qty_in_stock < min_stock`.
- **Préparer une boîte** (commande) : incrémenter `quantity_prepared` d'une ligne (≤ `quantity`), décrémenter `BOARD_STOCK.qty_in_stock` d'autant (jamais < 0). Statut passe `READY` quand toutes les lignes sont préparées, `DELIVERED` à la livraison (décrément déjà fait à la préparation).
- **Cartes à produire (dashboard)** : pour chaque référence, `Σ quantity (commandes OPEN/READY) − quantity_prepared − qty_in_stock disponible` > 0 ⇒ manque. Bouton « créer une production » (réutilise la création de production existante).

## Endpoints (sous `/api/marketplace`)

- `GET /board-stock` (liste enrichie prix/min/QA/below_min), `PUT /board-stock/{bom_reference_id}` (upsert qty/min/override/QA/notes), `POST /board-stock/{bom_reference_id}/adjust` (delta qty).
- `GET/POST /client-orders`, `GET/PUT/DELETE /client-orders/{id}`, `PUT /client-orders/{id}/lines`, `POST /client-orders/{id}/prepare` (ligne+qty).
- `GET /board-stock/to-produce` (agrégat manques pour le dashboard).

## Conséquences

Additif (aucune donnée existante touchée). Migration `checkfirst` (3 tables), idempotente SQLite + SQL Server. Réutilise `CostingService` (prix) et `BomReference` (cartes). Le suivi test/validé/à débugger existe déjà **par production** (followup) — ici on ajoute un état QA **par stock de carte** distinct et éditable (choix assumé pour la simplicité).
