# ADR 0004 — Connecteurs API fournisseurs + cache d'offres

**Date** : 2026-06-03
**Statut** : ✅ Accepté
**Décideurs** : Eric (décisions métier) · Claude (architecture + implémentation)
**Référence** : `docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md`

---

## Contexte

La section *Commande* doit afficher **prix et disponibilité** des composants chez
plusieurs fournisseurs (Mouser, DigiKey, puis Farnell, RS), permettre un **tri**
(moins cher / fournisseur priorisé) et alimenter l'**export ERP** avec le lien de
commande et le MPN. Chaque fournisseur a une API différente (Mouser : clé en query
string ; DigiKey : OAuth2 2-legged ; Farnell/RS : à venir).

Contraintes : quotas API (Mouser ≈ 30 req/min, 1000 req/jour), latence, robustesse
si une API tombe. Le modèle `COMPONENTS` ne stocke aujourd'hui ni prix, ni stock,
ni nom/lien fournisseur, et ne peut pas représenter plusieurs offres concurrentes.

---

## Décision

### 1. Interface connecteur commune

Un contrat unique `SupplierConnector` (ABC) dans
`serveur/src/services/suppliers/base.py`, renvoyant une liste d'`OfferDTO`
**normalisés**. Chaque fournisseur est un adaptateur (`mouser.py`, `digikey.py`,
plus tard `farnell.py`, `rs.py`). Le reste du système ne connaît que `OfferDTO`.
→ Ajouter un fournisseur = écrire un adaptateur, sans toucher au service ni à l'UI.

`OfferDTO` : `supplier, supplier_part, mpn, manufacturer, product_url,
datasheet_url, currency, unit_price, stock_qty, lead_time_days, price_breaks[]`.

### 2. Cache d'offres en base (table `SUPPLIER_OFFERS`)

Les offres sont mises en cache (une ligne par couple composant × fournisseur).
**Lecture par défaut = cache** (instantané, résistant aux coupures/quotas).
**TTL 24 h** (`SUPPLIER_OFFER_TTL_HOURS`) : au-delà, l'offre est « périmée » mais
reste affichée. Un **refresh explicite** (bouton « Actualiser ») force le temps réel.

### 3. Authentification

- **Mouser** : clé API en query string (`?apiKey=`), via `MOUSER_API_KEY` (`.env`).
- **DigiKey** : OAuth2 client credentials (2-legged). `suppliers/oauth.py` gère le
  token (cache mémoire + refresh à expiration). Connecteur **inactif tant que
  `DIGIKEY_CLIENT_ID`/`DIGIKEY_CLIENT_SECRET` sont absents** (dégradation propre).
- Devise forcée **EUR** (compte Mouser EUR confirmé ; headers locale DigiKey FR/EUR).

### 4. Tri / sélection d'offre

Dans `supplier_offer_service.py` :
- `cheapest` : prix unitaire le plus bas **au palier** correspondant au besoin,
  parmi les offres **en stock suffisant** ; ruptures reléguées.
- `priority` : fournisseur prioritaire choisi s'il est dispo, sinon repli moins cher.

### 5. Garde-fous rate-limit

Lecture cache par défaut ; refresh ciblé/groupé (batch MPN) ; throttle ~30 req/min ;
si quota atteint → renvoyer le cache avec date de fraîcheur plutôt qu'une erreur.

---

## Conséquences

- ✅ Multi-fournisseurs extensible (Farnell/RS = un fichier chacun).
- ✅ UI rapide et robuste (cache), temps réel à la demande.
- ✅ Export ERP enrichi (lien, fournisseur, MPN) sans refonte de la mécanique
  d'export (`supplier_name`/`supplier_link` déjà attendus par `command_service.py`).
- ⚠️ Nouvelle table `SUPPLIER_OFFERS` + migration Alembic (`g1b2c3d4e5f6`).
  En dev SQLite, auto-créée par `ensure_sqlite_schema()`.
- ⚠️ Dépendance HTTP : `httpx` ajouté à `requirements_flexible.txt`.
- ⚠️ Secrets en `.env` uniquement (jamais commités). Clé Mouser partagée en clair
  → **à régénérer**.

---

## Alternatives écartées

- **Temps réel pur à chaque affichage** : trop fragile (quotas/latence), écarté au
  profit du cache + refresh.
- **Champs prix/stock directement sur `COMPONENTS`** : ne représente pas plusieurs
  offres concurrentes ; table dédiée retenue.

---

## Références
- Audit : `docs/audits/Audit_2026-06-03_integration_api_fournisseurs.md`
- Modèle : `serveur/src/models/commands.py` (nouvelle classe `SupplierOffer`)
- Service : `serveur/src/services/supplier_offer_service.py`
- Connecteurs : `serveur/src/services/suppliers/`
