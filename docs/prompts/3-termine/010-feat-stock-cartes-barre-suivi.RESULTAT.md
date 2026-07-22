# RÉSULTAT — [010] Stock cartes : barre visuelle testées / validées / à débugger

- **Statut** : ✅ terminé
- **Branche** : feat/stock-cartes-barre
- **PR** : [#89](https://github.com/SkaberOne/PCB-Production-V2/pull/89) → dev — état CI : en attente (voir PR)
- **Déployé staging** : oui (:8001)

## Ce qui a été fait
L'onglet « Stock cartes » affiche désormais, par carte, une **barre de progression**
testées / validées / à débugger, **identique** à celle du dashboard (vert = validées,
orange = à débugger, bleu = testées en attente, gris = non testées).

- Colonne « Suivi » ajoutée dans `BoardStockPage`.
- Composant du dashboard **réutilisé** : `ProductionSuiviBar`, généralisé par un prop
  `testId` optionnel (sans casser le dashboard).
- Les compteurs `cards_tested/validated/to_debug` étaient déjà exposés par
  `GET /marketplace/board-stock` → **aucun changement backend**.

## Fichiers modifiés
- client/src/frontend/src/pages/BoardStockPage.jsx — colonne « Suivi » (barre par ligne)
- client/src/frontend/src/components/dashboard/ProductionSuiviBar.jsx — prop `testId` optionnel
- client/src/frontend/src/pages/__tests__/BoardStockPage.suivi.test.jsx — test (nouveau)

## Tests
- npm test : 40 suites / 152 tests passés (dont la barre + les 3 compteurs ; dashboard inchangé).
- pytest : suite backend inchangée (aucune modification backend — compteurs déjà exposés).
- Scénario staging vérifié : barre visible par carte ; carte AMPLI_GEN6 (7 testées / 5 validées /
  1 à débugger) → barre colorée cohérente avec le dashboard ; cartes à 0 → barre grise.

## Preuves (front)
- Colonne Suivi + barre colorée → `docs/prompts/preuves/010/010-stock-cartes-barre-suivi.jpg`

## Erreurs rencontrées & corrections
- Bundle staging en cache après rebuild → hard reload. Les compteurs d'une carte ont été
  renseignés via l'API board-stock pour illustrer une barre colorée (donnée de staging).

## Réserves / à finir
- RAS.
