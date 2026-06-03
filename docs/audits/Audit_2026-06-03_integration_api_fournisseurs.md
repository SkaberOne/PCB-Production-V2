# Audit — Intégration des API fournisseurs (Mouser, DigiKey, Farnell, RS)

> **Date** : 2026-06-03
> **Auteur** : audit technique (Claude)
> **Domaine** : Section *Commande* / *Demande d'Achat* — enrichissement prix & disponibilité, tri multi-fournisseurs temps réel, export ERP, remplissage base composants.
> **Statut** : Proposition d'architecture + plan d'implémentation. À valider avant développement.

---

## 1. Objectifs métier

L'utilisateur veut, dans la section Commande :

1. **Disponibilité** des composants en temps quasi réel chez les fournisseurs.
2. **Prix** affichés par fournisseur.
3. **Tri intelligent** : fournisseur le moins cher, ou priorisation d'un fournisseur donné, croisé avec la disponibilité.
4. **Lien de commande** récupéré et injecté dans l'export ERP.
5. **MPN** récupéré automatiquement pour enrichir la base `COMPONENTS` et faciliter la recherche.
6. **Nouveaux champs ERP** (formulaire « Nouvelle Demande d'Achat »), avec **préremplissage par défaut** de champs normalement fixes mais modifiables.

Fournisseurs cibles : **Farnell, RS, Mouser, DigiKey**.
Disponibles aujourd'hui : **Mouser** (clé API fournie) et **DigiKey** (à provisionner via compte développeur). Farnell et RS : architecture prévue, branchement ultérieur (clés/docs à venir).

---

## 2. État de l'existant (ce qui est déjà en place)

### 2.1 Modèle de données

`serveur/src/models/bom.py` → table **`COMPONENTS`** (`class Component`). Champs pertinents déjà présents :

| Champ | Usage actuel |
|---|---|
| `reference` | clé unique interne |
| `value` | **clé de matching BOM** (cf. mémoire projet, pas `reference`/`mpn`) |
| `mpn` | Manufacturer Part Number (souvent vide aujourd'hui) |
| `supplier_code` | code/réf fournisseur (texte libre) |
| `package`, `tape_width_mm`, `pitch_mm`, `qty_per_reel`… | métadonnées bobine/datasheet |

**Manquant** : aucun champ ni table pour **prix**, **disponibilité (stock)**, **nom du fournisseur**, **lien produit/commande**, **devise**, **date de rafraîchissement**. Plusieurs offres concurrentes (un même composant chez Mouser ET DigiKey) ne sont pas représentables dans le schéma actuel.

### 2.2 Service & export ERP

`serveur/src/services/command_service.py` :

- `ERP_HEADERS` = `Fournisseur, nom du composant, ref fournisseur, Lien, Quantite a commander, projet, Statut, Delai, remarque, Validateur` (10 colonnes).
- `_build_erp_export_rows()` **lit déjà** `supplier_name`, `supplier_code`, `supplier_link`, `component_mpn` sur chaque ligne — **mais ces champs sortent vides** : dans `get_command_summary()` (lignes ~697-700), `supplier_name=None` et `supplier_link=None` sont codés en dur, seuls `mpn`/`supplier_code` viennent de la bibliothèque.
- `export_command_erp_workbook()` génère le `.xlsx` via openpyxl.

> **Bonne nouvelle** : la « plomberie » d'export attend déjà nom fournisseur + lien. Il suffit de **remplir** ces champs depuis les offres fournisseurs au lieu de `None`.

### 2.3 Routes

`serveur/src/routes/marketplace_command_core.py` expose : `POST /generate`, `GET /{id}/summary`, `POST /{id}/erp-export`, CRUD items… (préfixe marketplace). Pas de route fournisseur/prix.

### 2.4 Frontend

- `client/src/frontend/src/pages/CommandPage.jsx` — **966 lignes** (déjà au-dessus de la limite projet de 300 lignes → à découper, cf. §8).
- `client/src/frontend/src/components/command/ErpContextForm.jsx` — 6 champs de contexte ERP (`projet, statut, delai, remarque, validateur, fournisseurParDefaut`).
- `client/src/frontend/src/components/command/CommandLineRow.jsx`, `StockStatusChip.jsx`.
- `client/src/frontend/src/utils/commandPlanning.js` — agrégation des lignes de commande.

Colonnes triables actuelles (`SORTABLE_COLUMNS`) : Composant, Valeur, Empreinte, Besoin, Stock, Commande, Pose, Source. **Aucune colonne prix/dispo fournisseur.**

---

## 3. Écarts à combler

| # | Écart | Impact |
|---|---|---|
| E1 | Pas de stockage des offres fournisseurs (prix/dispo/lien) | Bloquant cache & tri |
| E2 | Pas de couche d'accès API fournisseurs | Bloquant tout |
| E3 | Pas de gestion OAuth2 (DigiKey) | Bloquant DigiKey |
| E4 | Pas de stratégie cache + rate-limit | Risque quota / lenteur |
| E5 | Export ERP : `supplier_name`/`link` non remplis | Lien commande absent |
| E6 | MPN non rapatrié automatiquement | Base pauvre, recherche difficile |
| E7 | Frontend : pas de tri/affichage prix-dispo, pas de bouton « Actualiser » | Pas d'UX |
| E8 | Nouveaux champs ERP + préremplissage par défaut | À spécifier (image à venir) |

---

## 4. Architecture cible

### 4.1 Vue d'ensemble

```
                 ┌─────────────────────────────────────────┐
  Frontend       │ CommandPage → SupplierOffersPanel        │
  (React/MUI)    │  - colonnes Prix / Dispo / Fournisseur    │
                 │  - menu tri (moins cher / priorisé)       │
                 │  - bouton « Actualiser » (temps réel)     │
                 └───────────────┬──────────────────────────┘
                                 │ REST
                 ┌───────────────▼──────────────────────────┐
  Backend        │ routes/marketplace_supplier_offers.py     │
  (FastAPI)      │  GET  /offers?component_ids=...           │  ← lit le cache
                 │  POST /offers/refresh                      │  ← force temps réel
                 └───────────────┬──────────────────────────┘
                                 │
                 ┌───────────────▼──────────────────────────┐
                 │ services/supplier_offer_service.py        │
                 │  - cache (lecture/écriture SUPPLIER_OFFERS)│
                 │  - politique de fraîcheur (TTL)            │
                 │  - agrégation/tri (moins cher, priorité)   │
                 └───────────────┬──────────────────────────┘
                                 │  interface commune
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                         ▼
 MouserConnector         DigiKeyConnector          (Farnell / RS — plus tard)
 services/suppliers/     services/suppliers/
   mouser.py               digikey.py (+ oauth.py)
```

**Principe clé** : une **interface `SupplierConnector` commune** (search_by_mpn, search_by_keyword → renvoie une liste normalisée d'`OfferDTO`). Chaque fournisseur implémente son adaptateur. Le reste du système ne connaît que le format normalisé → ajouter Farnell/RS = écrire un adaptateur, rien d'autre à toucher.

> Décision d'archi à formaliser en ADR : `docs/adr/` via le skill `engineering:architecture` (voir §10).

### 4.2 Modèle de données — nouvelle table `SUPPLIER_OFFERS`

Une offre = (composant interne) × (fournisseur) × (réf fournisseur), avec prix/dispo mis en cache.

```python
# serveur/src/models/commands.py  (ou nouveau models/suppliers.py)
class SupplierOffer(Base):
    __tablename__ = "SUPPLIER_OFFERS"
    id = Column(Integer, primary_key=True, index=True)
    component_id   = Column(Integer, ForeignKey("COMPONENTS.id"), index=True, nullable=False)
    supplier       = Column(String(20), index=True, nullable=False)   # "MOUSER" | "DIGIKEY" | "FARNELL" | "RS"
    supplier_part  = Column(String(120), nullable=True)               # réf fournisseur (ex: 81-GRM…)
    mpn            = Column(String(200), nullable=True)
    manufacturer   = Column(String(120), nullable=True)
    product_url    = Column(Text, nullable=True)                      # lien commande/produit → export ERP
    datasheet_url  = Column(Text, nullable=True)
    currency       = Column(String(8),  nullable=True)                # "EUR"
    unit_price     = Column(Float, nullable=True)                     # prix au palier le + proche du besoin
    stock_qty      = Column(Integer, nullable=True)                   # dispo
    lead_time_days = Column(Integer, nullable=True)
    price_breaks   = Column(Text, nullable=True)                      # JSON [{qty, price}] pour calcul fin
    fetched_at     = Column(DateTime, default=utcnow, index=True)     # fraîcheur cache
    raw_payload    = Column(Text, nullable=True)                      # réponse brute (debug/audit)
```

Notes :
- **Helper timestamp** : `from ..database import utcnow` (jamais `datetime.utcnow()` — règle projet §7.7 du CLAUDE.md).
- **Migration Alembic** dans `serveur/src/alembic/` (tête unique). ⚠ Gotcha mémoire : la `dev.db` SQLite est parfois hors Alembic → prévoir l'`ALTER`/recréation manuelle en dev.
- Index `(component_id, supplier)` pour le tri rapide.
- `price_breaks` en JSON permet de recalculer le prix réel selon `quantity_to_order` (les API renvoient des paliers).

### 4.3 Couche connecteurs

Arborescence proposée (respecte STRUCTURE.md : services Python → `serveur/src/services/`) :

```
serveur/src/services/suppliers/
  __init__.py
  base.py        # SupplierConnector (ABC) + OfferDTO (dataclass normalisée)
  mouser.py      # MouserConnector
  digikey.py     # DigiKeyConnector
  oauth.py       # gestion token OAuth2 DigiKey (cache + refresh)
serveur/src/services/supplier_offer_service.py   # orchestration + cache + tri
```

**OfferDTO normalisé** (sortie commune de tous les connecteurs) :
`supplier, supplier_part, mpn, manufacturer, product_url, datasheet_url, currency, unit_price, stock_qty, lead_time_days, price_breaks[]`.

#### Mouser (`mouser.py`)
- Base URL : `https://api.mouser.com/api/v1/`
- Auth : **clé en query string** `?apiKey=<clé>` (simple, pas d'OAuth).
- Endpoints utiles :
  - `POST /search/partnumber` — recherche par MPN (cas principal : on a déjà le MPN).
  - `POST /search/keyword` — recherche par mot-clé (fallback si pas de MPN).
- Réponse : `SearchResults.Parts[]` → `ManufacturerPartNumber`, `Manufacturer`, `Availability`/`AvailabilityInStock`, `PriceBreaks[]` (`Quantity`, `Price`, `Currency`), `DataSheetUrl`, `ProductDetailUrl`.
- **Devise** : configurer le compte Mouser en EUR (site FR) pour des prix € directs.
- **Rate limit** (valeurs communauté, à confirmer dans le portail) : ~**30 appels/min** et ~**1000 appels/jour** sur la Search API → d'où la nécessité du cache + batching.

#### DigiKey (`digikey.py` + `oauth.py`)
- **OAuth2 2-legged / client credentials** (pas de clé simple) :
  - Token : `POST https://api.digikey.com/v1/oauth2/token` avec `grant_type=client_credentials`, `client_id`, `client_secret` (form-urlencoded).
  - Access token valable ~**30 min** → `oauth.py` met le token en cache mémoire et le renouvelle à expiration.
  - **Sandbox** disponible : `https://sandbox-api.digikey.com` pour tester sans consommer le quota prod.
- Product Information **v4** :
  - `POST /products/v4/search/keyword` — recherche.
  - `GET  /products/v4/search/{productNumber}/productdetails` — détail par réf.
- **Headers requis** sur chaque appel : `Authorization: Bearer <token>`, `X-DIGIKEY-Client-Id: <client_id>`, et la localisation : `X-DIGIKEY-Locale-Site: FR`, `X-DIGIKEY-Locale-Currency: EUR`, `X-DIGIKEY-Locale-Language: fr`.
- Réponse v4 : prix par paliers (`StandardPricing`/`ProductVariations`), `QuantityAvailable`, `ProductUrl`, `DatasheetUrl`, `ManufacturerProductNumber`.

> **Procédure d'obtention des identifiants DigiKey** (à faire par Eric, gratuit) :
> 1. Créer un compte sur `https://developer.digikey.com/`.
> 2. Créer une **Organization**, puis une **Production App** (cocher l'API *Product Information V4*).
> 3. Récupérer **Client ID** + **Client Secret** générés.
> 4. (Optionnel) tester d'abord en **Sandbox App**.
> Ces deux valeurs vont dans `serveur/.env` (cf. §4.5). Aucune action de redirection nécessaire pour le flux 2-legged (pas de login utilisateur).

### 4.4 Endpoints backend à ajouter

Nouveau routeur `serveur/src/routes/marketplace_supplier_offers.py` (enregistré dans le package marketplace) :

| Méthode | Route | Rôle |
|---|---|---|
| `GET`  | `/api/.../offers?component_ids=1,2,3` | Renvoie les offres **en cache** (rapide, défaut) |
| `POST` | `/api/.../offers/refresh` | Body `{component_ids:[…]}` → appelle les API, met à jour le cache, renvoie le frais |
| `GET`  | `/api/.../offers/best?command_id=…&strategy=cheapest|priority&priority=MOUSER` | Renvoie l'offre retenue par ligne selon la stratégie de tri |

Schémas Pydantic v2 → `serveur/src/schemas/` (shims v1 cf. `src/config.py`).

### 4.5 Configuration & sécurité des clés

`serveur/.env` (+ documenter dans `serveur/.env.example`, **sans valeurs réelles**) :

```ini
# Mouser
MOUSER_API_KEY=b8ca18a5-...           # NE PAS committer la vraie clé
MOUSER_BASE_URL=https://api.mouser.com/api/v1
# DigiKey
DIGIKEY_CLIENT_ID=
DIGIKEY_CLIENT_SECRET=
DIGIKEY_BASE_URL=https://api.digikey.com
DIGIKEY_OAUTH_URL=https://api.digikey.com/v1/oauth2/token
DIGIKEY_LOCALE_SITE=FR
DIGIKEY_LOCALE_CURRENCY=EUR
# Cache
SUPPLIER_OFFER_TTL_HOURS=24
```

⚠ **Sécurité** :
- La clé Mouser a été partagée en clair dans la conversation → la traiter comme **potentiellement exposée**. Recommandation : la **régénérer** dans le portail Mouser une fois l'intégration en place, et ne la stocker que dans `serveur/.env` (déjà gitignored).
- `.env.example` ne contient que des placeholders vides.
- Attention à la variable d'env `API_KEY` polluée (`${user_config.api_key}`) connue du projet (CLAUDE.md §7.3) — **ne pas réutiliser ce nom** ; préfixer par fournisseur (`MOUSER_API_KEY`).

### 4.6 Stratégie cache & rate-limit (décision retenue : cache + refresh)

- **Lecture par défaut = cache** (`SUPPLIER_OFFERS`). Affichage instantané, résistant aux coupures API et aux quotas.
- **TTL** configurable (`SUPPLIER_OFFER_TTL_HOURS`, défaut 24 h). Une offre plus vieille que le TTL est marquée « périmée » dans l'UI (chip gris) sans bloquer.
- **Refresh** :
  - Bouton **« Actualiser »** par ligne ou pour la sélection → `POST /offers/refresh`.
  - **Batching** : grouper les MPN en une requête par fournisseur quand l'API le permet, pour économiser le quota.
  - **Throttle** côté service : file d'attente respectant ~30 req/min (Mouser) ; compteur journalier.
  - **Garde-fou** : si quota atteint → renvoyer le cache + message « données du <date> » plutôt qu'une erreur.
- Pas de rafraîchissement automatique massif au chargement (éviterait de cramer 1000 appels/jour sur une grosse BOM).

---

## 5. Fonctionnalité « tri multi-fournisseurs »

Dans `supplier_offer_service.py`, pour chaque composant on a N offres (une par fournisseur). Sélection de l'offre retenue selon `strategy` :

- **`cheapest`** : prix unitaire le plus bas **au palier correspondant à `quantity_to_order`**, parmi les offres **en stock suffisant** (`stock_qty >= besoin`). Les ruptures sont reléguées en bas / signalées.
- **`priority`** : on prend le fournisseur prioritaire choisi (ex. Mouser) **s'il est dispo** ; sinon repli sur le moins cher dispo.
- Critère secondaire commun : disponibilité (en stock d'abord), puis délai (`lead_time_days`).

**Frontend** (`CommandPage` / nouveau `SupplierOffersPanel.jsx`) :
- Menu déroulant MUI : « Tri : Moins cher » / « Tri : Prioriser un fournisseur » (+ sélecteur du fournisseur).
- Nouvelles colonnes : **Fournisseur retenu**, **Prix unit.**, **Total ligne**, **Dispo** (`StockStatusChip` réutilisable/étendu), **Fraîcheur** (date du cache).
- Bouton **Actualiser** (icône refresh) global + par ligne.
- État géré dans le store Zustand existant ; appels via `api/client.js` (axios).

---

## 6. Export ERP & nouveaux champs

### 6.1 Lien de commande (E5)
Aujourd'hui `supplier_name`/`supplier_link` sortent `None`. Après intégration : `get_command_summary()` (command_service.py ~697-700) lit l'**offre retenue** (selon la stratégie) et remplit `supplier_name`, `supplier_link` (= `product_url`), `component_mpn`, `supplier_code` (= `supplier_part`). **Aucune autre modif** de la mécanique d'export : `_build_erp_export_rows()` consomme déjà ces clés.

### 6.2 Mapping des champs ERP (capture validée 2026-06-03)

**Mécanisme** : génération d'un **fichier xlsx/csv** dont les colonnes correspondent aux 12 champs du formulaire « Nouvelle Demande d'Achat », importé dans l'ERP (évolution de l'export xlsx actuel). Une ligne ERP = une ligne de commande (composant à acheter).

**Nouveaux `ERP_HEADERS`** (remplacent les 10 colonnes actuelles dans `command_service.py`) :

| # | Champ ERP | Oblig. | Source | Type | Détail |
|---|---|---|---|---|---|
| 1 | Référence fournisseur | ✓ | `OfferDTO.supplier_part` | auto | réf de l'offre retenue |
| 2 | Fournisseur | ✓ | `OfferDTO.supplier` | auto | mappé sur le libellé attendu par l'ERP |
| 3 | Description | ✓ | `manufacturer` + `mpn` (+ `value`/empreinte) | auto | chaîne composée |
| 4 | Lien web | — | `OfferDTO.product_url` | auto | lien commande/produit |
| 5 | Référence KT | — | **`COMPONENTS.reference`** | auto | **= référence interne du composant** |
| 6 | Quantité | ✓ | `quantity_to_order` | auto | besoin de la ligne |
| 7 | Unité | ✓ | défaut « pièce » | défaut | éditable (écran admin) |
| 8 | Projet | ✓ | **défaut « PJ2601-00241 - Achat projet client 2026 »** | défaut | éditable (champ `projet` de `ErpContextForm`) |
| 9 | Demandeur | ✓ | **défaut fixe « Eric Bouquet »** | défaut | éditable (écran admin) |
| 10 | Validateur | ✓ | **défaut fixe « Kevin Surrier »** | défaut | éditable (écran admin) |
| 11 | Délai | ✓ | **défaut fixe « URGENT »** | défaut | **toujours URGENT** ; reste éditable |
| 12 | Remarques | — | **défaut fixe « mise en bobine »** | défaut | éditable |

**Préremplissage par défaut** (champs « fixes mais modifiables » via l'écran admin, décision §11 #2) — valeurs figées par Eric le 2026-06-03 : **Projet=`PJ2601-00241 - Achat projet client 2026`**, Unité=`pièce`, **Demandeur=`Eric Bouquet`**, **Validateur=`Kevin Surrier`**, **Délai=`URGENT`**, **Remarques=`mise en bobine`**. Considérés stables, mais éditables ligne par ligne dans l'UI.

**Champs auto depuis l'offre retenue** : Référence fournisseur, Fournisseur, Description, Lien web. **Champ auto depuis la base** : Référence KT (`COMPONENTS.reference`).

> ⚠ Impact code : `ERP_HEADERS` et `_build_erp_export_rows()` (`command_service.py`) doivent passer de 10 → 12 colonnes. `ErpContextForm.jsx` : le champ « Délai » (actuellement un *date picker*) devient une **liste/valeur fixe URGENT** ; ajouter Unité, Demandeur. Penser à mettre à jour les tests d'export.

> ⚠ À confirmer plus tard : le **libellé exact** attendu par l'ERP pour chaque fournisseur (ex. « Mouser », « Digi-Key »…) afin que l'import reconnaisse la colonne Fournisseur, et la liste des Validateurs/Demandeurs valides.

## 7. Remplissage de la base via MPN (E6)

- Lors d'un `refresh`, si l'offre renvoie un **MPN** et que `COMPONENTS.mpn` est vide pour ce composant → proposer/écrire la mise à jour (`mpn`, `manufacturer`, éventuellement `datasheet_url`).
- **Garde-fou** : la clé de matching interne reste `value` (mémoire projet — pas `mpn`/`reference`). Le MPN sert à **enrichir** et à requêter les API, pas à ré-identifier les composants.
- Mode **revue** recommandé : marquer les MPN « proposés par API » pour validation humaine avant écriture massive (éviter d'écraser des saisies manuelles). Réutilise l'esprit de l'enrichissement déjà prévu (mémoire `supplier-api-enrichment`, 63 MPN déjà remplis via Chrome).

---

## 8. Dette technique à traiter au passage

- **`CommandPage.jsx` (966 lignes)** dépasse largement la limite de 300 lignes (audit 2026-05-29). L'ajout du panneau fournisseurs **doit** se faire dans des sous-composants dédiés (`components/command/SupplierOffersPanel.jsx`, `SupplierOfferRow.jsx`, `SupplierSortMenu.jsx`) et non en gonflant la page.
- Étendre `StockStatusChip` plutôt que dupliquer la logique de dispo.
- Tests colocalisés `__tests__/` côté front ; `conftest.py` côté back.

---

## 9. Risques (pré-mortem condensé)

| Risque | Type | Mitigation |
|---|---|---|
| Quota Mouser (1000/j) cramé par refresh massif | 🐯 Tiger | Cache par défaut, refresh ciblé, batching, throttle, garde-fou « renvoyer cache » |
| Token DigiKey expiré en plein lot | 🐯 Tiger | `oauth.py` cache + refresh auto à 401/expiration |
| Devises mixtes (USD vs EUR) | 🐘 Elephant | Forcer locale EUR (Mouser compte FR, headers DigiKey) ; stocker `currency` et ne jamais comparer des devises différentes |
| Matching MPN imparfait → mauvaise offre | 🐯 Tiger | Recherche par MPN d'abord, fallback keyword ; revue humaine des écritures MPN |
| Clé Mouser exposée (partagée en clair) | 🐯 Tiger | Régénérer la clé ; `.env` only ; `.env.example` vide |
| Prix « au palier » mal calculé | 🐅 Paper Tiger | Stocker `price_breaks` JSON et recalculer selon quantité réelle |
| Image champs ERP non encore fournie | 🐘 Elephant | Geler le mapping ERP tant que la spec n'est pas reçue (§11) |

---

## 10. Plan d'implémentation par phases

**Phase 0 — Provisioning & ADR (Eric + dev)**
- Eric : créer compte DigiKey, générer Client ID/Secret (§4.3). Confirmer locale/devise Mouser.
- Dev : ADR via `engineering:architecture` (interface `SupplierConnector`, table `SUPPLIER_OFFERS`, politique cache).

**Phase 1 — Socle données & connecteur Mouser**
- Modèle `SupplierOffer` + migration Alembic (+ ALTER dev.db manuel).
- `services/suppliers/base.py` (ABC + OfferDTO), `mouser.py`.
- `supplier_offer_service.py` : cache read/write + refresh Mouser + tri `cheapest`.
- Route `GET /offers` + `POST /offers/refresh`. Tests pytest (mock HTTP).

**Phase 2 — DigiKey (OAuth2)**
- `suppliers/oauth.py` (token cache/refresh, sandbox d'abord) + `digikey.py`.
- Brancher dans le service ; tri multi-fournisseurs `cheapest` + `priority`. Tests.

**Phase 3 — Frontend**
- `SupplierOffersPanel.jsx` + sous-composants, colonnes prix/dispo/fraîcheur, menu tri, bouton Actualiser. Découpage de `CommandPage`. Tests jest.

**Phase 4 — Export ERP & MPN**
- Remplir `supplier_name`/`supplier_link`/`mpn` dans `get_command_summary()`.
- Nouveaux champs ERP + préremplissage par défaut (après réception de l'image — §11).
- Enrichissement MPN base (mode revue).

**Phase 5 — Farnell & RS (ultérieur)**
- Écrire `farnell.py`, `rs.py` quand docs/clés dispo. Aucune autre couche à toucher.

**Phase 6 — Durcissement**
- `engineering:testing-strategy`, `engineering:code-review`, `engineering:deploy-checklist`. Régénérer clé Mouser. Mettre à jour `docs/CHANGELOG.md`.

---

## 11. Questions ouvertes / à caler ensemble

**Décisions prises le 2026-06-03 (formulaire) :**

| # | Sujet | Décision |
|---|---|---|
| 2 | Édition des valeurs de préremplissage par défaut | **Écran admin dans l'app** (page de réglages UI, sans toucher au code) |
| 3 | TTL cache prix/dispo | **24 h** (`SUPPLIER_OFFER_TTL_HOURS=24`) ; bouton Actualiser pour forcer le temps réel |
| 4 | Devise Mouser | **EUR confirmé** → aucune conversion nécessaire |
| 5 | Écriture MPN dans `COMPONENTS` | **Revue manuelle avant écriture** : MPN proposés marqués « à valider », confirmation humaine avant insertion |
| 6 | Référence KT | **= référence interne** → `COMPONENTS.reference` (auto) |
| 7 | Délai ERP | **Toujours « URGENT »** par défaut (éditable) |
| 8 | Mécanisme export ERP | **Fichier xlsx/csv** importé dans l'ERP (12 colonnes) |
| 9 | Défauts ERP fixes | Projet=**PJ2601-00241 - Achat projet client 2026** · Demandeur=**Eric Bouquet** · Validateur=**Kevin Surrier** · Remarques=**mise en bobine** · Unité=**pièce** (stables, éditables) |

**Reste ouvert :**

1. ~~Image des champs ERP cibles~~ — **reçue et mappée le 2026-06-03 (cf. §6.2)**.
2. **Libellés fournisseurs/validateurs côté ERP** : confirmer le libellé exact attendu par l'import pour chaque fournisseur (« Mouser », « Digi-Key »…) et la liste des Validateurs/Demandeurs valides, pour fiabiliser l'import du fichier.

**Impacts sur l'archi :**
- Décision #2 → prévoir une route + table `ERP_DEFAULTS` et un petit écran admin (`pages/SettingsErpDefaultsPage.jsx`) en Phase 4.
- Décision #5 → ajouter un statut `mpn_source` / flag « à valider » sur l'enrichissement, avec écran de revue avant commit en base.


## Sources
- Mouser — Search API : https://www.mouser.com/api-search/ · doc : https://api.mouser.com/api/docs/ui/index
- DigiKey — OAuth 2-legged : https://developer.digikey.com/tutorials-and-resources/oauth-20-2-legged-flow · Product Information v4 : https://developer.digikey.com/products/product-information-v4 · portail : https://developer.digikey.com/
