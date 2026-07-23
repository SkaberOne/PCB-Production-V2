# [023] fix(cartes): refus de suppression 409 — nommer les commandes bloquantes + ignorer les liens orphelins

| Champ | Valeur |
|---|---|
| **ID** | 023 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/suppr-carte-detail-liens` |
| **Priorité** | normale · **Dépend de** 020 (mergé) · **Parallèle** : oui (isolé sur delete_reference + son affichage) |
| **Source** | Usage Eric (carte AMPLI_GEN6_TOP « liée à une commande » impossible à identifier) · **Créé le** 2026-07-23 |

## 1. Objectif (le POURQUOI)
Le garde-fou de suppression d'une carte (020) refuse (409) avec un message **vague** : « Carte X non supprimable : liee a une commande. ». En pratique, Eric a supprimé des commandes et des machines mais la carte restait bloquée, **sans savoir laquelle** des commandes la retenait — d'autant qu'il peut y en avoir **deux natures différentes** : une **commande interne** (`COMMAND_ITEMS` → `COMMANDS`) **et** une **commande client** (`CLIENT_ORDER_LINES` → `CLIENT_ORDERS`), toutes deux réduites au même mot « une commande ». Cas réel constaté : `AMPLI_GEN6_TOP` bloquée par la commande interne #1 (DRAFT) **et** la commande client `CMD-0003` en même temps.

But : (A) que le refus **nomme précisément** ce qui bloque (n°/référence, nature interne vs client, statut) pour que l'utilisateur sache exactement quoi supprimer ; (B) qu'un **lien orphelin** (ligne dont la commande parente n'existe plus) **ne bloque plus** la suppression.

## 2. Spécification (le QUOI)
Fichiers clés : **`serveur/src/services/bom_reference_service.py`** (`_link_reasons`, `ReferenceLinkedError`, `delete_reference`, `delete_references_bulk`), **`serveur/src/routes/bom_files.py`** (endpoint `DELETE /bom/references/{id}` + bulk), et l'affichage du refus côté front (`CardDetailDialog.jsx` unitaire + rapport bulk de `CardCatalogPage.jsx`).

### A. Détail des liens bloquants (backend + affichage)
- `_link_reasons` (ou une nouvelle fonction `_link_details`) doit renvoyer, en plus du libellé, **de quoi identifier chaque bloqueur** :
  - **Commande interne** : lister les `COMMANDS` liées via `COMMAND_ITEMS.bom_revision_id ∈ rev_ids` → `{ nature: "commande interne", id, nom, statut }` (ex. « commande interne #1 "Commande AMPLI_GEN6_TOP REV_A" (DRAFT) »).
  - **Commande client** : lister les `CLIENT_ORDERS` liées via `CLIENT_ORDER_LINES.bom_reference_id == ref.id` → `{ nature: "commande client", id, reference, statut }` (ex. « commande client CMD-0003 (DELIVERED) »).
  - **Production** : `PRODUCTION_BOM_REVISIONS` → identifier la/les production(s).
  - **Stock cartes** : quantité totale > 0 (indiquer la quantité).
  - **Assemblage** : la/les carte(s) parente(s) (`ASSEMBLY_ITEMS.child_reference_id == ref.id`).
  - **Modèle machine** : le/les modèle(s) (`MACHINE_MODEL_CARDS`).
- `ReferenceLinkedError` porte une **liste structurée** `links` (nature + identifiants + libellé lisible), pas seulement `reasons: List[str]`. Garder `reasons` (libellés) pour compat, ajouter `links` détaillé.
- **Endpoint** : le `detail` du 409 reste lisible (phrase FR listant les bloqueurs nommés) ; ajouter dans la réponse un champ structuré (ex. `links`) pour un affichage riche côté front.
- **Front** : le message de refus (toast/ConfirmDialog unitaire + rapport bulk) affiche la **liste nommée** des bloqueurs (« Carte X non supprimable — retenue par : commande interne #1 (DRAFT), commande client CMD-0003 (livrée) »). L'utilisateur doit pouvoir lire quoi supprimer.

### B. Liens orphelins non bloquants
- Un `COMMAND_ITEMS` dont la **commande parente `COMMANDS` n'existe plus** (orphelin) **ne doit pas** bloquer la suppression (le compter comme inexistant). Idem pour un `CLIENT_ORDER_LINES` dont l'`order` parent a disparu. Le check de « commande » doit vérifier l'**existence du parent** (jointure), pas seulement la présence de la ligne enfant.
- *(Optionnel, à évaluer)* : proposer un nettoyage best-effort de ces lignes orphelines lors de la suppression (ou au moins ne pas s'en servir comme motif de refus).

**Critères d'acceptation :**
- [ ] Refus 409 **nomme** chaque bloqueur avec sa nature (interne/client/production/stock/assemblage/machine) et son identifiant (n°/référence + statut).
- [ ] **Distinction claire** commande interne (`COMMANDS`) vs commande client (`CLIENT_ORDERS`) — plus jamais « une commande » ambigu.
- [ ] Un lien **orphelin** (parent supprimé) **ne bloque plus** la suppression.
- [ ] Affichage front (unitaire + rapport bulk) montre la liste nommée des bloqueurs.
- [ ] Aucune régression : une carte réellement liée (parent existant) reste refusée ; une carte non liée se supprime.
- [ ] Captures `docs/prompts/preuves/023/` (refus détaillé unitaire + bulk).

**Hors périmètre :** suppression forcée (« force delete » cascade dans les commandes) — non ; backfill des noms legacy (020/021).

## 3. Architecture & décisions
- **Backend** : enrichir `_link_reasons` → `_link_details` renvoyant `List[dict]` (nature, id, libellé, statut). `ReferenceLinkedError(reference, reasons, links)`. `delete_reference`/`delete_references_bulk` propagent `links`. Vérifier l'**existence du parent** dans les checks commande (jointure `COMMAND_ITEMS`↔`COMMANDS`, `CLIENT_ORDER_LINES`↔`CLIENT_ORDERS`) pour ignorer les orphelins.
- **Route** : `DELETE /bom/references/{id}` (+ bulk) → 409 avec `detail` phrase lisible **et** `links` structuré ; le rapport bulk inclut les `links` par carte ignorée.
- **Front** : `CardDetailDialog.jsx` (gestion 409 : afficher `links`) + `CardCatalogPage.jsx` (rapport bulk : « Y ignorées » avec le détail des liens). Découper si > 300 lignes.
- **Test FK** avec `PRAGMA foreign_keys=ON` (SQLite) comme en 020.

## 4. Plan
1. Cartographier `_link_reasons` + usages (route + bulk + front).
2. `_link_details` (identifiants + statut) + vérif existence parent (orphelins non bloquants).
3. `ReferenceLinkedError.links` + propagation route/bulk.
4. Front : afficher la liste nommée des bloqueurs (unitaire + bulk).
5. Tests (pytest : message nommé, distinction interne/client, orphelin non bloquant ; npm : affichage du détail) + staging + captures.

## 5. Tests
- `pytest` : carte liée à une commande interne → message la nomme (id + statut) ; liée à une commande client → message la nomme ; liée aux deux → les deux listées ; **ligne orpheline (parent absent) → NON bloquante** (suppression réussit) ; carte non liée → supprimée ; `PRAGMA foreign_keys=ON`.
- `npm test` : le refus 409 affiche la liste nommée des bloqueurs (unitaire + rapport bulk).
- **Staging (:8001)** : tenter de supprimer une carte liée → message précis nommant les commandes ; supprimer les commandes nommées → la carte se supprime. Captures `docs/prompts/preuves/023/`.

## 6. DoD
Critères §2 · `pytest` + `npm test` verts · migration N/A · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Package `src` · imports relatifs · `utcnow()` · **action destructive → confirmation + refus si liée (comportement 020 conservé)** · composant React < 300 lignes (découper) · pas de front sans preuve · lecture seule sur `\\rs\Elec\...`. Branche courte depuis `dev`, PR vers `dev`, CI verte. Bloquant → `echanges/ouverts/`.

## 8. RÉSULTAT — à remplir par l'orchestrateur
