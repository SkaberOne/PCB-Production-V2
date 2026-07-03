# ADR 0011 — Clôture de production, consommation OUT & anticipation des manques (Phase 2)

**Date** : 2026-07-02
**Statut** : ✅ Accepté
**Décideurs** : Eric (décisions métier actées) · Claude (architecture)
**Contexte** : suite de l'[ADR 0010](0010-inventaire-stock-composants.md) (inventaire physique, Phase 1). Feature derrière le flag `libraryStock`.

---

## Contexte

Phase 2 de l'inventaire : consommer automatiquement le stock à la **clôture d'une
production** (sorties OUT), **réserver** le stock planifié par les productions en
cours, et fournir un écran **« Puis-je produire ? »** qui compare le besoin d'une
production au stock réellement disponible (stock − réservé) et suggère les quantités
à commander.

S'appuie sur la Phase 1 : `StockMovement` (journal signé, motif `production`,
colonne `production_run_id`), `StockService` (mouvements idempotents/réversibles,
`get_or_create_component`).

---

## Décisions

### 1. `ProductionRun` — plusieurs runs (lots) par production

Une production peut être **clôturée en plusieurs lots** (décision actée). Nouvelle
table **`PRODUCTION_RUNS`** : `production_id`, `machine_id` (nullable), `boards_produced`
(nb **réel** de cartes du lot), `note`, `created_at`, `is_cancelled`. Chaque run poste
ses propres OUT, qui **s'additionnent**.

`StockMovement.production_run_id` reste un **entier nullable SANS FK DB** (ajouter une
FK sur une colonne existante forcerait un recreate de table sous SQLite) — le lien vers
`PRODUCTION_RUNS.id` est applicatif. Cohérent avec la discipline « migrations additives »
(ADR 0008 §3).

### 2. Consommation OUT (à la clôture)

Pour un run de `N` cartes réelles :

```
besoin_par_carte(composant) = Σ (sur les révisions liées TOP+BOT) Σ BomItem.quantity
                              des lignes NON-DNP matchées vers ce composant
OUT(composant) = ceil( besoin_par_carte × N × (1 + perte_effective%) )
```

- **TOP/BOT** = 2 révisions séparées à **quantité partagée** : chaque révision contribue
  ses composants **une fois par carte** → on **ne double pas** `N` (chaque face ajoute
  ses propres lignes). `board_count` d'une production = `max(quantity_to_produce)` de ses
  révisions liées.
- **DNP exclus** (réutilise le filtre `dnp == False`/NULL de l'agrégation existante).
  Pas de champ NC distinct (le booléen `dnp` le couvre).
- **Coefficient de perte** : `perte_effective` = `ComponentStock.loss_pct` sinon
  `StockSettings.global_loss_pct`. Appliqué à l'OUT **et** à la prévision.
- **Pas de panélisation** dans le code : `N` = cartes individuelles ; les chutes de
  panneau sont absorbées par le coefficient de perte.
- **Composant non matché** en biblio → `get_or_create_component` (cohérent avec la
  réception Phase 1) : le stock peut passer **négatif** (autorisé) et déclenche l'alerte
  « manque ».

### 3. Idempotence & réversibilité (réutilise l'ADR 0010 §4)

- Un OUT par `(run, composant)` : `source_type='production'`,
  `source_id = "{run_id}:{component_id}"`, `production_run_id = run_id`. L'index unique
  filtré `(source_type, source_id) WHERE is_reversed = 0` garantit **un seul OUT actif**
  par (run, composant) ⇒ re-cliquer « Produire » ne double pas.
- **Ré-éditer** `boards_produced` d'un run ⇒ reconcile-to-target (supersede + nouvel OUT),
  comme la réception Phase 1.
- **Annuler un run** (`is_cancelled = True`) ⇒ tous ses OUT sont contre-passés (mouvements
  inverses), jamais supprimés. Le solde est recalculable.

### 4. Réservation entre productions

Le stock **planifié mais non encore consommé** par les autres productions est vu comme
**réservé** (décision actée : productions **non clôturées et non archivées**) :

```
besoin_planifié_P(c)   = besoin_par_carte_P(c) × board_count_P × (1 + perte%)
consommé_P(c)          = Σ OUT actifs (motif production) de P pour c
réservé_P(c)           = max(0, besoin_planifié_P(c) − consommé_P(c))      # « OUT prévues non exécutées »
réservé_autres(c)      = Σ_{P ≠ cible, statut ∈ {DRAFT, ACTIVE}} réservé_P(c)
```

### 5. Écran « Puis-je produire ? » (onglet dans la section Stock)

Pour une production **cible** :

```
disponible(c) = solde_stock(c) − réservé_autres(c)
besoin(c)     = besoin_planifié_cible(c)     (ou recalculé avec un nb de cartes saisi)
manque(c)     = max(0, besoin(c) − disponible(c))       → statut « manque » si > 0
à_commander(c)= manque(c)
```

L'écran liste, par composant, besoin / disponible / réservé / manque et **suggère les
quantités à commander** avant de lancer la prod (objectif : ne pas commander en pleine
production). Placé dans la **Revue BOM → onglet « Composants et stock »** (là où l'on fixe
le nombre de cartes), derrière le flag `libraryStock`. Il **remplace** l'ancien tableau
d'estimation front (bobine/sachet/tube) qui affichait un « disponible » trompeur — un seul
tableau, alimenté par l'inventaire réel. La section « Stock » reste l'**inventaire seul**.

### 6. Clôture & UI

Endpoint **`POST /marketplace/machines/{id}/productions/{pid}/produce`**
`{ boards_produced, note? }` → crée un `ProductionRun` + poste les OUT. Endpoints annexes :
`GET .../productions/{pid}/runs`, `POST .../runs/{run_id}/cancel`,
`GET /marketplace/stock/can-produce/{production_id}`.

La **clôture de lot** (nb réel de cartes → OUT) + la liste/annulation des lots restent
disponibles via le panneau autonome (mode menu déroulant) — réservé à un usage
« chef d'atelier » / Machine PnP. Dans la Revue BOM, seule l'**anticipation** est
affichée (pas de clôture au milieu de la revue). L'endpoint reste namespacé sous
`/machines/...`.

---

## Conséquences

- ✅ Traçabilité complète de la consommation (journal OUT auditable, réversible).
- ✅ Anticipation des manques sur données partagées, réservation prudente (pessimiste).
- ✅ Réutilise entièrement les invariants Phase 1 (idempotence/réversibilité/perte).
- ✅ Migration additive (une table) ; pas de FK ajoutée sur colonne existante (SQLite OK).
- ⚠️ Le `board_count` planifié = `max(quantity_to_produce)` : suppose que les révisions
  liées sont les faces/parties d'un même jeu de cartes (pas de multi-PCB hétérogène dans
  une même production). Documenté ; à revoir si un cas multi-PCB apparaît.
- ⚠️ `get_or_create` à la consommation peut créer des composants biblio (comme la
  réception) → référentiel à surveiller.

---

## Alternatives écartées

- **1 seul run par production** : trop rigide pour la production par lots (rejeté au
  profit de N runs additifs).
- **FK DB `production_run_id → PRODUCTION_RUNS`** : imposerait un recreate de table sous
  SQLite (batch_alter) ; lien applicatif suffisant.
- **Réserver seulement les ordres de fab validés** : moins prudent ; l'atelier préfère
  réserver toute prod non clôturée.
- **Décompte OUT sans coefficient de perte** : sous-estime la conso réelle (feeders +
  repicks) ; rejeté.

---

## Phasage

- **Phase 2 (cette PR)** : `ProductionRun` + migration ; service besoins/OUT/réservation ;
  endpoints produce / runs / cancel / can-produce ; clôture dans Machine PnP ; onglet
  « Puis-je produire ? » ; tests.
- **Phase 3** (plus tard) : stock engagé sur feeders (stock libre vs chargé) — requiert un
  modèle loaded/mounted absent aujourd'hui.

---

## Références
- ADR lié : `0010-inventaire-stock-composants.md`
- Modèles : `serveur/src/models/production.py` (Production, ProductionBomRevision, **ProductionRun**), `models/stock.py`
- Service/route : `serveur/src/services/production_stock_service.py`, `routes/marketplace_stock.py`, `routes/marketplace_machines.py`
- Front : `pages/StockPage.jsx` (onglet « Puis-je produire ? »), Machine PnP (clôture)
