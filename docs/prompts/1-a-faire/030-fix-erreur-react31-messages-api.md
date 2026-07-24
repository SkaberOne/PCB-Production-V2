# [030] fix(ui): erreur React #31 — router toutes les erreurs API par extractApiError (jamais un objet rendu)

| Champ | Valeur |
|---|---|
| **ID** | 030 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/erreur-react31-messages-api` |
| **Priorité** | haute · **Dépend de** aucune · **Parallèle** : oui |
| **Source** | Bug rencontré par Eric (écran Base de données) · **Créé le** 2026-07-24 |

## 1. Objectif (le POURQUOI)
Sur **Base de données** (et potentiellement ailleurs), un appel API qui échoue en **422** renvoie `response.data.detail` sous forme de **tableau d'objets Pydantic** `{type, loc, msg}`. Plusieurs composants affichent ce `detail` **brut** dans un message/`<Alert>`, ce qui provoque l'erreur **React #31** (« Objects are not valid as a React child ») et fait planter tout le panneau (ErrorBoundary « Une erreur est survenue — Base de données »).

Le helper **`extractApiError(err)`** (`client/src/frontend/src/api/client.js`) **gère déjà** tous les cas (chaîne, **tableau 422** → `d.msg` joints, annulation, serveur injoignable, fallback `error.message`). Il suffit de l'**utiliser partout** au lieu du `error.response?.data?.detail || …` brut.

## 2. Spécification (le QUOI)
Remplacer, dans **tous** les composants qui construisent un message d'erreur à partir de `error.response?.data?.detail` (ou équivalent) **sans** passer par le helper, par un appel à **`extractApiError(error)`**. Composants identifiés (au moins) :
- `components/library/ComposantsPanel.jsx`
- `components/library/EmpreintesPanel.jsx`
- `components/library/MpnEnrichmentPanel.jsx`
- `components/library/ReglesTypePanel.jsx`
- `components/library/CardDetailDialog.jsx`
- `components/**/ProduceCheckPanel.jsx`
- `components/**/StockInventoryTab.jsx`
- `components/**/StockPanel.jsx`
- `components/**/StockReceptionTab.jsx`
- (+ tout autre site trouvé par recherche du motif — voir §3)

Règles :
- Le message affiché doit **toujours** être une **chaîne** (jamais un objet/tableau).
- **Conserver** les traitements spéciaux existants là où ils sont utiles (ex. `ComposantsPanel` gère un **409 `version_conflict`** avec `detail.code`/`detail.current` : garder ce cas, et n'utiliser `extractApiError` que pour le message générique de repli).
- Ne pas régresser les messages déjà corrects (succès, validations locales).

**Défense en profondeur (ErrorBoundary)** : durcir l'ErrorBoundary (ou le rendu du message d'erreur) pour qu'un enfant **non-chaîne** ne fasse **jamais** planter le rendu — p.ex. convertir en chaîne (`String`/`JSON.stringify`) en dernier recours au lieu de lever #31. Objectif : plus aucun objet ne peut « white-screen » une section entière.

**Critères d'acceptation :**
- [ ] Un appel qui renvoie un **422** (detail = tableau) affiche un **message lisible** (msg joints), **sans** crash ni ErrorBoundary.
- [ ] Reproduction du cas Base de données → onglet **Composants** (déclencher un 422, ex. payload invalide) : message propre, pas d'erreur #31.
- [ ] Tous les sites listés passent par `extractApiError` (plus de `data.detail` brut rendu).
- [ ] Le cas **409 version_conflict** de `ComposantsPanel` fonctionne toujours (rechargement des valeurs).
- [ ] ErrorBoundary ne peut plus lever #31 sur un message non-chaîne (fallback string).
- [ ] Captures `docs/prompts/preuves/030/` (avant si reproductible / après : message propre).

**Hors périmètre :** revoir les codes d'erreur backend ; i18n des messages Pydantic.

## 3. Architecture & décisions
- **Recherche exhaustive** du motif à corriger (pour ne rien oublier) :
  `error.response?.data?.detail`, `response.data.detail`, `data?.detail ||` dans `client/src/frontend/src/**`. Chaque site qui met ce résultat dans un message affiché → `extractApiError(error)`.
- **Réutiliser** `extractApiError` (déjà robuste, teste `Array.isArray(detail)`). Ne pas dupliquer la logique.
- **ErrorBoundary** : composant `components/common/ErrorBoundary` (ou équivalent) — garantir un rendu chaîne du message.
- Aucun changement backend attendu.

## 4. Tests
- `npm test` : un util/test vérifie qu'un message d'erreur issu d'un 422 (mock `{response:{data:{detail:[{loc,msg,type}]}}}`) rend une **chaîne** via `extractApiError` ; un composant représentatif (ex. `ComposantsPanel`) affiche un message texte sur 422 sans lever ; le cas 409 `version_conflict` reste géré.
- Vérif manuelle **staging (:8001)** : provoquer un 422 sur Composants → message propre, pas d'ErrorBoundary. Captures `docs/prompts/preuves/030/`.

## 5. DoD
Critères §2 · `npm test` verts · migration N/A · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 6. Contraintes
Réutiliser `extractApiError` (pas de logique dupliquée) · message affiché toujours une chaîne · conserver les cas spéciaux existants (409 version_conflict) · pas de front sans preuve. Branche courte depuis `dev`, PR vers `dev`, CI verte.

## 7. RÉSULTAT — à remplir par l'orchestrateur
