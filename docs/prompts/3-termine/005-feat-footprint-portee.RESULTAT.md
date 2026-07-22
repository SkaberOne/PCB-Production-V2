# RÉSULTAT — [005] changement de footprint avec choix de portée (+ MPN qui suit)

- **Statut** : ✅ terminé
- **Branche** : `feat/footprint-portee` (depuis `dev` à jour)
- **PR** : [#83](https://github.com/SkaberOne/PCB-Production-V2/pull/83) vers `dev` — CI à valider verte
- **Déployé staging** : oui (:8001, build `build-web-staging`) — preuves front ci-dessous

## Ce qui a été fait

Parité **footprint ↔ valeur** : le 002 avait livré la portée sur la **valeur** ; ce prompt fait l'**empreinte**, en réutilisant/généralisant son dialog de portée.

### Frontend
- `client/src/frontend/src/components/bom/ScopeDialog.jsx` (nouveau) : dialog de portée **générique** (titre + libellé « tous » + contenu paramétrés).
- `ValueScopeDialog.jsx` : **refactoré** sur `ScopeDialog` (comportement 002 strictement inchangé — mêmes libellés « Portée du changement de valeur » / « Tous (N) »).
- `FootprintScopeDialog.jsx` (nouveau) : « Portée du changement d'empreinte », bouton « **Tous les <valeur> en <ancien footprint> (N)** ».
- `BomReviewTab.jsx` : la cellule footprint PnP valide à `onBlur` (comme la valeur) → `handleFootprintCommit`. Si d'autres lignes partagent **(valeur harmonisée + ancien footprint)** → ouverture du dialog de portée. « Ce composant » garde la seule ligne ; « Tous » appelle `onBulkFootprintChange` ; « Annuler » restaure l'ancien footprint.
- `BomViewerPage.jsx` : `handleFootprintChange` devient **per-item + undo** (fini le regroupement par `footprint_eagle`, trop large). Nouveau `handleBulkFootprintChange(valeur, ancien footprint, nouveau footprint)` : applique au sous-ensemble **(même valeur ET même ancien footprint)**, avec undo.

### Backend
- **Aucun changement.** La résolution composant/MPN passe déjà par `ComponentLibraryService.match_bom_item` sur `(valeur, footprint)` (candidats `[footprint_pnp, footprint_eagle]`). Le MPN suit donc **automatiquement** le composant `(valeur, nouveau footprint)` ; absent de la bibliothèque → **sans MPN**, jamais l'ancien (règle E01). Verrouillé par test.

## Preuves (front) — staging :8001

Répertoire `docs/prompts/preuves/005/` :
1. `005_preuve_1_avant_100nF_0805_partage.jpg` — deux 100nF (C1, C4) partagent l'empreinte 0805 ; les LED sont en 0603.
2. `005_preuve_2_dialog_portee_footprint.jpg` — édition de C1 (0805→0603) → dialog « Portée du changement d'empreinte » + bouton « **Tous les 100nF en 0805 (2)** ».
3. `005_preuve_3_tous_100nF_0805_vers_0603.jpg` — après « Tous » : **seuls** C1 et C4 (100nF/0805) passent en 0603 ; les LED (autre valeur) restent inchangées.

## Tests

- **npm** : `client/src/frontend/src/components/bom/__tests__/BomReviewTab.footprintScope.test.jsx` — dialog sur (valeur+footprint) partagé ; « tous » ne cible que le bon sous-ensemble ; « ce composant » ; non-partagé = pas de dialog ; annuler = restaure. **Suite complète : 35 suites / 133 tests passed** (dont la non-régression 002 `valueScope`).
- **pytest** : `serveur/src/tests/test_footprint_change_mpn_propagation.py` — `(valeur, nouveau footprint)` → bon MPN ; autre footprint → son propre MPN ; `(valeur, footprint)` absent → `None`. **Suite complète : 544 passed, 1 skipped** (hors `test_migrations.py`, blast radius E01 relancé).

## Réserves / à finir

- La démonstration staging de la **propagation MPN dans la commande** n'a pas été rejouée en UI (la bibliothèque staging n'a pas de couple `(valeur, footprint)` prêt) ; le mécanisme partagé est verrouillé par `test_footprint_change_mpn_propagation.py` (et la non-régression E01).
