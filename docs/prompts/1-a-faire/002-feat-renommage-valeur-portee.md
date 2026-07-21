# [002] feat(revue-bom): renommage de valeur avec choix de portée (ce composant / tous)

| Champ | Valeur |
|---|---|
| **ID** | 002 |
| **Type** | feat |
| **Branche cible (PR)** | `dev` (branche d'intégration, déployée sur staging :8001) |
| **Branche de travail** | `feat/renommage-valeur-portee` (créée depuis `dev` à jour) |
| **Priorité** | normale |
| **Créé le** | 2026-07-21 |
| **Dépend de** | aucune |
| **Peut tourner en parallèle** | **non** — touche `BomViewerPage.jsx` / `BomReviewTab.jsx`, fichiers communs avec le prompt 001 |

---

## 1. Objectif (le POURQUOI)

En Revue BOM, quand on renomme la valeur harmonisée d'un composant, on veut souvent **appliquer le même changement à tous les composants de la même valeur** — par exemple décider que tous les `10µF` deviennent des `10µF/35V`, ou que des `10k` deviennent des `11k`. Aujourd'hui l'édition ne porte que sur **une** ligne. On veut, au moment du renommage, **choisir la portée** : ce composant uniquement, ou tous les composants de cette valeur. C'est une édition **manuelle en temps réel** sur la production en cours — **pas** une table d'équivalences ni une règle harmony persistante.

**Important :** le changement de valeur doit aussi **se répercuter sur les commandes** de composants. Si la valeur change, le **composant à commander change** — donc son **MPN** / référence fournisseur, son offre, etc. La commande générée doit refléter la nouvelle valeur, pas l'ancienne.

## 2. Spécification (le QUOI)

Dans la colonne **« valeur harmonisée »** de la Revue BOM, quand on modifie une valeur et qu'on **valide** (blur / Entrée) :
- Si **d'autres lignes** partagent la **même ancienne valeur harmonisée**, afficher un choix : **« Appliquer à ce composant uniquement »** / **« Appliquer à tous les composants de valeur X »** (afficher le nombre N concerné).
- Si **aucune** autre ligne ne partage cette valeur → appliquer directement, **sans** dialog.
- « Tous » → toutes les lignes dont `value_harmonized` == ancienne valeur prennent la nouvelle valeur, **en temps réel** dans la session BOM.
- Le changement est **persisté à l'enregistrement** de la revue (comportement actuel, endpoint existant).
- Générique à tout composant (R, C, L…). Exemples : `10µF → 10µF/35V` (tous), `10k → 11k`.

**Critères d'acceptation :**
- [ ] Éditer une valeur **partagée** par plusieurs lignes → un dialog de portée s'ouvre (ce composant / tous, avec le nombre N).
- [ ] Choix « **Tous** » → toutes les lignes de cette (ancienne) valeur passent à la nouvelle, immédiatement.
- [ ] Choix « **Ce composant** » → seule la ligne éditée change.
- [ ] Valeur **non partagée** → pas de dialog, application directe.
- [ ] Après **enregistrement + rechargement**, les changements sont bien persistés.
- [ ] Le changement de valeur **se répercute sur la commande de composants** : la ligne de commande correspondante reflète la **nouvelle valeur** et le **MPN** / fournisseur associé (plus l'ancien MPN).
- [ ] Aucune régression sur l'édition inline existante (footprint, type, DNP, notes, quantité).

**Hors périmètre :** table d'équivalences ; règles harmony persistantes ; toute normalisation automatique supplémentaire des valeurs (le besoin est l'édition **manuelle** avec portée).

## 3. Architecture & décisions

**Frontend :**

| Zone | Fichier | Action |
|---|---|---|
| Cellule « valeur harmonisée » + dialog | `client/src/frontend/src/components/bom/BomReviewTab.jsx` (déjà ~706 l.) | détecter la validation d'un changement de valeur, compter les frères de même valeur, ouvrir le dialog de portée |
| Handler de mise à jour d'item | `client/src/frontend/src/pages/BomViewerPage.jsx` et/ou `context/BomSessionContext.jsx` | ajouter une variante « appliquer newValue à toutes les lignes dont `value_harmonized === oldValue` » |

- L'édition d'une valeur passe aujourd'hui par `onValueChange(item.id, e.target.value)` (TextField inline, ~ligne 145 de `BomReviewTab.jsx`). Le déclenchement du dialog doit se faire **à la validation** (onBlur / Entrée) et seulement si la valeur a **réellement changé**.
- **Réutiliser** le mécanisme de sélection/action en masse déjà présent (`handleBulkTypeConfirm`, cases à cocher, `handleSelectItem`) plutôt que réinventer une logique de bulk update.
- Comparer sur l'**ancienne** `value_harmonized` pour trouver les lignes concernées.

**Backend (persistance revue) :** aucun nouvel endpoint pour l'édition ; la persistance passe par l'enregistrement de revue existant (`serveur/src/routes/bom_revision_mutations.py` : `PUT /{bom_id}/revisions/{revision_id}/review`), comme l'édition inline actuelle.

**Propagation aux commandes (à vérifier / assurer) :** la génération de commande agrège les BOM et associe chaque composant à un **MPN** / offre fournisseur. Après un changement de valeur, la commande doit repartir de la **nouvelle** valeur (nouveau composant → nouveau MPN), pas de l'ancienne. Cartographier `client/src/frontend/src/pages/CommandPage.jsx` + `serveur/src/routes/marketplace_command_core.py`, `marketplace_command_plans.py`, `marketplace_supplier_offers.py` pour confirmer que le mapping *valeur → composant → MPN* se recalcule bien après édition (sinon l'ajuster). **Ne pas laisser une ligne de commande sur l'ancien MPN.**

**Décisions actées (Eric, 2026-07-21) :**
- Portée **demandée à chaque** renommage d'une valeur partagée (ce composant / tous).
- **Pas** de table d'équivalences ni de règle persistante ; effet **temps réel** sur la prod en cours.
- Regroupement basé sur la **valeur harmonisée** (le fait de mettre la même valeur suffit à « rassembler » les composants pour les feeders).

## 4. Plan d'implémentation

1. Localiser le handler `onValueChange` (dans `BomViewerPage.jsx` / `BomSessionContext.jsx`) et le mécanisme de mise à jour des items de la session.
2. Ajouter un handler **bulk** : « appliquer `newValue` à tous les items dont `value_harmonized === oldValue` ».
3. Dans la cellule valeur de `BomReviewTab.jsx` : à la validation (onBlur/Entrée) avec changement effectif, compter les frères de même ancienne valeur ; si > 0 → ouvrir un **dialog de portée** ; sinon appliquer directement.
4. Dialog : deux actions — « Ce composant uniquement » / « Tous les composants de valeur X (N) » — + annuler (revient à l'ancienne valeur).
5. Vérifier la persistance via l'enregistrement de revue.
6. **Propagation commande** : vérifier que la Commande composants, après changement de valeur, repart de la **nouvelle** valeur et associe le bon **MPN**/fournisseur (recalcul du mapping) ; ajuster si la commande reste sur l'ancien MPN. Puis ajouter les tests.

> ⚠ `BomReviewTab.jsx` fait déjà ~706 lignes : extraire la nouvelle logique dans un **hook** ou un **sous-composant** (dialog) plutôt que gonfler le fichier (CLAUDE.md : composants > 300 lignes à découper).

## 5. Tests

**Automatiques (obligatoires avant push) :**
- `cd client\src\frontend ; npm test` — nouveaux cas : (a) éditer une valeur partagée ouvre le dialog ; (b) « tous » met à jour N lignes ; (c) « ce composant » n'en change qu'une ; (d) valeur non partagée = pas de dialog ; (e) annuler restaure l'ancienne valeur.
- `.venv\Scripts\pytest serveur\src\tests\ -v` — si une partie de la logique passe côté backend (review), couvrir ; sinon vérifier l'absence de régression sur `bom_revision_mutations`.

**Staging (:8001) :**
- [ ] BOM avec plusieurs `10µF` → renommer un `10µF` en `10µF/35V` → « tous » → tous les `10µF` changent.
- [ ] Renommer un `10k` en `11k` → « ce composant » → une seule ligne change.
- [ ] Enregistrer, recharger → changements persistés.
- [ ] Après un changement de valeur, ouvrir **Commande composants** → la ligne reflète la **nouvelle** valeur et le **MPN**/fournisseur correspondant (plus l'ancien).

## 6. Définition de « terminé »

- [ ] Tous les critères d'acceptation §2 remplis
- [ ] `pytest` + `npm test` verts en local
- [ ] Déployé sur staging, scénarios §5 vérifiés
- [ ] CI GitHub verte sur la branche
- [ ] PR ouverte vers `dev` (CI verte avant merge ; prod = PR `dev → main` ultérieure)
- [ ] `RESULTAT.md` rédigé

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** · imports relatifs.
- Timestamps : `from ..database import utcnow`.
- Ne jamais commiter de parasites (`*.db`, `*.bak*`, `exports/`, `fix_*.py`…).
- Composant React > 300 lignes → découper (extraire hook/dialog, ne pas gonfler `BomReviewTab`).
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte.
- Navigateur de test : **Google Chrome uniquement**.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 002-feat-renommage-valeur-portee.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
