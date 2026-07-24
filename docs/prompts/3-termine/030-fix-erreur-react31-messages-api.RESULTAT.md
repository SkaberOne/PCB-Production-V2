# RÉSULTAT — [030] fix(ui) : erreur React #31 — router les erreurs API par extractApiError

- **Statut** : ✅ terminé
- **Branche** : `fix/erreur-react31-messages-api` (depuis `dev` à jour)
- **PR** : [#107](https://github.com/SkaberOne/PCB-Production-V2/pull/107) vers `dev` — CI verte (backend + frontend + e2e), mergée `--no-ff`

## Problème
Un appel API en **422** renvoie `response.data.detail` sous forme de **tableau d'objets Pydantic** `{type, loc, msg}`. Plusieurs composants affichaient ce `detail` **brut** dans un `<Alert>` → **React #31** (« Objects are not valid as a React child ») → l'ErrorBoundary « Une erreur est survenue — Base de données » plantait toute la section.

## Ce qui a été fait

### Router les messages par `extractApiError`
Le helper `extractApiError(err)` (`api/client.js`) gère déjà tous les cas (chaîne, **tableau 422 → `msg` joints**, annulation → `null`, serveur injoignable, repli `error.message`). Toutes les constructions de message d'erreur (`error.response?.data?.detail || …`) des **9 composants** ont été remplacées par `extractApiError(error) || 'repli'` :
`ComposantsPanel` (5), `EmpreintesPanel` (2), `MpnEnrichmentPanel` (4), `ReglesTypePanel` (11), `CardDetailDialog` (1), `ProduceCheckPanel` (7), `StockInventoryTab` (2), `StockPanel` (2), `StockReceptionTab` (2) — **36 sites**. Import `{ extractApiError }` ajouté là où il manquait.

Le remplacement ne cible **que** les chaînes de message (celles suivies d'un `|| repli`) : l'**affectation** `const detail = error.response?.data?.detail;` du cas **409 `version_conflict`** de `ComposantsPanel` (qui lit `detail.code`/`detail.current`) est **conservée intacte** ; seul son message générique de repli passe par `extractApiError`.

### Défense en profondeur — `ErrorBoundary`
Nouveau helper `toDisplayMessage(value)` (exporté) : convertit **toujours** en chaîne (Error → `.message`, objet/tableau → `JSON.stringify`, `null` → repli). L'ErrorBoundary l'utilise pour son message → un enfant non-chaîne ne peut plus lever #31.

## Tests (`npm test`)
- `api/__tests__/extractApiError.test.js` (6) — 422 tableau → **chaîne** « msg joints » (jamais un objet), chaîne, statut sans detail, injoignable, annulation → `null`, repli `message`.
- `components/common/__tests__/ErrorBoundary.test.jsx` (5) — `toDisplayMessage` (chaîne/null/objet/tableau/Error) ; l'ErrorBoundary capture un enfant qui lève et affiche un message **chaîne** sans crash.
- `components/library/__tests__/ComposantsPanel.react31.test.jsx` (1) — un **422 tableau** au chargement affiche les `msg` joints (chaîne) **sans** lever #31.
- **Suite frontend : 229 passed / 59 suites.** Backend non touché.

## Preuve — staging (:8001), Base de données → Composants
`docs/prompts/preuves/030/` :
- `030-01-composants-charge-ok.jpg` — onglet Composants chargé normalement (1025 composants).
- `030-02-422-message-propre-sans-crash.jpg` — un **vrai 422 Pydantic** (tableau ; forcé via `limit=-5` sur la requête `/bom/components`) s'affiche en **message texte propre** « Input should be greater than or equal to 1 », **sans** React #31, **sans** ErrorBoundary, panneau **fonctionnel**.
- `030-00-notes.md` — méthode de reproduction.

## Décision / périmètre
- Réutilisation de `extractApiError` (zéro logique dupliquée) ; message affiché **toujours** une chaîne.
- Cas **409 version_conflict** conservé. ErrorBoundary durci (filet de sécurité pour tout site non couvert).
- Hors périmètre : codes d'erreur backend, i18n des messages Pydantic.
