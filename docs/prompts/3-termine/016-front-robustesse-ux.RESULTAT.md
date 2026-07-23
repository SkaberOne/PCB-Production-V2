# RÉSULTAT — [016] fix(front) : robustesse & UX

- **Statut** : ✅ terminé
- **Branche** : `fix/front-robustesse-ux` (depuis `dev` à jour, 013·014·015 inclus)
- **PR** : [#94](https://github.com/SkaberOne/PCB-Production-V2/pull/94) vers `dev`

## Ce qui a été fait (7 points)

1. **Confirmations avant suppression** (`ConfirmDialog` réutilisé) : Supprimer le client (« … et ses N commande(s) ? Cette action est irréversible. »), Supprimer une commande client, Supprimer un modèle machine.
2. **Erreurs visibles** : l'`<Alert>` en tête de page (rendue sous les modals) → **`<Snackbar>`** (zIndex 1400 > Dialog 1300), visible au-dessus des dialogs. + **Snackbar de succès** (création/suppression client, enregistrement/suppression machine).
3. **`loadShared`** : `catch { /* ignore */ }` → `setError(...)` (plus d'Autocomplete vide silencieux).
4. **`PageHeader`** accepte **`subtitle` comme alias de `description`** → corrige `ClientOrdersPage` et `BoardStockPage`.
5. **CostingPage** : garde-fou `if (!params || !inputs) return;` dans `apply()` + bouton « Appliquer » `disabled` sans params.
6. **Prix carte** : panneaux de configuration en pleine largeur sous `lg`, cartes KPI 2/ligne sous `md` → plus de débordement horizontal à largeur standard.
7. **`/command`** : empty-state déjà présent (`EmptyState` + navigation, titre cohérent) — aucun changement.

## Tests

- **npm** : `PageHeader.test.jsx` (alias `subtitle`) + `ConfirmDialog.test.jsx`. **Suite : 47 suites / 170 tests passed**.

## Preuves — `docs/prompts/preuves/016/`

- `016-confirmation-suppression.jpg` — `ConfirmDialog` de suppression client **au-dessus** du modal (item 1 ; z-index item 2) + sous-titre rendu (item 4).
- `016-prix-carte.jpg` — Prix carte, contrôles + KPI visibles.
- `verifications.txt` — détail items 2/6/7.

## Réserve

- L'item 6 n'a été reproduit qu'à ~1180 px ; le correctif responsive supprime la cause (2 colonnes trop larges). Capture livrée à largeur standard (rendu complet).
