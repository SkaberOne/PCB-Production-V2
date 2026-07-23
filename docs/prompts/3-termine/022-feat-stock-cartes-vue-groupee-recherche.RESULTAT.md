# RÉSULTAT — [022] feat(stock-cartes) : vue groupée par carte (révisions dépliables) + recherche

- **Statut** : ✅ terminé
- **Branche** : `feat/stock-cartes-vue-groupee` (depuis `dev` à jour)
- **PR** : [#99](https://github.com/SkaberOne/PCB-Production-V2/pull/99) vers `dev` — CI verte (backend + frontend + e2e), mergée `--no-ff` (`f5a0c68`)

## Ce qui a été fait

### Front
- **`pages/BoardStockPage.jsx`** (217 lignes, < 300) : passe d'**une ligne par (carte × révision)** à **une ligne par carte**.
  - Agrégation **côté client** par `bom_reference_id` : **stock total** (somme des révisions), **valeur stock** totale, **nombre de révisions**, et **barre SUIVI agrégée** (`ProductionSuiviBar` : testées / validées / à débugger sommés).
  - **Tri** : cartes avec `en stock > 0` **en tête**, puis par référence.
  - **Barre de recherche** réf + nom (insensible casse/accents, `utils/textSearch` du 020) ; le regroupement s'applique au **résultat filtré** ; chip « N carte(s) ».
- **`components/stock/CardStockRow.jsx`** (extrait, patron dépliable du 019) : ligne résumé (chevron) + `Collapse` avec le **détail par révision** (Révision / En stock / Min / Prix/carte / Valeur / Testées / Validées / À débugger / Suivi). **Clic sur une révision → éditeur** (dialogue existant, `stopPropagation` pour ne pas replier). Aucune perte d'info.

### Backend (léger)
- Champ **`name`** ajouté à la réponse `GET /marketplace/board-stock` (`board_stock_service.list_board_stock`) pour permettre la recherche par nom. **Aucun changement du calcul de stock**.

## Tests
- **npm** : `pages/__tests__/BoardStockPage.suivi.test.jsx` (5) — barre agrégée par carte, **regroupement** (stock total 120 = 100 + 20), **déroulant** par révision (barres `suivi-bar-<id>-<rev>`), **recherche** réf + nom (insensible accents), **édition au clic** (PUT `/marketplace/board-stock/{id}` avec la bonne révision). **Suite frontend : 193 passed / 50 suites**.
- **Suite backend : 601 passed, 1 skipped** (champ `name` sans régression).

## Preuve — `docs/prompts/preuves/022/`
- `022-01-vue-groupee-stock-en-tete.jpg` — vue groupée : une ligne par carte, **cartes avec stock triées en tête** (`AMPLI_GEN6` = **19** sur **3 rév.**, `BISTABLE BOARD` = 1, `Carrier Board D3000` = 2), chip « 87 carte(s) », recherche en tête.
- `022-02-deroulant-revisions-agregats.jpg` — carte **dépliée** (détail par révision : Rev. C / Sans révision) + agrégats (valeur totale **7 008,42 €**, 0 sous le minimum) et barre SUIVI agrégée.
- `022-03-recherche-ref-nom.jpg` — recherche « carrier » → **13 cartes** filtrées par **référence** (Carrier Board D3000…) **et par nom** (KT180241 « Carrier Board XAAR 5601 - 117FC »…), insensible à la casse.

## Décision / périmètre
- Défaut : repli par défaut avec le **total visible** ; cartes en stock en tête (ajustable).
- Hors périmètre : normalisation des libellés de révision (018, ici on affiche/agrège) ; calcul de stock backend inchangé.
