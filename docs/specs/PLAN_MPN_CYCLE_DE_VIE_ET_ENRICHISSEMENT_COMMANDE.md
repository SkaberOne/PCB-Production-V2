# Plan — Cycle de vie composants (EOL) + Enrichissement MPN dans les Commandes

> **Statut** : 📋 Planifié (2026-07-07) — non démarré. Deux features indépendantes, à livrer en phases validées sur staging (`:8001`) avant prod, selon le processus établi pour la v1.0.11 (branche courte → tests → build staging → validation navigateur → PR `dev` → CI verte → merge → promotion prod).
>
> Cartographie de l'existant réalisée le 2026-07-07 (voir références `fichier:ligne` ci-dessous).

---

## Vue d'ensemble

Deux ajouts demandés :

- **Feature A — Statut de cycle de vie (EOL)** : récupérer auprès des API fournisseurs le statut de cycle de vie d'un composant (Actif / NRND / EOL-Obsolète), le stocker en base, et l'afficher en Revue BOM et dans les Commandes.
- **Feature B — Section MPN dans l'onglet Commande** : réutiliser le panneau d'enrichissement MPN existant (onglet Base de données), mais filtré sur les seuls composants de la commande courante.

Les deux s'appuient sur la même brique existante : le connecteur fournisseurs normalisé (`OfferDTO`, ADR 0004) avec Mouser / Digi-Key / Farnell / RS + OAuth. Elles peuvent être menées en parallèle ou en série ; **Feature B est la plus rapide** et sert de mise en jambe, **Feature A est la plus structurante**.

---

## Feature A — Statut de cycle de vie (EOL) des composants

### Objectif
Alerter, dès la Revue BOM et au moment de la commande, sur les composants en fin de vie, pour anticiper les remplacements et les derniers achats.

### Décisions actées (2026-07-07)
- **Agrégation pire-cas** : si au moins un fournisseur signale une fin de vie, le composant est flagué (gravité EOL > NRND > ACTIVE).
- **Statuts alertés** : Obsolète/EOL (rouge), NRND (orange), Actif (pastille verte discrète). Les statuts inconnus → gris, pas d'alerte.
- **Récupération** : captée en même temps que les offres/MPN (à l'enrichissement), + un bouton « Rafraîchir le cycle de vie » et une date « vérifié le … ».
- Le statut donné par les API est le **statut courant**, pas une prévision du nombre d'années avant EOL (le forecast ne vient que du fabricant).

### Normalisation des statuts
Chaque fournisseur nomme les statuts différemment → un enum interne commun :

| Enum interne | Sources fournisseurs (exemples) | Affichage |
|---|---|---|
| `ACTIVE` | « Active », « In Production », « New Product » | pastille verte discrète |
| `NRND` | « Not Recommended for New Designs », « Last Time Buy » | orange |
| `EOL` | « End of Life », « Obsolete », « Discontinued » | rouge |
| `UNKNOWN` | vide / non fourni | gris, aucune alerte |

### Modèle de données
- Sur `Component` (dans `serveur/src/models/bom.py`) : deux colonnes additives
  - `lifecycle_status` (String/enum, défaut `UNKNOWN`)
  - `lifecycle_checked_at` (DateTime, nullable)
- Migration Alembic **additive et idempotente** (même patron que `PRODUCTIONS.version` / `COMPONENTS.version`).
- Détail par fournisseur conservé dans `SUPPLIER_OFFERS` : on ajoute `lifecycle_status` à l'`OfferDTO` (`serveur/src/services/suppliers/base.py:17`).

### Récupération & agrégation
- Chaque adaptateur parse le champ cycle de vie de sa réponse API et renseigne `OfferDTO.lifecycle_status`.
- Le service agrège les offres d'un composant en **pire-cas** → écrit `Component.lifecycle_status` + `lifecycle_checked_at = now()` (dans `supplier_offer_service.py`, à côté de la logique d'enrichissement existante).

### Affichage
- **Revue BOM** (`client/src/frontend/src/pages/BomViewerPage.jsx`) : pastille couleur dans la colonne composant, tooltip (statut + date de vérification).
- **Commandes** (`CommandPage.jsx` → `ProcurementTable`, ~ligne 805) : même pastille par ligne.
- **Panneau enrichissement** (`MpnEnrichmentPanel.jsx`) : bouton « Rafraîchir le cycle de vie » + date.

### Découpage en phases
- **A1 — Backend socle** : enum + 2 colonnes `Component` (+ migration), `lifecycle_status` dans `OfferDTO`, agrégation pire-cas + `lifecycle_checked_at`, exposition dans les schémas. Tests unitaires.
- **A2 — Adaptateurs** : parsing du champ dans Mouser (`LifecycleStatus`), Digi-Key (statut produit v4), Farnell/Element14, RS. Tests par adaptateur (mocks de payloads).
- **A3 — Frontend** : pastille + tooltip en Revue BOM et Commandes, bouton refresh + date dans l'enrichissement.
- **A4 — Intégration** : tests complets, build staging, validation navigateur, PR `dev`, CI, promotion prod.

### Points d'attention / risques
- **Quota API** : la récupération se fait à l'enrichissement (déjà limité à 25 composants par passe) + refresh manuel → pas de sur-consommation. Pas de job automatique (décision actée).
- **Couverture hétérogène** : tous les composants n'ont pas de statut chez tous les fournisseurs → d'où `UNKNOWN` + agrégation pire-cas.
- **ADR** : formaliser les choix (normalisation + pire-cas) dans un ADR 0014 avant A1.

### Fichiers impactés (référence)
- `serveur/src/services/suppliers/base.py:17` (OfferDTO)
- `serveur/src/services/suppliers/{mouser,digikey,farnell,rs}.py` (parsing)
- `serveur/src/models/bom.py` (Component + colonnes)
- `serveur/src/alembic/versions/` (nouvelle migration)
- `serveur/src/services/supplier_offer_service.py` (agrégation)
- `serveur/src/schemas/bom.py` (exposition)
- `client/src/frontend/src/pages/BomViewerPage.jsx`, `pages/CommandPage.jsx`, `components/library/MpnEnrichmentPanel.jsx`

---

## Feature B — Section MPN dans l'onglet Commande

### Objectif
Enrichir les MPN manquants **sans quitter la commande**, en ne voyant que les composants de cette commande.

### Décisions actées (2026-07-07)
- **Écriture dans la bibliothèque globale** (`Component.mpn`), comme l'onglet Base de données — la vue est simplement **filtrée** sur les composants de la commande. Le MPN vaut ensuite partout.
- **Composants hors bibliothèque ignorés pour l'instant** : la section n'agit que sur les lignes déjà rattachées à un `Component` (avec `Component.id`) ; les lignes non rattachées sont listées en grisé (non actionnables).

### État existant (cartographie)
- Panneau d'enrichissement : `MpnEnrichmentPanel.jsx` (props endpoints ligne 27-29 ; `load()` appelle `GET /marketplace/supplier-offers/mpn-proposals` ; `applyOne` / `applyAllHigh` via `POST /mpn-apply[-batch]`).
- Source des candidats : `supplier_offer_service.build_mpn_proposals()` (`supplier_offer_service.py:426-503`) charge **tous** les `Component` sans MPN (filtre Python, ligne 454), limité à `DEFAULT_ENRICH_LIMIT=25`.
- Relation Commande ↔ composants : `COMMAND_ITEMS` (commande → BOM revisions) ; `command_service.get_command_summary()` (`command_service.py:670-867`) agrège les `BomItem` par clé `value__footprint__component_type` et **rattache** chaque ligne à un `Component` de la bibliothèque (`Component.id` optionnel).
- Page commande : `CommandPage.jsx` (Stack `spacing={4}`, ligne 685) ; sections actuelles PageHeader → Alerts → Paramètres → Tableau → ErpContextForm. **Insertion** d'une nouvelle `Card` entre le tableau (815) et `ErpContextForm` (818), ou après (823).

### Approche
Réutiliser **le même** `MpnEnrichmentPanel` et **les mêmes** endpoints, en ajoutant un **filtre de périmètre** « composants de cette commande ».

### Backend
- Ajouter un paramètre optionnel `command_id` (ou `production_id`) à `GET /mpn-proposals` (`marketplace_supplier_offers.py:177`) et à `build_mpn_proposals()`.
- Quand `command_id` est fourni : restreindre la liste des candidats aux `Component.id` référencés par les lignes de la commande (dérivés via `get_command_summary()` → lignes rattachées à un `Component`), puis appliquer le même filtre « MPN vide ».
- Les endpoints d'écriture (`mpn-apply`, `mpn-apply-batch`) restent **inchangés** (ils écrivent déjà `Component.mpn` global — conforme à la décision).

### Frontend
- Rendre `MpnEnrichmentPanel` paramétrable par un **scope** optionnel (`commandId` / liste d'ids) transmis à `PROPOSALS_URL` ; sans scope → comportement actuel (toute la base).
- Insérer une `Card` « Enrichissement MPN (composants de la commande) » dans `CommandPage.jsx` (~ligne 815), rendant le panneau avec `commandId` de la commande courante.

### Découpage en phases
- **B1 — Backend** : paramètre `command_id` sur `mpn-proposals` + filtrage par composants de la commande. Tests (commande avec/sans composants sans MPN).
- **B2 — Frontend** : prop `scope`/`commandId` sur `MpnEnrichmentPanel` + intégration de la section dans `CommandPage`. Lignes hors biblio grisées.
- **B3 — Intégration** : tests complets, build staging, validation navigateur, PR `dev`, CI, promotion prod.

### Points d'attention
- **Réutilisation stricte** du composant existant (pas de duplication) → un seul point de maintenance.
- Bien afficher un **état vide clair** (« Tous les composants de cette commande ont un MPN ✅ »).
- La limite `DEFAULT_ENRICH_LIMIT=25` reste OK : une commande a rarement > 25 composants sans MPN ; à réévaluer si besoin.

### Fichiers impactés (référence)
- `serveur/src/services/supplier_offer_service.py:426` (`build_mpn_proposals`)
- `serveur/src/routes/marketplace_supplier_offers.py:177` (`GET /mpn-proposals`)
- `serveur/src/services/command_service.py:670` (dérivation des `Component.id` de la commande)
- `client/src/frontend/src/components/library/MpnEnrichmentPanel.jsx` (prop scope)
- `client/src/frontend/src/pages/CommandPage.jsx:~815` (nouvelle section)

---

## Séquencement & dépendances

- **Feature B est indépendante** de Feature A et plus courte → bon candidat pour démarrer.
- **Feature A** touche les mêmes fichiers d'affichage (BomViewerPage, CommandPage) que B pour l'affichage des pastilles → si on fait B d'abord, A viendra enrichir ces vues sans conflit majeur.
- Les deux réutilisent le connecteur fournisseurs → aucune nouvelle intégration d'API à créer (Mouser/Digi-Key/Farnell/RS déjà en place).

Ordre recommandé : **B (rapide, autonome) → A (ADR 0014 puis A1→A4)**. Ou en parallèle sur deux branches courtes si on veut avancer sur les deux fronts.

## Estimation indicative (tailles relatives)
- Feature B : **S/M** (réutilisation forte ; 1 paramètre backend + 1 prop frontend + 1 section).
- Feature A : **M/L** (touche 4 adaptateurs + modèle + migration + 3 écrans ; nécessite l'ADR 0014).

## Processus de livraison (rappel)
Chaque phase : branche courte depuis `dev` à jour → code → `pytest` + suite `npm test` **complète** en local → build `build-web-staging` → restart `:8001` → validation navigateur → commit → PR `dev` → **CI verte** → merge → suppression branche → promotion prod (migration additive + rebuild `build-web` + restart `:8000`) → si besoin, nouvelle release `.exe` (`npm run dist`).
