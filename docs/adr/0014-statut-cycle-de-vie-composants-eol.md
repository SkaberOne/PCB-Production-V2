# ADR 0014 — Statut de cycle de vie des composants (EOL) : normalisation, agrégation pire-cas, affichage

**Date** : 2026-07-07
**Statut** : 🟡 Accepté — en cours d'implémentation (phases A1→A4)
**Décideurs** : Eric (décisions métier actées) · Claude (architecture)
**Contexte** : les API fournisseurs déjà intégrées (Mouser, Digi-Key, Farnell, RS — voir
[ADR 0004](0004-supplier-api-connectors.md)) exposent le statut de cycle de vie d'un composant.
Objectif : récupérer, stocker et **afficher** ce statut pour alerter, dès la Revue BOM et au moment
de la commande, sur les composants en fin de vie (anticipation des remplacements et derniers achats).
Voir le plan [`docs/specs/PLAN_MPN_CYCLE_DE_VIE_ET_ENRICHISSEMENT_COMMANDE.md`].

---

## Contexte

Chaque distributeur nomme différemment le statut de cycle de vie (Mouser `LifecycleStatus`,
Digi-Key statut produit v4, etc.), avec des valeurs comme *Active*, *Not Recommended for New
Designs*, *Last Time Buy*, *End of Life*, *Obsolete*. Le statut donné est le **statut courant**, pas
une prévision du nombre d'années avant EOL (le forecast ne vient que du fabricant). La couverture est
**hétérogène** : tous les composants n'ont pas de statut chez tous les fournisseurs.

Le connecteur fournisseurs est déjà normalisé (`OfferDTO`, ADR 0004) : le cycle de vie s'y ajoute
comme un champ supplémentaire, sans nouvelle intégration d'API.

---

## Décisions (actées avec Eric)

### 1. Enum interne normalisé (4 valeurs)
On ramène les libellés hétérogènes à un petit ensemble commun :

| Enum interne | Libellés fournisseurs (exemples) | Affichage | Gravité |
|---|---|---|---|
| `ACTIVE` | Active, In Production, New Product | pastille verte discrète | 0 |
| `NRND` | Not Recommended for New Designs, Last Time Buy | orange | 1 |
| `EOL` | End of Life, Obsolete, Discontinued | rouge | 2 |
| `UNKNOWN` | (vide / non fourni) | gris, aucune alerte | -1 |

*Last Time Buy* est rangé avec `NRND` (orange) : ce n'est pas une fin de vie effective mais un
signal d'anticipation. Les statuts non reconnus/vides → `UNKNOWN` (pas d'alerte).

### 2. Agrégation **pire-cas** par composant
Un composant peut être sourcé chez plusieurs fournisseurs avec des statuts différents. On retient le
**statut le plus grave** (`EOL` > `NRND` > `ACTIVE`). Rationale : côté approvisionnement, on préfère
sur-signaler une fin de vie plutôt que la manquer. `UNKNOWN` ne prime jamais sur une valeur connue.

### 3. Stockage
- Sur `Component` (`serveur/src/models/bom.py`) : deux colonnes **additives**
  - `lifecycle_status` (String, défaut `"UNKNOWN"`, non nul) — l'enum agrégé pire-cas.
  - `lifecycle_checked_at` (DateTime, nullable) — date de dernière vérification.
- Migration Alembic **additive et idempotente** (même patron que `PRODUCTIONS.version` /
  `COMPONENTS.version`), compatible SQLite (dev) et SQL Server (prod/staging).
- Le détail par fournisseur reste dans `SUPPLIER_OFFERS` : on ajoute `lifecycle_status` à
  l'`OfferDTO` (`services/suppliers/base.py`), renseigné par chaque adaptateur.

### 4. Récupération
- Le cycle de vie est capté **en même temps que les offres** (au refresh des offres et à
  l'enrichissement MPN) : aucun appel API supplémentaire dédié.
- Un bouton **« Rafraîchir le cycle de vie »** (côté UI) + l'affichage du « vérifié le … ».
- **Pas de job automatique** (décision actée) : on reste maître du quota fournisseur.

### 5. Affichage
- **Revue BOM** (`BomViewerPage`) et **Commandes** (`ProcurementTable`) : une **pastille couleur**
  par composant (vert discret / orange / rouge / gris), avec le statut + la date de vérification au
  survol. Seuls `EOL` (rouge) et `NRND` (orange) constituent une alerte visible ; `ACTIVE` est une
  pastille verte discrète ; `UNKNOWN` n'affiche pas d'alerte.

---

## Conséquences

**Positives** : anticipation des fins de vie dès la revue et la commande ; réutilise l'infra
fournisseurs existante ; changement de schéma purement additif (aucun risque sur les données) ;
maîtrise du quota (pas de job auto).

**Limites / risques** : le statut est celui du distributeur/agrégateur, pas un forecast fabricant ;
couverture partielle selon la pièce (d'où `UNKNOWN` + pire-cas) ; dépend de la fraîcheur du cache
(d'où la date « vérifié le … » et le bouton de rafraîchissement).

**Non-objectifs** : prévision du nombre d'années avant EOL ; job de rafraîchissement automatique ;
blocage d'une commande contenant un composant EOL (on **alerte**, on ne bloque pas).

---

## Découpage (phases)

- **A1 — Backend socle** : enum + 2 colonnes `Component` (+ migration), `lifecycle_status` dans
  `OfferDTO`, agrégation pire-cas + `lifecycle_checked_at`, exposition dans les schémas. Tests.
- **A2 — Adaptateurs** : parsing du champ cycle de vie dans Mouser (`LifecycleStatus`), Digi-Key
  (statut produit v4), Farnell/Element14, RS. Tests par adaptateur (mocks de payloads).
- **A3 — Frontend** : pastille + tooltip en Revue BOM et Commandes, bouton « Rafraîchir le cycle de
  vie » + date dans l'enrichissement.
- **A4 — Intégration** : tests complets, build staging (`:8001`), validation navigateur, PR `dev`,
  CI verte, promotion prod (migration additive).

Chaque phase est livrée sur branche courte, testée en staging avant promotion (processus établi ADR 0013).
