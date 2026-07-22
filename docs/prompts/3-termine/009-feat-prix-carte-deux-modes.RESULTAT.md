# RÉSULTAT — [009] « Prix carte » — deux modes (production / carte en général)

- **Statut** : ✅ terminé
- **Branche** : feat/prix-carte-modes
- **PR** : #NN (à compléter) → dev — état CI : en attente
- **Déployé staging** : oui (:8001)

## Ce qui a été fait
L'onglet « Prix carte » propose un **sélecteur de mode** en tête :
- **Production (run précis)** : coût de revient (HT/TTC) d'une production donnée — comportement
  existant (sélecteur de production, paramètres atelier + données production, coût total et
  coût unitaire par carte).
- **Carte en général (référence)** : prix unitaire **de référence** d'une carte, **indépendant
  d'une production** — nouveau `CardReferencePanel` qui liste **toutes** les cartes
  (`GET /costing/cards`) et affiche le dernier prix figé `is_reference` (HT/TTC) + l'historique.

Aucun changement backend : les deux calculs existaient déjà (`compute_production` et le prix
de référence `is_reference` exposé par `/costing/cards` et `/costing/cards/{id}/history`). Le
travail a consisté à **exposer ces deux calculs comme deux modes explicites**.

`CostingPage` refactorisé (320 → 275 lignes, < 300) ; extraction de `CardReferencePanel` (107 lignes).

## Fichiers modifiés
- client/src/frontend/src/pages/CostingPage.jsx — sélecteur de mode + rendu conditionnel (refactor)
- client/src/frontend/src/components/costing/CardReferencePanel.jsx — mode « carte en général » (nouveau)
- client/src/frontend/src/pages/__tests__/CostingPage.modes.test.jsx — tests (nouveau)

## Tests
- npm test : 40 suites / 153 tests passés (dont sélecteur de mode + les deux rendus).
- pytest : costing 8/8 (calcul production + prix de référence/historique) ; suite backend inchangée (feature front only).
- Scénarios staging vérifiés :
  - Mode Production : coût total HT (67 492 €) / TTC (80 990 €) d'un run, coût unitaire par carte.
  - Mode Carte en général : sélection d'une carte (toutes cartes) → prix de référence unitaire
    HT (132,76 €) / TTC (159,31 €) + historique, sans production sélectionnée.

## Preuves (front)
- Mode Production → `docs/prompts/preuves/009/009-mode-production.jpg`
- Mode Carte en général → `docs/prompts/preuves/009/009-mode-carte-reference.jpg`

## Erreurs rencontrées & corrections
- Bundle staging en cache après rebuild → hard reload. Aucune correction code.

## Réserves / à finir
- RAS. (Le comparatif « écart vs référence » de l'ancien sous-onglet est remplacé par la
  consultation directe du prix de référence dans le mode « Carte en général ».)
