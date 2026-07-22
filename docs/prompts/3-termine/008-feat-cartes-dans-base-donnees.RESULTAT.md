# RÉSULTAT — [008] intégrer l'onglet « Cartes » dans « Base de données »

- **Statut** : ✅ terminé
- **Branche** : feat/cartes-dans-bdd
- **PR** : [#87](https://github.com/SkaberOne/PCB-Production-V2/pull/87) → dev — état CI : en attente (voir PR)
- **Déployé staging** : oui (:8001)

## Ce qui a été fait
« Cartes » n'est plus un item de menu séparé : c'est un **onglet de « Base de données »**
(groupe Bibliothèque). Le catalogue existant est **réutilisé** (pas dupliqué) et toutes ses
fonctionnalités sont conservées (liste, détail carte, métadonnées/catégorie, révisions/BOM).

- Item de menu « Cartes » retiré (`App.jsx` `pages[]`).
- `BaseDeDonneesPage` : onglet « Cartes » qui monte `CardCatalogPage` avec une prop
  `embedded` (masque l'en-tête de page redondant, conserve les actions). Ouverture directe
  via `?tab=cartes`.
- `/cartes` **et** `/fichier-bom` redirigent vers `/base-donnees?tab=cartes` (pas de lien mort).

## Fichiers modifiés
- client/src/frontend/src/App.jsx — retrait item menu Cartes + import inutile ; routes de redirection
- client/src/frontend/src/pages/BaseDeDonneesPage.jsx — onglet Cartes + gestion `?tab=cartes`
- client/src/frontend/src/pages/CardCatalogPage.jsx — prop `embedded` (réutilisation sans double en-tête)
- client/src/frontend/src/pages/__tests__/BaseDeDonneesPage.cartes.test.jsx — tests (nouveau)

## Tests
- npm test : 40 suites / 154 tests passés (dont onglet Cartes + `?tab=cartes` ; CardCatalogPage standalone toujours vert).
- pytest : 555 passés / 0 échoué (1 skip préexistant) — inchangé (feature front only).
- Scénarios staging vérifiés :
  - `/cartes` redirige vers l'onglet Cartes de Base de données ; menu sans item « Cartes ».
  - Onglet « Cartes » : catalogue (16 cartes) + ouverture d'une fiche (métadonnées, révisions, « Ouvrir »).

## Preuves (front)
- Menu sans Cartes + redirection + onglet catalogue → `docs/prompts/preuves/008/008-cartes-onglet-base-donnees-redirect.jpg`
- Détail carte fonctionnel dans l'onglet → `docs/prompts/preuves/008/008-cartes-detail-fonctionnel.jpg`

## Erreurs rencontrées & corrections
- Bundle staging servi en cache par Chrome après rebuild → hard reload (Ctrl+Shift+R) ; build
  vérifié à jour (contient la redirection `base-donnees?tab=cartes`). Aucune correction code.

## Réserves / à finir
- RAS.
