# [016] fix(front): robustesse & UX (confirmations, erreurs visibles, props, responsive)

| Champ | Valeur |
|---|---|
| **ID** | 016 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/front-robustesse-ux` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : oui (front) |
| **Source** | Audit 2026-07-22 (front + usage) · **Créé le** 2026-07-22 |

## 1. Objectif
Fiabiliser les actions front à risque (suppressions, erreurs invisibles) et corriger des défauts d'UX confirmés.

## 2. Spécification

1. **Suppressions sans confirmation** — `client/src/frontend/src/pages/ClientOrdersPage.jsx` : « Supprimer le client » (l.357, `removeClient` l.215 — supprime le client **et son historique**), « Supprimer » commande (l.282), et modèle machine dans `MachineEditDialog` (bouton l.592, `remove` l.548). → Intercaler `components/common/ConfirmDialog.jsx` (déjà présent) avec un message rappelant la portée (« Supprimer le client X et ses N commandes ? »).
2. **Erreurs invisibles derrière le backdrop** — `ClientOrdersPage.jsx:83` : l'`<Alert>` d'erreur est rendue en tête de page, mais les échecs viennent de `Dialog` modaux → l'alerte s'affiche **sous** le backdrop. → Afficher l'erreur **dans le DialogContent** concerné, ou via un `Snackbar` global (zIndex > modal). Ajouter un **feedback de succès** (Snackbar) après create/delete.
3. **`loadShared` avale les erreurs** — `ClientOrdersPage.jsx:72` : catch `{/* ignore */}` → Autocomplete cartes/machines vides sans message. → `setError(e?.response?.data?.detail || 'Chargement des références/machines impossible.')`.
4. **Prop `subtitle` ignorée** — `ClientOrdersPage.jsx:81` et `BoardStockPage.jsx:112` passent `subtitle=`, mais `PageHeader` ne gère que `description`. → Remplacer par `description=` (ou ajouter un alias `subtitle`→`description` dans PageHeader). Grep `subtitle=` pour les autres cas.
5. **CostingPage bouton actif avec params=null** — `CostingPage.jsx:114` : ajouter `if (!params || !inputs) return;` en tête de `apply()` et `!params` à la condition `disabled` du bouton.
6. **Prix carte — débordement horizontal** (usage) : la rangée de cartes de résultat + le bouton « Appliquer » débordent (coupés à largeur standard). → Rendre la rangée KPI `flexWrap`/scrollable et ancrer l'action « Appliquer » visible.
7. **`/command` état vide** (usage) : en accès direct la page est blanche. → Afficher un empty-state (« Sélectionne/charge une production pour préparer la commande ») ; corriger le titre incohérent.

## 3. Tests
- `npm test` : ConfirmDialog déclenché avant delete ; erreur affichée dans la dialog ; PageHeader rend le sous-titre ; bouton Appliquer désactivé sans params.
- Staging : parcours suppression (confirmation), échec d'action (message visible), Prix carte à largeur standard (pas de débordement), /command (empty-state). Captures `docs/prompts/preuves/016/`.

## 4. DoD
Critères §2 · `npm test` vert · staging + captures · CI verte · PR vers `dev` · RESULTAT.md.

## 5. Contraintes
Composant React < 300 lignes · pas de front livré sans preuve visuelle. Branche courte depuis `dev`, PR vers `dev`, Chrome uniquement.

## 6. RÉSULTAT — à remplir par l'orchestrateur
