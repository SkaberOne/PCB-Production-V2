# RÉSULTAT — [023] fix(cartes) : refus 409 nomme les bloqueurs + liens orphelins non bloquants

- **Statut** : ✅ terminé
- **Branche** : `fix/suppr-carte-detail-liens` (depuis `dev` à jour)
- **PR** : [#100](https://github.com/SkaberOne/PCB-Production-V2/pull/100) vers `dev` — CI verte (backend + frontend + e2e), mergée `--no-ff` (`61d8988`)

## Ce qui a été fait

### Backend — `serveur/src/services/bom_reference_service.py`
- **`_link_details(db, ref, rev_ids)`** (remplace `_link_reasons`) renvoie une **liste structurée** de bloqueurs, chacun `{nature, id, label, …}` :
  - **production** : `production #<id> "<nom>" (<statut>)` ;
  - **stock** : `stock cartes (<qté> en stock)` (somme des révisions) ;
  - **commande interne** (`COMMANDS` via `COMMAND_ITEMS`) : `commande interne #<id> "<nom>" (<statut>)` ;
  - **commande client** (`CLIENT_ORDERS` via `CLIENT_ORDER_LINES`) : `commande client <reference> (<statut>)` ;
  - **assemblage** : `assemblage <reference parente> (carte parente)` ;
  - **modèle machine** : `modèle machine "<nom>"`.
- **Liens orphelins non bloquants** : les checks commande / assemblage / modèle machine **joignent le parent** (`JOIN`) → une ligne enfant dont le parent a été supprimé est **ignorée** (ne bloque plus).
- **`ReferenceLinkedError(reference, reasons, links)`** : `reasons` = labels (compat 020), `links` = structure. `delete_reference` et `delete_references_bulk` propagent `links` (rapport `skipped[i].links`).

### Route — `serveur/src/routes/bom_files.py`
- `DELETE /bom/references/{id}` : sur lien → **409** via `JSONResponse` `{detail, reference, links}`. `detail` = phrase FR nommée (« … non supprimable — retenue par : … », contient « non supprimable » → compat test 020) ; `links` = structure riche.
- Schéma `ReferenceLinkEntry` + `SkippedReferenceEntry.links` ajoutés.

### Front — `client/src/frontend/src/components/library/BulkDeleteReportDialog.jsx`
- Le rapport bulk liste **chaque bloqueur nommé sur sa propre ligne** (via `links`, repli sur `reasons`). Le refus unitaire affiche déjà la phrase nommée (409 `detail` via `extractApiError`).

## Tests
- **pytest** : `serveur/src/tests/test_supprimer_carte_detail_023.py` (7, `PRAGMA foreign_keys=ON`) — commande interne nommée (id + statut), commande client nommée, les deux listées, **`COMMAND_ITEMS` orphelin non bloquant**, **`CLIENT_ORDER_LINES` orphelin non bloquant**, carte non liée supprimée, API 409 (`detail` + `links`). Non-régression `test_supprimer_carte_020` (10). **Suite backend : 608 passed, 1 skipped**.
  - Note test : `db_fk` remet `PRAGMA foreign_keys = OFF` au teardown (StaticPool partage la connexion) et les tests orphelins forcent `OFF` — évite une fuite d'état entre fichiers en suite globale.
- **npm** : `CardCatalogPage.test.jsx` (+2 : refus unitaire nommé interne+client, rapport bulk `links`). **Suite frontend : 195 passed / 50 suites**.

## Preuve — staging (:8001), carte `AMPLI_GEN6`
`docs/prompts/preuves/023/` :
- `023-01-refus-unitaire-nomme.jpg` — bandeau de refus : « Carte AMPLI_GEN6 non supprimable — retenue par : production #12 "prod02 Carrier Board D3000 Rev-F DATE:07/2026" (ACTIVE), stock cartes (19 en stock), **commande interne #8 "…" (DRAFT)**, **commande client CMD-0001 (READY)**, **CMD-0002 (OPEN)**, **CMD-0003 (DELIVERED)** ».
- `023-02-rapport-bulk-liens-nommes.jpg` — rapport bulk : « 0 supprimée(s), 1 ignorée(s) » avec **une ligne par bloqueur** (interne vs client distingués, id + statut).

## Décision / périmètre
- Distinction **commande interne** (`COMMANDS`) vs **commande client** (`CLIENT_ORDERS`) : plus jamais « une commande » ambigu.
- Hors périmètre : « force delete » (cascade dans les commandes) ; backfill des noms legacy (020/021).
