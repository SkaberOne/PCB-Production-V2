# [019] feat(ui): révisions cartes regroupées par REV + menu déroulant (TOP/BOT dedans)

| Champ | Valeur |
|---|---|
| **ID** | 019 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/revisions-groupees-deroulant` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : oui (composant isolé) |
| **Source** | Retour Eric (usage import catalogue 011) · **Créé le** 2026-07-23 |

## 1. Objectif (le POURQUOI)
Dans la fiche carte (détail d'une référence), la liste des révisions affiche aujourd'hui **une ligne par face** : `A BOT`, `A TOP`, `B BOT`, `B TOP`, … Sur une carte à plusieurs révisions c'est long et peu lisible. Eric veut **une ligne par révision** (« REV A », « REV B », …) et un **menu déroulant** au clic qui révèle les faces (TOP/BOT) avec leur statut/date/actions.

## 2. Spécification (le QUOI)
Composant concerné : **`client/src/frontend/src/components/library/BomLibraryDetail.jsx`** (table des révisions, ~ligne 165, le `flatMap` actuel `(referenceNode.revisions).flatMap(revGroup => revGroup.items.map(item => <TableRow/>))`).

- **Ligne repliée = une par révision** (`revGroup`) : afficher **« Rev. A »** (dérivé de `revGroup.revision`), un **résumé des faces présentes** (ex. chips `TOP` + `BOT`, ou « TOP · BOT » ; masquer une face absente), la **date d'import la plus récente** du groupe, et un **chevron** d'expansion. Pas d'action « Ouvrir/Supprimer » sur la ligne repliée.
- **Au clic sur la ligne (ou le chevron)** → **`Collapse` MUI** déroulant sous la ligne, contenant le **détail par face** (les `revGroup.items`) : colonnes **Face** (chip TOP/BOT, couleurs actuelles), **Statut** (chip DRAFT/VALIDATED actuel), **Importée le** (`formatStoredBomDate(item.created_at)`), **Actions** (boutons **Ouvrir** `handleOpenRevision(item)` + **Supprimer** `onDeleteRevision(item)` — inchangés).
- **Comportement d'expansion** : chaque révision se replie/déplie indépendamment (plusieurs peuvent être ouvertes). État local (`Set` d'ids de révision ouverts). *(Défaut ajustable : accordéon une-seule-ouverte si Eric préfère.)*
- **Aucune perte de fonctionnalité** : Ouvrir + Supprimer par face restent accessibles (dans le déroulant). Tri des révisions conservé (ordre actuel).

**Critères d'acceptation :**
- [ ] Une seule ligne par **révision** (plus de doublon TOP/BOT en lignes séparées au niveau replié).
- [ ] Libellé **« Rev. X »** + indication des faces présentes + date la plus récente.
- [ ] **Clic → déroulant** listant les faces avec **Statut / Importée le / Ouvrir / Supprimer** fonctionnels.
- [ ] Repli/dépli fluide (chevron qui tourne), plusieurs révisions dépliables.
- [ ] Composant reste **< 300 lignes** (extraire un sous-composant `RevisionGroupRow` si besoin).
- [ ] Captures `docs/prompts/preuves/019/`.

**Hors périmètre :** normalisation de la valeur de révision stockée (c'est le **prompt 018**) ; ici on **affiche** `revGroup.revision` tel quel, joliment.

## 3. Architecture & décisions
- **Réutiliser** la donnée déjà groupée : `referenceNode.revisions` = liste de `revGroup` (`revGroup.revision`, `revGroup.items` = faces avec `side`, `status`, `created_at`, `bom_revision_id`, `revision`). Pas de changement backend.
- Remplacer le `flatMap` par un `map(revGroup => [<ligne résumé>, <ligne Collapse>])` (patron MUI « table expandable » : une `TableRow` cliquable + une `TableRow` contenant un `TableCell colSpan` avec `<Collapse>`).
- **Composant partagé** : `BomLibraryDetail` est aussi utilisé par la bibliothèque BOM (« Ouvrir » depuis les BOM enregistrées) — vérifier que le nouveau rendu convient **aux deux usages** (fiche carte + bibliothèque BOM) sans régression.
- Icônes : chevron `KeyboardArrowDown/Up` (rotation), garder les chips/couleurs existants (TOP ambre / BOT bleu / VALIDATED vert).

## 4. Plan
1. Cartographier `BomLibraryDetail.jsx` (rendu révisions) + ses usages (CardCatalogPage/CardDetailDialog + bibliothèque BOM).
2. Extraire `RevisionGroupRow` (ligne résumé + Collapse détail par face) avec état d'ouverture.
3. Remplacer le `flatMap` par le rendu groupé.
4. Tests + staging + captures.

## 5. Tests
- `npm test` : une ligne par révision ; clic déplie et montre les faces ; boutons Ouvrir/Supprimer présents dans le déroulant ; pas de régression sur l'usage bibliothèque BOM.
- **Staging (:8001)** : ouvrir une carte à plusieurs révisions (ex. celle de la capture, Rev A→G) → lignes REV A..G, dépli montrant TOP/BOT. Captures `docs/prompts/preuves/019/`.

## 6. DoD
Critères §2 · `npm test` vert · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Composant React **< 300 lignes** (découper) · pas de front sans preuve visuelle · réutiliser la donnée existante (aucun changement backend) · ne pas casser l'usage bibliothèque BOM. Branche courte depuis `dev`, PR vers `dev`, Chrome uniquement.

## 8. RÉSULTAT — à remplir par l'orchestrateur
