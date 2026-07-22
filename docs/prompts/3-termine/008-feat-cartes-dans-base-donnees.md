# [008] feat(nav): intégrer l'onglet « Cartes » dans « Base de données »

| Champ | Valeur |
|---|---|
| **ID** | 008 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/cartes-dans-bdd` |
| **Priorité** | normale · **Dépend de** 001 (Cartes, mergé) · **Parallèle** : non avec un prompt touchant AppShell/App.jsx/BaseDeDonneesPage |
| **Créé le** | 2026-07-22 |

## 1. Objectif
Simplifier la nav : « Cartes » ne doit plus être un item de menu séparé, mais un **onglet/section dans « Base de données »** (groupe Bibliothèque).

## 2. Spécification
- Retirer l'item de menu **« Cartes »** (`/cartes`).
- Dans **« Base de données »** (`/base-donnees`), ajouter un **onglet « Cartes »** qui affiche le catalogue actuel (la page/detail Cartes existante).
- `/cartes` **redirige** vers `/base-donnees` (onglet Cartes) — pas de lien mort.
- Aucune perte de fonctionnalité du catalogue (liste, détail carte, révisions, édition métadonnées/catégorie — tout ce que 001 a livré).

**Acceptation :** menu sans « Cartes » ; onglet « Cartes » dans Base de données pleinement fonctionnel ; `/cartes` redirige ; captures dans `docs/prompts/preuves/008/`.

## 3. Architecture
- `client/src/frontend/src/App.jsx` : retirer l'entrée `pages[]` `/cartes` du menu ; ajouter `<Route path="/cartes" element={<Navigate to="/base-donnees?tab=cartes" replace/>}/>`.
- `client/src/frontend/src/components/layout/AppShell.jsx` : plus d'item Cartes.
- `client/src/frontend/src/pages/BaseDeDonneesPage.jsx` : ajouter l'onglet **Cartes** montant le composant catalogue existant (`CardCatalogPage` / son contenu) en **sous-composant** — le réutiliser, ne pas dupliquer.
- Décision : le catalogue devient une **section de Base de données** ; on conserve son composant tel quel.

## 4. Plan
1. Extraire le contenu de `CardCatalogPage` en composant réutilisable si besoin.
2. Ajouter l'onglet dans `BaseDeDonneesPage` (gérer `?tab=cartes`).
3. Retirer l'item menu + redirection `/cartes`.
4. Tests + staging + captures.

## 5. Tests
- `npm test` : onglet Cartes rendu dans Base de données ; redirection `/cartes`.
- Staging : parcours catalogue complet dans le nouvel onglet ; captures `preuves/008/`.

## 6. DoD : critères §2 ; `npm test` + `pytest` verts ; staging + captures ; PR vers `dev` ; RESULTAT.md.

## 7. Contraintes : composant React < 300 lignes (découper) ; pas de front sans preuve visuelle ; branche courte depuis `dev`, PR vers `dev`, Chrome uniquement.

## 8. RÉSULTAT — à remplir par l'orchestrateur
