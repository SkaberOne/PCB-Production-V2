# [010] feat(stock-cartes): barre visuelle testées / validées / à débugger

| Champ | Valeur |
|---|---|
| **ID** | 010 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/stock-cartes-barre` |
| **Priorité** | basse · **Dépend de** aucune · **Parallèle** : oui (page dédiée BoardStockPage) |
| **Créé le** | 2026-07-22 |

## 1. Objectif
Rendre l'onglet **« Stock cartes »** plus visuel : afficher une **barre de progression testées / validées / à débugger** par carte, **comme le dashboard**.

## 2. Spécification
- Pour chaque carte de « Stock cartes », afficher la **barre** (testées / validées / à débugger), identique visuellement à celle du dashboard.
- La donnée existe déjà : `BoardStock.cards_tested / cards_validated / cards_to_debug`.

**Acceptation :** barre affichée par carte, cohérente avec le dashboard ; captures `docs/prompts/preuves/010/`.

## 3. Architecture
- **Réutiliser** le composant barre existant du dashboard : `client/src/frontend/src/components/dashboard/ProductionSuiviBar.jsx` (le généraliser si besoin, sans casser le dashboard).
- Page : `client/src/frontend/src/pages/BoardStockPage.jsx` — intégrer la barre par ligne carte.
- Backend : `BoardStock` a déjà `cards_tested/validated/to_debug` ; **vérifier qu'ils sont exposés** dans la réponse `GET /marketplace/board-stock` ; les ajouter au schéma sinon.

## 4. Plan
1. Vérifier l'exposition des 3 compteurs dans l'API board-stock (ajouter au schéma si absent).
2. Réutiliser/adapter `ProductionSuiviBar` dans `BoardStockPage`.
3. Tests + staging + captures.

## 5. Tests
- `npm test` : barre rendue avec les 3 compteurs.
- `pytest` : (si schéma modifié) exposition des compteurs.
- Staging : barre visible sur une carte en stock ; captures `preuves/010/`.

## 6. DoD : critères §2 ; tests verts ; staging + captures ; PR vers `dev` ; RESULTAT.md.

## 7. Contraintes : composant React < 300 lignes ; réutiliser le composant dashboard sans le casser ; pas de front sans preuve ; branche courte depuis `dev`, PR vers `dev`, Chrome uniquement.

## 8. RÉSULTAT — à remplir par l'orchestrateur
