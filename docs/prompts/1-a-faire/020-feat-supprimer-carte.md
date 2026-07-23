# [020] feat(cartes): supprimer une carte entière (doublons) avec garde-fous

| Champ | Valeur |
|---|---|
| **ID** | 020 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/supprimer-carte` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : non avec un prompt touchant CardCatalogPage/CardDetailDialog (ex. 019 : séquencer ou coordonner) |
| **Source** | Retour Eric (nettoyage doublons après import catalogue) · **Créé le** 2026-07-23 |

## 1. Objectif (le POURQUOI)
Après l'import en masse (011), il peut y avoir des **doublons** de cartes (mêmes références importées deux fois, variantes à nettoyer). Aujourd'hui on ne peut supprimer qu'une **révision** (par face), pas une **carte entière**. Eric veut un **bouton « Supprimer la carte »** pour retirer une référence complète — **avec garde-fous** pour ne pas détruire des données liées à une production/stock.

## 2. Spécification (le QUOI)

**Backend — nouvel endpoint + service :**
- `DELETE /bom/references/{bom_reference_id}` (route BOM ; auth `X-API-Key` comme le reste) → service `delete_reference(bom_reference_id)`.
- **Garde-fous (défaut prudent, à confirmer par Eric)** : **refuser** (HTTP 409 + message clair listant les blocages) si la carte est **référencée** par : une **production** (`bom_links` / productions), du **stock cartes** (`board_stock` avec quantité > 0), une **commande**, ou est **sous-carte** d'un assemblage (`assembly_items`). Sinon → suppression.
- **Suppression propre (si autorisée)** : supprimer `BomReference` + ses `BomRevision` + `BomItem` + snapshots fichiers associés (`bom_file_service.delete_revision_snapshot` par révision/face) **sans laisser d'orphelin** (cf. leçon `delete_production` : penser à TOUTES les tables enfant, FK sur SQL Server). Transaction unique.
- ⚠ Si le périmètre de cascade est ambigu (ex. faut-il autoriser la suppression même si stock à 0 mais historique de commandes existe ?) → **ouvrir un échange** plutôt que deviner.

**Frontend :**
- Bouton **« Supprimer la carte »** (rouge, discret) dans la fiche carte (`CardDetailDialog`) — et/ou une action dans la ligne du catalogue (`CardCatalogPage`).
- **Confirmation obligatoire** via `components/common/ConfirmDialog.jsx` (déjà présent) : message rappelant la **portée** (« Supprimer la carte **{référence} — {nom}** et ses **N révisions** ? Action irréversible. »).
- **Retour** : succès → fermer la fiche + rafraîchir le catalogue + toast/snackbar de confirmation ; **409** (carte liée) → afficher clairement **pourquoi** elle ne peut pas être supprimée (« utilisée dans la production X / stock Y »), sans supprimer.

**Critères d'acceptation :**
- [ ] Endpoint `DELETE` carte + service avec transaction et suppression des enfants (aucun orphelin).
- [ ] **Refus 409 clair** si la carte est liée (production/stock/commande/assemblage) — rien n'est supprimé dans ce cas.
- [ ] Bouton **« Supprimer la carte »** + **ConfirmDialog** avec portée ; catalogue rafraîchi après suppression.
- [ ] Message d'erreur explicite en cas de refus 409.
- [ ] Captures `docs/prompts/preuves/020/` (suppression OK + cas refus).

**Hors périmètre :** fusion/déduplication automatique des doublons (ce prompt = suppression manuelle unitaire) ; suppression en masse (évolution ultérieure).

## 3. Architecture & décisions
- **Backend** : route BOM (`serveur/src/routes/bom*.py`) + service (`bom` / nouveau `bom_reference_service` ou méthode dans un service existant). Réutiliser `bom_file_service.delete_revision_snapshot`. Vérifier les liens via les modèles existants (`board_stock`, `bom_links`/productions, commandes, `assembly_items`).
- **Test FK** : reproduire une carte liée à une production → l'endpoint refuse (409), pas de 500. Une carte non liée → supprimée proprement. ⚠ SQLite : activer `PRAGMA foreign_keys=ON` dans le test pour valider la cascade comme en prod.
- **Front** : `CardDetailDialog.jsx` (bouton + ConfirmDialog + appel `apiClient.delete`) ; `CardCatalogPage.jsx` (rafraîchissement de la liste). ConfirmDialog déjà dispo.
- Décision (défaut) : **refuser** la suppression d'une carte liée plutôt que cascader dans des productions — Eric pourra assouplir plus tard.

## 4. Plan
1. Cartographier les liens d'une `BomReference` (productions/stock/commandes/assemblages) + les endpoints/services BOM existants.
2. Service `delete_reference` (checks liens → 409 sinon suppression transactionnelle des enfants + snapshots).
3. Endpoint `DELETE /bom/references/{id}`.
4. Front : bouton + ConfirmDialog + gestion succès/409 + refresh.
5. Tests (pytest cascade + refus ; npm bouton/confirm) + staging + captures.

## 5. Tests
- `pytest` : suppression carte non liée (enfants supprimés, pas d'orphelin, `PRAGMA foreign_keys=ON`) ; refus 409 si liée à une production/stock ; idempotence (404 si déjà supprimée).
- `npm test` : bouton + ConfirmDialog ; refresh après suppression ; message 409.
- **Staging (:8001)** : supprimer un doublon (non lié) → disparaît du catalogue ; tenter une carte liée → refus expliqué. Captures `docs/prompts/preuves/020/`.

## 6. DoD
Critères §2 · `pytest` + `npm test` verts · migration N/A (pas de nouveau champ) · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Package `src` · imports relatifs · `utcnow()` · **action destructive → confirmation obligatoire + refus si liée** · composant React < 300 lignes · pas de front sans preuve · lecture seule sur `\\rs\Elec\...`. Branche courte depuis `dev`, PR vers `dev`, CI verte. Point bloquant → `docs/prompts/echanges/ouverts/`.

## 8. RÉSULTAT — à remplir par l'orchestrateur
