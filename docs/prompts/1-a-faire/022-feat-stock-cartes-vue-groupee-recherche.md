# [022] feat(stock-cartes): vue groupée par carte (révisions dépliables) + recherche

| Champ | Valeur |
|---|---|
| **ID** | 022 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/stock-cartes-vue-groupee` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : non avec un prompt touchant `BoardStockPage` (ex. 010, mergé ; coordonner avec 018/019 si chevauchement révisions) |
| **Source** | Retour Eric (usage Stock cartes) · **Créé le** 2026-07-23 |

## 1. Objectif (le POURQUOI)
L'onglet **Stock cartes** affiche aujourd'hui **une ligne par (carte × révision)** — une longue liste brute, **indigeste** dès qu'il y a beaucoup de cartes/révisions. Eric veut une **meilleure vision** (regroupement) + une **barre de recherche** pour retrouver vite une carte.

## 2. Spécification (le QUOI)
Écran : `client/src/frontend/src/pages/BoardStockPage.jsx` (colonnes actuelles : RÉFÉRENCE CARTE, RÉVISION, EN STOCK, MIN, PRIX/CARTE, VALEUR STOCK, TESTÉES, VALIDÉES, À DÉBUGGER, SUIVI).

### A. Vue groupée par carte
- **Une ligne par carte (référence)** au niveau replié, avec un **résumé agrégé** : total **EN STOCK** (somme des révisions), **valeur stock** totale, nombre de révisions, et éventuellement l'indicateur testées/validées/à débugger agrégé (barre `ProductionSuiviBar`).
- **Clic → déroulant** (`Collapse`) montrant le **détail par révision** (les lignes actuelles : révision, en stock, min, prix/carte, valeur, testées/validées/à débugger, barre SUIVI).
- Réutiliser le **patron de regroupement/dépli** du **prompt 019** (`RevisionGroupRow` / table expandable) si livré ; sinon même approche (`Set` d'ids ouverts, chevron).
- **Mettre en avant les cartes avec du stock** : par défaut, trier/regrouper de façon lisible (ex. cartes avec `en stock > 0` en haut, ou repli par défaut avec le total visible). *(Défaut ajustable.)*

### B. Recherche
- **Barre de recherche** en tête filtrant par **référence** ET **nom** de carte (insensible casse/accents), filtrage instantané. Le regroupement s'applique au résultat filtré.

**Critères d'acceptation :**
- [ ] **Une ligne par carte** (plus la liste brute par révision au 1er niveau) avec **total stock + valeur** agrégés.
- [ ] **Clic → déroulant** avec le détail par révision (données actuelles conservées, barre SUIVI incluse).
- [ ] **Barre de recherche** réf + nom, filtrage instantané.
- [ ] Aucune perte d'info (tout ce qui est affiché aujourd'hui reste accessible dans le déroulant).
- [ ] Composant **< 300 lignes** (découper : `CardStockRow` déroulant + barre de recherche).
- [ ] Captures `docs/prompts/preuves/022/`.

**Hors périmètre :** normalisation des libellés de révision (`REV_A`/`A`/`—`, c'est **018**) — ici on **affiche** et on **agrège** ; modification du calcul de stock (backend inchangé si possible).

## 3. Architecture & décisions
- **Réutiliser** au maximum : si `GET /marketplace/board-stock` renvoie déjà une liste par (carte, révision), agréger **côté client** par référence (somme stock/valeur, liste des révisions). Ajouter le **nom** de carte à la réponse s'il manque (pour la recherche) — sinon jointure front via `/marketplace/cards`.
- **Front** : `BoardStockPage.jsx` — barre de recherche + regroupement + `Collapse` par carte. Réutiliser `components/dashboard/ProductionSuiviBar.jsx` (déjà intégré en 010) pour l'agrégat et/ou par révision.
- Pas de changement de schéma attendu ; si un champ (nom, agrégat) manque à l'API, l'ajouter au schéma de réponse (léger).

## 4. Plan
1. Cartographier `BoardStockPage` + la réponse `GET /marketplace/board-stock` (a-t-on le nom ? l'agrégat ?).
2. Agréger par carte (client) + composant ligne dépliable (réutiliser 019 si dispo).
3. Barre de recherche réf+nom.
4. Tests + staging + captures.

## 5. Tests
- `npm test` : agrégation par carte (total stock/valeur corrects) ; dépli montre les révisions ; recherche filtre réf+nom.
- `pytest` : (si schéma board-stock modifié) exposition du nom/agrégat.
- **Staging (:8001)** : Stock cartes regroupé + recherche fonctionnelle sur les vraies données. Captures `docs/prompts/preuves/022/`.

## 6. DoD
Critères §2 · `npm test` (+`pytest` si back touché) verts · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Composant React < 300 lignes (découper) · réutiliser `ProductionSuiviBar` + le patron dépliable du 019 · pas de front sans preuve · package `src` si back touché. Branche courte depuis `dev`, PR vers `dev`, Chrome uniquement.

## 8. RÉSULTAT — à remplir par l'orchestrateur
