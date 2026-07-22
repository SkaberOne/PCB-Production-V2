# [009] feat(costing): « Prix carte » — deux modes (production / carte en général)

| Champ | Valeur |
|---|---|
| **ID** | 009 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/prix-carte-modes` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : non avec un prompt touchant CostingPage/costing_service |
| **Créé le** | 2026-07-22 |

## 1. Objectif
L'onglet « Prix carte » doit permettre de calculer **au choix** :
- **Mode Production** : le prix d'une **production précise** (un run donné — quantités, pertes, série).
- **Mode Carte en général** : le prix **unitaire de référence** d'une carte, **hors production spécifique**.

## 2. Spécification
- Ajouter un **sélecteur de mode** (Production / Carte en général) en tête de l'onglet.
- **Mode Production** : comportement actuel « coût de revient à la production » (lié à une production/run).
- **Mode Carte en général** : coût unitaire de référence de la carte, indépendant d'une production (basé sur les coûts de référence : composants, temps d'assemblage type, coeff. de perte global — cf `ProductionCosting.is_reference` déjà utilisé pour le « prix de référence par carte »).
- Résultats clairement étiquetés selon le mode ; HT/TTC conservés.

**Acceptation :** sélecteur 2 modes ; chaque mode calcule et affiche le bon prix ; captures `docs/prompts/preuves/009/`.

## 3. Architecture
- **Cartographier d'abord** `client/src/frontend/src/pages/CostingPage.jsx` + `serveur/src/services/costing_service.py` : l'onglet fait DÉJÀ « coût à la production » **et** « prix de référence par carte » (`is_reference`). Il s'agit surtout d'**exposer ces deux calculs comme deux modes explicites**, pas de tout réécrire.
- Frontend : `CostingPage.jsx` — sélecteur + rendu conditionnel.
- Backend : réutiliser les endpoints costing existants (production vs référence) ; en ajouter un seulement si le calcul « carte en général » n'est pas déjà exposé.
- Décision (Eric) : deux modes = production (run précis) vs carte de référence (unitaire général).

## 4. Plan
1. Cartographier CostingPage + costing_service (identifier les 2 calculs existants).
2. Ajouter le sélecteur de mode + brancher chaque mode sur le bon calcul/endpoint.
3. Étiquetage clair des résultats.
4. Tests + staging + captures.
> Si le calcul « carte en général » n'existe pas côté back → l'implémenter (coûts de référence, hors run) ; si ambigu sur sa définition exacte → **échange**.

## 5. Tests
- `pytest` : calcul prix production vs prix référence carte.
- `npm test` : sélecteur de mode + rendu.
- Staging : les deux modes sur une carte connue ; captures `preuves/009/`.

## 6. DoD : critères §2 ; `pytest`+`npm test` verts ; staging + captures ; PR vers `dev` ; RESULTAT.md.

## 7. Contraintes : package `src` ; composant React < 300 lignes ; pas de front sans preuve ; branche courte depuis `dev`, PR vers `dev`, Chrome uniquement.

## 8. RÉSULTAT — à remplir par l'orchestrateur
