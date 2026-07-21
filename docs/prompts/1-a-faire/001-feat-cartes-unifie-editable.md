# [001] feat(cartes): fusionner « BOM enregistrées » et « Cartes » + rendre la carte éditable

| Champ | Valeur |
|---|---|
| **ID** | 001 |
| **Type** | feat |
| **Branche cible (PR)** | `dev` (branche d'intégration, déployée sur staging :8001) |
| **Branche de travail** | `feat/cartes-unifie-editable` (créée depuis `dev` à jour) |
| **Priorité** | haute |
| **Créé le** | 2026-07-21 |
| **Dépend de** | aucune |
| **Peut tourner en parallèle** | non (touche la nav + les pages de la Bibliothèque) |

---

## 1. Objectif (le POURQUOI)

Aujourd'hui il y a deux onglets distincts pour la même réalité : **« BOM enregistrées »** (`/fichier-bom`) et **« Cartes »** (`/cartes`). Or une BOM importée **correspond** à une carte référencée. On veut **une seule entrée « Cartes »**, et pouvoir **modifier une carte** : ses métadonnées (nom / type / catégorie) **et** le contenu de sa BOM.

## 2. Spécification (le QUOI)

Un seul onglet **« Cartes »** dans le groupe Catalogue. L'onglet « BOM enregistrées » disparaît du menu ; ses fonctions (révisions par référence, catégories, ouvrir / supprimer une révision) sont **intégrées dans le flux Cartes**. Vue **liste de cartes** (comme aujourd'hui) → **clic sur une carte** ouvre son détail (infos carte + ses révisions/BOM + actions). Depuis là, on édite les **métadonnées** au même endroit et on peut **ouvrir la BOM** de la carte dans la Revue BOM éditable pour corriger le contenu.

**Critères d'acceptation :**
- [ ] Le menu ne contient plus « BOM enregistrées » ; « Cartes » est l'entrée unique du catalogue.
- [ ] Depuis « Cartes » : liste → clic sur une carte → détail avec ses révisions et l'accès à sa/ses BOM.
- [ ] Les fonctions de `BomFilesPage` sont conservées dans le nouveau flux : classement par **catégorie**, création de catégorie, changement de catégorie d'une référence, suppression d'une révision.
- [ ] Édition **métadonnées** regroupée au même endroit : **nom**, **type** (SIMPLE/ASSEMBLY), **catégorie** — et ça persiste.
- [ ] Édition **contenu** : depuis une carte, ouvrir une révision de sa BOM dans la Revue BOM, modifier des lignes (valeur, quantité, empreinte, etc.), enregistrer ; après rechargement les modifications sont bien là.
- [ ] `/fichier-bom` redirige vers `/cartes` (aucun lien mort ; adapter les renvois type « Aller à… »).

**Hors périmètre :** le regroupement/renommage complet des **autres** groupes de menu (prompt nav séparé) ; l'import CAO KiCad/Eagle et l'aperçu PCB (prompts ultérieurs) ; la fusion de composants équivalents en revue (prompt 003).

## 3. Architecture & décisions

**Frontend :**

| Zone | Fichier(s) | Action |
|---|---|---|
| Page catalogue (devient l'unique) | `client/src/frontend/src/pages/CardCatalogPage.jsx` (259 l.) | étendre : détail par carte, révisions, catégories |
| Page à absorber | `client/src/frontend/src/pages/BomFilesPage.jsx` (469 l.) | migrer sa logique (révisions/catégories/ouvrir/supprimer) dans le flux Cartes, puis retirer du menu |
| Helpers | `client/src/frontend/src/utils/bomFileExplorer.js` | réutiliser |
| Éditeur de BOM | `client/src/frontend/src/pages/BomViewerPage.jsx`, `components/bom/BomReviewTab.jsx` | rouvrir une **révision sauvegardée** dans la Revue éditable |
| Nav + routes | `client/src/frontend/src/App.jsx`, `components/layout/AppShell.jsx` | retirer l'item `/fichier-bom` ; garder « Cartes » ; ajouter la redirection |
| Dialog d'édition carte | `CardEditDialog` (dans `CardCatalogPage.jsx`) | ajouter le champ **catégorie** |

**Backend (déjà en place, à réutiliser — vérifier, pas réécrire) :**
- `serveur/src/routes/marketplace_cards.py` : `GET /marketplace/cards`, `GET /marketplace/cards/{id}`, `PUT /marketplace/cards/{id}` (nom/type), `PUT /marketplace/cards/{id}/assembly`.
- `serveur/src/routes/bom_files.py` + `bom_revision_queries.py` : `GET /bom/files`, `GET /bom/categories`, `POST /bom/categories`, `PATCH /bom/references/{id}/category`, `DELETE /bom/files/{rev_id}`.
- `serveur/src/routes/bom_revision_mutations.py` : `PUT /{bom_id}/revisions/{revision_id}/review` (persistance de l'édition de contenu).
- `serveur/src/models/bom.py` : `BomReference` (source de vérité unique).

**Décisions actées (discussion Eric, 2026-07-21) :**
- Source de vérité = **`BomReference`** (fiche unifiée, cf ADR 0018). Pas de nouvelle table.
- « BOM importée = carte référencée » → **une seule entrée** dans le menu.
- Édition des métadonnées **regroupée** (nom / type / catégorie au même endroit).
- Édition du **contenu** = **réutiliser la Revue BOM éditable existante** + endpoint `review`. Ne pas créer un nouvel éditeur.
- Vue « liste de cartes + clic qui ouvre la BOM » (validé par Eric).

**ADR liée :** 0018 (catalogue Cartes). Vérifier si un court addendum est nécessaire (fusion de l'onglet BOM enregistrées).

## 4. Plan d'implémentation

1. **Cartographier** finement (executor) : `CardCatalogPage`, `BomFilesPage`, `BomReviewTab`/`BomViewerPage`, et confirmer **comment charger une révision déjà enregistrée dans la Revue BOM éditable** (est-ce déjà possible ? sinon, câbler le chargement d'une révision sauvegardée + save via `PUT …/review`).
2. Dans « Cartes » : ajouter le **détail par carte** avec la liste des révisions + catégories (logique reprise de `BomFilesPage` : `GET /bom/files`, catégories, `PATCH …/category`, `DELETE /bom/files/{rev_id}`).
3. Regrouper l'**édition métadonnées** : ajouter le champ **catégorie** au `CardEditDialog` (branché sur `PATCH /bom/references/{id}/category`), à côté de nom/type.
4. Câbler « **Ouvrir la BOM** » d'une carte → Revue BOM éditable sur la révision choisie → enregistrement → **vérifier la persistance** au rechargement.
5. **Retirer** « BOM enregistrées » du tableau `pages` (`App.jsx`) et du menu (`AppShell.jsx`) ; ajouter `<Route path="/fichier-bom" element={<Navigate to="/cartes" replace />}/>` ; corriger les libellés/renvois pointant vers l'ancien onglet.
6. **Tests** (§5) + déploiement staging + parcours de validation.

> ⚠ `CardCatalogPage.jsx` fait déjà 259 lignes ; si l'ajout du détail la fait dépasser ~300, **découper** en sous-composants (cf CLAUDE.md : composants React > 300 lignes à découper).

## 5. Tests

**Automatiques (obligatoires avant push) :**
- `.venv\Scripts\pytest serveur\src\tests\ -v` — cibler `marketplace_cards`, `bom_files`, `bom_revision_mutations`.
- `cd client\src\frontend ; npm test` — adapter/fusionner les tests de `CardCatalogPage` et `BomFilesPage` (les tests existants de `BomFilesPage` ne doivent pas rester orphelins).
- Nouveaux cas : éditer la **catégorie** via le dialog carte ; ouvrir une révision sauvegardée, modifier une ligne, enregistrer, recharger et vérifier la persistance.

**Staging (:8001) :**
- [ ] Menu : plus de « BOM enregistrées », « Cartes » unique.
- [ ] Liste → clic carte → détail (révisions + catégorie) OK.
- [ ] Éditer nom + type + catégorie → persistant après reload.
- [ ] Ouvrir la BOM d'une carte → modifier une ligne → enregistrer → reload → modif présente.
- [ ] `/fichier-bom` redirige bien vers `/cartes`.

## 6. Définition de « terminé »

- [ ] Tous les critères d'acceptation §2 remplis
- [ ] `pytest` + `npm test` verts en local
- [ ] Déployé sur staging, scénarios §5 vérifiés
- [ ] CI GitHub verte sur la branche
- [ ] PR ouverte vers `dev` (CI verte avant merge ; prod = PR `dev → main` ultérieure)
- [ ] `RESULTAT.md` rédigé

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** · imports relatifs dans le package.
- Timestamps : `from ..database import utcnow`.
- Ne jamais commiter de parasites (`*.db`, `*.bak*`, `exports/`, `fix_*.py`…).
- Composant React > 300 lignes → découper (attention à `CardCatalogPage`).
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte.
- Navigateur de test : **Google Chrome uniquement**.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 001-feat-cartes-unifie-editable.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
