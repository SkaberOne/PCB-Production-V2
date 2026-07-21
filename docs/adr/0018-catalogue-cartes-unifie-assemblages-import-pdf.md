# ADR 0018 — Catalogue de cartes unifié, assemblages multi-niveaux & import PDF de commande

**Date :** 2026-07-21
**Statut :** Accepté
**Contexte :** Eric veut une « base de données de nos cartes » : notre référence, le nom, le prix (et sa date de calcul), et — si la carte est un assemblage — la liste de ce qui la compose (sous-cartes + composants). Il a déjà un onglet BOM enregistrées ; il ne veut **pas** de doublon. En parallèle, il reçoit des commandes client en **PDF** (émetteur KELENN, cf `CO2601-10180.pdf`) qu'il veut glisser dans le logiciel pour créer automatiquement une commande client.

## Décision

**Fiche carte unifiée sur `BOM_REFERENCES`** (source de vérité unique, pas de table parallèle). On enrichit la référence de carte existante plutôt que de créer un registre concurrent qui divergerait des BOM déjà saisies. Une page **« Cartes »** agrège pour chaque référence : notre référence, le code KELENN, le nom, le type, ses révisions (BOM), son prix Costing + date, et — si assemblage — sa composition.

Décisions de conception (validées par Eric le 21/07) :
- **Assemblage = nomenclature multi-niveaux (kit)** : une carte « assemblage » peut contenir d'autres cartes (sous-cartes, récursif) **et** des composants en vrac.
- **Prix d'un assemblage = somme automatique des enfants** (sous-cartes + composants), recalculée. Une carte simple garde son prix Costing (ADR 0017).
- **Identification par code KELENN** : le code (`KT240576`…) est stocké sur la carte (`part_number`) ; c'est « notre référence » côté client. L'import PDF matche les lignes par ce code.
- **Saisie à l'import de BOM** : à l'import d'une nouvelle BOM, on renseigne le nom + le type (+ composition si assemblage). Les cartes déjà importées se complètent depuis la page Cartes (backfill).

## Modèle de données

**Enrichissement `BOM_REFERENCES`** (additif, colonnes nullable) :
- `name` (String, nom lisible de la carte — distinct du `reference` technique existant),
- `part_number` (String, code KELENN ex. `KT240576`, indexé, sert au matching PDF),
- `card_type` (String `SIMPLE|ASSEMBLY`, défaut `SIMPLE`).

**`ASSEMBLY_ITEMS`** (nouvelle table) — un enfant d'un assemblage :
`parent_reference_id` (FK `BOM_REFERENCES`, l'assemblage), `child_reference_id` (FK `BOM_REFERENCES` nullable, une sous-carte), `component_id` (FK `COMPONENTS` nullable, un composant en vrac), `quantity` (Int≥1), `notes`. Contrainte applicative : exactement un de `child_reference_id` / `component_id`. La récursivité (sous-carte elle-même assemblage) est portée par le graphe parent→enfant.

**`CARD_PART_NUMBER_ALIASES`** (optionnel, mémoire de mapping) — code KELENN vu dans un PDF mais non encore rattaché : `part_number`, `bom_reference_id` (FK, une fois mappé). Alternative retenue : réutiliser directement `BOM_REFERENCES.part_number` (un code = une carte) et ne créer un alias que si un même carton porte plusieurs codes. **V1 : pas de table d'alias, on écrit `part_number` sur la carte au moment du mapping.**

## Logique

- **Prix carte** : `SIMPLE` → prix Costing (ADR 0017, override possible). `ASSEMBLY` → Σ (prix effectif enfant × quantité) sur les sous-cartes + Σ (prix composant × quantité) sur les composants vrac ; recalculé à la lecture. Date de calcul = la plus ancienne date Costing des enfants (pire cas) ou la date de recalcul.
- **Catalogue** : une entrée par `BOM_REFERENCES`, agrège nom/part_number/type/catégorie, révisions connues (distinct `BOM_REVISIONS.revision`), prix + date, et la composition si assemblage.
- **Cycle sur assemblages** : refus applicatif d'ajouter un enfant qui rendrait le graphe cyclique (une carte ne peut pas se contenir, directement ou indirectement).

## Import PDF de commande client

- **Parseur** (`pdfplumber`) validé le 21/07 sur `CO2601-10180.pdf` :
  - **Client** = 1re ligne du bloc « Adressé à » (séparation des 2 colonnes émetteur/adressé via les coordonnées `x0` des mots).
  - **Lignes article** : `^([A-Z]{1,4}\d{4,}[A-Z]?)\s*-\s*(nom)\s+(\d+)%\s+(pu)\s+(qty)\s+u\.\s+(total)$`. Code décomposé par `^([A-Z]+\d+)([A-Z])$` → `part_number` + révision. Les lignes sans code (`Frais de livraison`) sont ignorées.
- **Rattachement** : match par `part_number`. Les cartes qu'on ne produit pas (pas de `part_number` correspondant) sont exclues ; les codes inconnus sont proposés au mapping manuel (une fois), puis `part_number` est écrit sur la carte pour les prochains PDF.
- **Création** : commande client (ADR 0017) pour le client extrait (créé s'il n'existe pas), avec une ligne par carte reconnue (carte + révision + quantité). Aperçu avant création.

## Endpoints (sous `/api/marketplace`)

- `GET /cards` (catalogue enrichi), `PUT /cards/{bom_reference_id}` (nom/part_number/card_type), `PUT /cards/{bom_reference_id}/assembly` (composition enfants).
- `POST /client-orders/import-pdf` (upload PDF → aperçu : client + lignes reconnues + codes inconnus), `POST /client-orders/import-pdf/commit` (création après mapping).

## Conséquences

Additif : aucune donnée existante détruite. `BOM_REFERENCES` gagne 3 colonnes nullable ; `ASSEMBLY_ITEMS` créée avec `checkfirst`. Migration idempotente SQLite (dev/tests) + SQL Server (prod). Réutilise Costing (prix), `BomRevision` (révisions), ADR 0017 (commandes client, stock cartes). Le catalogue Cartes devient l'écran central « nos cartes » ; l'onglet BOM enregistrées reste la source des révisions/composants importés. Développé et validé sur **staging** (`feat/gestion-stock-cartes`) avant toute promotion prod.
