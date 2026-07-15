# ADR 0015 — Identité de poste : traçabilité des écritures (stock d'abord)

**Date** : 2026-07-15
**Statut** : 🟢 Accepté — implémenté le 2026-07-15 (branche `feat/reception-creation-composant`, migration `e5f6a7b8c9d0`)
**Décideurs** : Eric (P0 acté le 2026-07-15) · Claude (architecture)
**Contexte** : Option 1 de l'audit [`Audit_2026-07-07_multi-postes_multi-productions.md`](../audits/Audit_2026-07-07_multi-postes_multi-productions.md) (§3.4, §4). Déploiement web LAN multi-postes avec clé API unique partagée : deux navigateurs sont indistinguables côté serveur. Aucune écriture ne porte « qui / quel poste ».

---

## Problème

- `StockMovement` (journal append-only, ADR 0010) ne porte aucun identifiant d'opérateur ou de poste : impossible de répondre à « qui a déclaré / reçu / corrigé ce stock ? ».
- L'arrivée de la **réception scannée** (douchette + fallback caméra, 4 fournisseurs) multiplie les écritures de stock en atelier — sans traçabilité, un écart d'inventaire n'est pas investigable.
- Pas de besoin d'authentification forte (outil interne, confiance atelier) : il faut de la **traçabilité**, pas du contrôle d'accès.

## Décision

1. **Identité de poste déclarative, côté client.**
   Chaque navigateur mémorise un nom de poste (`localStorage`, clé `pcb-production:workstation`), saisi une fois via un petit prompt/paramètre (même patron que la clé API dans `ApiKeyGate`). Modifiable dans Paramètres.

2. **Header HTTP `X-Workstation`** injecté par `api/client.js` sur toutes les requêtes (comme `X-API-Key`). Absent = `null` (compatibilité totale : anciens clients, scripts, tests).

3. **Colonne `created_by` (String(60), nullable) sur `STOCK_MOVEMENTS`.**
   Renseignée depuis le header par les routes d'écriture stock (`POST /stock/movements`, réceptions auto via `set_receipt`, chargements feeders). Migration Alembic **additive** (nullable, pas de backfill).

4. **Exposition lecture** : `created_by` ajouté aux réponses journal (`/stock/journal`, `/stock/{id}/journal`) et affiché dans l'UI journal/réceptions récentes.

5. **Périmètre initial = stock uniquement.** Extension ultérieure possible (productions, épinglages) via la même mécanique, décidée au cas par cas.

## Alternatives rejetées

- **Comptes utilisateurs + auth** : surdimensionné pour un outil interne atelier ; friction quotidienne ; ne répond pas mieux au besoin (traçabilité, pas sécurité).
- **Identité dérivée de l'IP/hostname côté serveur** : fragile (DHCP, proxys, navigateurs multiples par PC), invisible pour l'opérateur, non modifiable.
- **Réutiliser la présence in-memory (ADR 0013)** comme source d'identité : la présence est volatile (session SSE) ; le journal exige une valeur figée au moment de l'écriture.

## Conséquences

- ✅ Chaque mouvement de stock devient attribuable (« poste-atelier-1 a reçu 500 × RC-10K à 14:32 »).
- ✅ Zéro rupture : header et colonne optionnels, anciens clients fonctionnent.
- ✅ Socle pour les options 2/3 de l'audit 2026-07-07 (signalement d'activité, verrou souple) si besoin futur.
- ⚠️ Déclaratif = falsifiable/oubliable : un poste mal nommé trace mal. Accepté (confiance atelier).
- ⚠️ Une migration Alembic de plus (additive, sans risque) — à promouvoir en prod avec la release de la feature réception.

## Implémentation (avec la feature Réception, pas avant)

| Étape | Fichier(s) |
|---|---|
| Colonne + migration | `serveur/src/models/stock.py` · `serveur/src/alembic/versions/` |
| Lecture header | route/dépendance FastAPI (`Header(None, alias="X-Workstation")`) → `stock_service` |
| Injection client | `client/src/frontend/src/api/client.js` |
| Saisie/édition nom de poste | Paramètres (`SettingsPage`) + première utilisation |
| Affichage | journal stock + « Réceptions récentes » |
