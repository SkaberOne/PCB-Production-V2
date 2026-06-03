# Audit Design & Accessibilité — PCB Flow V2

**Date :** 2026-06-03
**Périmètre :** 7 pages + 5 familles de dialogs + ~25 composants UI
**Méthode :** audit du code source (React + MUI v5) + rendu live dans Chrome + frameworks plugin `design` (design-critique, WCAG 2.1 AA)
**Standard a11y :** WCAG 2.1 niveau AA
**Objectif :** nettoyer les incohérences, améliorer l'UX/a11y, préparer une refonte propre **en conservant la palette émeraude sur fond zinc**.

---

## 1. Résumé exécutif

L'application a une **bonne base visuelle** : thème dark cohérent dans l'intention, accent émeraude `#10b981` lisible (6.98:1), titres bien hiérarchisés typographiquement, états de chargement (skeletons) soignés. Le `theme.js` définit déjà des tokens corrects.

Le problème n'est **pas** la palette — c'est sa **mise en œuvre** : les couleurs sont massivement codées en dur dans les composants au lieu de passer par le thème, ce qui a fait dériver l'app vers **3 à 4 nuances de surface concurrentes**, **2 familles de gris** (zinc vs slate), un **accent indigo parasite**, et surtout **des panneaux d'import en thème clair** au milieu d'une app dark. À cela s'ajoutent des manques d'accessibilité systémiques (champs sans label, éléments cliquables non accessibles au clavier).

### Comptage par sévérité

| Sévérité | Nombre | Nature dominante |
|---|---|---|
| 🔴 Critique | 9 | Panneaux clairs sur app dark, bugs de tokens (`undefined`), code mort, actions destructives sans confirmation |
| 🟡 Majeur | ~28 | Couleurs en dur, surfaces incohérentes, champs sans label, cartes/lignes cliquables non accessibles au clavier |
| 🟢 Mineur | ~40 | Accents FR manquants, `fontWeight` redondants, micro-incohérences de boutons/icônes |

### Verdict

Une refonte **n'est pas nécessaire pour repartir de zéro** : l'ossature et la direction visuelle sont saines. Le bon mouvement est une **refonte « par consolidation »** — centraliser les tokens, corriger les ~9 points critiques, puis uniformiser composant par composant. La palette reste intacte (cf §2).

---

## 2. Design tokens à CONSERVER (la palette validée)

Voici la palette extraite de `theme.js`, à garder comme socle de la refonte. C'est la **source de vérité** vers laquelle tout le code en dur doit converger.

### Couleurs de marque (accent)

| Token | Hex | Usage |
|---|---|---|
| `primary.main` | `#059669` | Boutons pleins, sélection active |
| `primary.light` | `#10b981` | Accent, indicateurs, hover |
| `primary.dark` | `#047857` | Hover des boutons pleins |

### Surfaces (à unifier sur ces 3 valeurs)

| Token | Hex | Rôle | Contraste texte primaire |
|---|---|---|---|
| `background.default` | `#09090b` | Fond de page, sidebar | 16:1+ ✅ |
| `background.paper` | `#18181b` | Cartes, dialogs, menus | 16.12:1 ✅ |
| `surfaceElevated` | `#27272a` | Chips, en-têtes de table, survol | ✅ |
| `divider` / `border` | `#27272a` | Bordures | — |
| `borderHover` | `#3f3f46` | Bordure au survol | — |

### Texte

| Token | Hex | Contraste sur `#18181b` | Verdict AA |
|---|---|---|---|
| `text.primary` | `#f4f4f5` | 16.12:1 | ✅ |
| `text.secondary` | `#a1a1aa` | 6.91:1 | ✅ |
| ⚠️ tertiaire ad hoc | `#71717a` | 3.67:1 | ❌ corps de texte |
| ⚠️ `textDisabled` | `#52525b` | 2.29:1 | ❌ même en grand |

### Sémantique

| Rôle | Token theme | Hex | Remarque |
|---|---|---|---|
| Succès | `success.main` | `#10b981` | OK |
| Avertissement | `warning.main` | `#f59e0b` | OK |
| Erreur | `error.main` | `#ef4444` | ⚠️ remplacé en dur par `#dc2626` dans MachinePnP |
| Info/bleu | `colors.blue` | `#3b82f6` | ⚠️ remplacé en dur par `#2563eb` / `#38bdf8` ailleurs |

### Typographie & forme

Police **Inter** (fallback Segoe UI). Titres `h1→h6` en poids 700, `letter-spacing` négatif. Boutons en 600, `text-transform: none`. Rayon par défaut **12px** (cartes), **8px** (boutons). Cette échelle est **bonne et à conserver** — le problème est qu'elle est court-circuitée par des `fontSize`/`fontWeight` en dur (cf §3.4).

---

## 3. Constats transversaux (à traiter en priorité — fort effet de levier)

Ces 6 points reviennent sur presque toutes les pages. Les corriger règle ~70 % des findings individuels.

### 3.1 🔴 Panneaux d'import en thème CLAIR sur app dark

Le défaut le plus visible. Plusieurs composants du flux d'import imposent des fonds clairs et des textes gris pâle, créant des blocs blancs en plein écran sombre :

- `BomImportOverviewPanel.jsx:6-10,81-107` — tuiles `#f5f5f5` / `#e8f5e9` / `#fff3e0` / `#fce4ec` avec textes `#1976d2` / `#666`.
- `BomImportResolutionDialogs.jsx:217,303` — `TableHead` `backgroundColor:'#f5f5f5'` + texte `#666` (3.09:1, échoue AA).
- `BomImportPreviewCard.jsx:285,294,325` — idem `#f5f5f5` + `#666`.

→ **Migrer ces panneaux sur les surfaces dark du thème** (`#18181b` / `#27272a`, texte `text.secondary`). C'est le quick win à plus fort impact visuel.

### 3.2 🔴 Bugs de tokens : couleurs `undefined`

- `colors.textMuted` est utilisé ~6 fois dans `CommandPage.jsx` (l.720, 737, 743, 762, 769, 815) mais **n'existe pas** dans l'export `colors{}` → rend `color: undefined`, les libellés tombent sur une couleur héritée non voulue.
- `colors.textTertiary` utilisé dans `StatCard.jsx:74` → **n'existe pas** non plus (seul `textDisabled` existe).

→ **Ajouter ces tokens à `theme.js`** (`textTertiary: '#a1a1aa'`, supprimer/renommer `textMuted`) ou corriger les usages.

### 3.3 🟡 Surfaces incohérentes — 3 à 4 fonds pour le même rôle

Le fond de carte/dialog « devrait » être `#18181b`. On trouve en réalité : `#18181b` (majorité), **`#111827`** (slate — `ConfirmDialog`, cartes `SettingsPage`, `BomReviewTab`, `BomStockTab`), **`#111111`** (`BomStockDialog`, `BomLibraryCard`), **`#0f0f12`** (`BomLibraryDetail`), **`#1c1c1f`** (menu Dashboard).

→ Choisir **une seule** surface élevée (`#18181b`) et purger les variantes.

### 3.4 🟡 Couleurs/tailles codées en dur partout

Quasiment tous les composants (sauf `ErpContextForm` et `StockStatusChip`, qui sont les **bons modèles**) écrivent des hex en dur au lieu d'utiliser le thème. Trois façons coexistantes de référencer la bordure : `#27272a`, `var(--border)`, `colors.border`. Deux familles de gris : **zinc** (officielle) et **slate** (`#f8fafc`, `#94a3b8`, `#cbd5e1`…) dans tous les composants `machine/*`. Un **accent indigo** (`#6366f1` / `#4f46e5`) dans `BomLibraryCard` et `BomLibraryDetail`, hors palette.

→ Migration progressive vers les tokens. Cible : aucun hex hors `theme.js`.

### 3.5 🟡 Accessibilité clavier : éléments cliquables non-bouton

Pattern récurrent : `Box`/`Card`/`TableRow`/`Stack` avec `onClick` mais **sans `role`, `tabIndex`, ni gestion clavier** → inaccessibles au clavier et au lecteur d'écran (WCAG 2.1.1).

- `StatCard.jsx` (carte stat cliquable), `MachinePnpPage.jsx` (`MachineCard`)
- `BomSelectionPanel.jsx` (entrées BOM), `BomStockTable.jsx` (lignes), `MachinePnpTables.jsx` (lignes)
- `MachinePnpSlotStrip.jsx` (slots PnP), `BomFilesPage.jsx` (arbre catégories), `BomReviewTab.jsx` (en-têtes de tri)

→ Remplacer par `ButtonBase` / ajouter `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Espace) + `:focus-visible`.

### 3.6 🟡 Champs de saisie sans label accessible

Confirmé en live : tous les champs de recherche n'ont qu'un `placeholder`, jamais de label/`aria-label` (WCAG 3.3.2 / 4.1.2). Idem pour les `TextField` inline de table et plusieurs boutons-icônes sans nom.

**Preuves live (arbre d'accessibilité Chrome) :**

| Page | Élément | Nom accessible | Problème |
|---|---|---|---|
| Fichier BOM | recherche | *(aucun)* | placeholder seul |
| Commande | `button ref_20` | *(vide)* | bouton-icône sans nom |
| Import BOM | `button ref_40-43` | *(vides)* | 4 boutons-icônes sans nom |
| Paramètres | `button ref_52` | *(vide)* | bouton-icône sans nom |
| Machine PnP | 2× `button "Supprimer"` | identiques | ambigu (lequel ?) |
| Commande / Import | comboboxes | placeholder | pas de label |

→ Ajouter `label` ou `aria-label` systématiquement. `SettingsPage` le fait déjà bien — c'est le pattern à généraliser.

---

## 4. Audit page par page

### 4.1 Dashboard (`/dashboard`)

**Première impression :** claire et professionnelle. Les 4 StatCards émeraude sur fond noir fonctionnent bien, la hiérarchie « titre → grande valeur → description » est lisible. Bonne page.

| Dimension | Constat | Sévérité | Reco |
|---|---|---|---|
| A11y clavier | StatCards cliquables (`onClick`) sans rôle/tabIndex/clavier ; flèche « → » lue à voix haute | 🟡 | `ButtonBase` + `aria-hidden` sur la flèche |
| A11y label | Champ « Rechercher une production » sans label | 🟡 | `aria-label` |
| Cohérence | 4 dialogs (créer/renommer/supprimer/réactiver) inline au lieu de `ConfirmDialog` | 🟡 | migrer vers `ConfirmDialog` |
| Couleur | statuts en dur (`#10b981/#38bdf8/#f59e0b`) + menu en `#1c1c1f` (4ᵉ surface) | 🟡 | map statut→token |
| Cohérence | mini-header de la carte « Productions créées » réimplémenté (h6 `fontWeight:600` ≠ thème 700) | 🟢 | sous-header partagé |

### 4.2 Import BOM (`/import-bom`)

**Note :** page la plus lourde (rendu qui gèle la capture). C'est aussi le flux le plus dégradé visuellement.

| Dimension | Constat | Sévérité | Reco |
|---|---|---|---|
| Cohérence dark | tuiles d'aperçu + en-têtes de table en **thème clair** (`#f5f5f5`, `#666`) | 🔴 | passer en surfaces dark |
| A11y | 4 boutons-icônes de ligne sans nom (confirmé live), recherche sans label | 🟡 | `aria-label` |
| Destructif | « Supprimer de la BOM » au milieu des actions, **sans confirmation** | 🔴 | déplacer + confirmer |
| Cohérence | 3 dialogs inline au lieu de `ConfirmDialog` ; menu rename/supprimer dupliqué de Dashboard | 🟡 | factoriser |
| Code | `BomImportWorkspaceCard.jsx:343-464` : ~120 lignes de **code mort** (`no-unreachable`) | 🔴 | supprimer |
| Terminologie | « Retour Dashboard » vs « Productions » vs « Production » | 🟢 | uniformiser |

### 4.3 Fichier BOM (`/fichier-bom`)

| Dimension | Constat | Sévérité | Reco |
|---|---|---|---|
| Layout | double gouttière : `<Box p:3>` alors que `<main>` a déjà `px/py:3` | 🟡 | retirer le padding local |
| A11y | arbre catégories/références = `Stack onClick` sans rôle/clavier/`aria-expanded` | 🟡 | `role="tree"` ou boutons |
| Routing | « Aller à Import BOM » = `Button href="#/..."` (mélange SPA) | 🟡 | `component={RouterLink}` |
| Cohérence | état vide réimplémenté (≠ `EmptyState`) avec texte `#71717a` (3.67:1) | 🟡 | `EmptyState` + contraste |
| A11y | recherche + bouton « Recharger » sans `aria-label` (confirmé live) | 🟡 | `aria-label` |

### 4.4 BOM Viewer (`/bom`)

| Dimension | Constat | Sévérité | Reco |
|---|---|---|---|
| Cohérence accent | indicateur d'onglet en `secondary` **gris** alors que toute l'app utilise le **vert** comme état actif | 🟡 | `indicatorColor` vert |
| A11y table | `SortableHeaderCell` = `TableCell onClick` sans rôle/clavier/`aria-sort` | 🟡 | rôle bouton + `aria-sort` |
| A11y | `TextField`/`Checkbox` inline de table sans label | 🟡 | `aria-label` contextualisé |
| Cohérence | `DIALOG_PAPER_SX` en `#111827` (slate) ≠ surface zinc | 🟡 | token |
| UX | `scrollIntoView` via `setTimeout(150)` (fragile) | 🟢 | callback ref |

### 4.5 Commande (`/commande-composant`)

| Dimension | Constat | Sévérité | Reco |
|---|---|---|---|
| Bug token | `colors.textMuted` (undefined) sur 6 libellés clés | 🟡 | corriger token |
| Cohérence | icône recherche = **emoji `🔍`** au lieu de `SearchRoundedIcon` (partout ailleurs) | 🟡 | icône MUI |
| A11y | bouton sans nom (`ref_20` live), combobox + recherche sans label | 🟡 | `aria-label`/`label` |
| Structure | « Sélection BOM » / « Mode d'agrégation » sont des labels statiques mêlés à de vrais champs (`alignItems:flex-end`) → alignement bancal | 🟢 | séparer affichage/saisie |
| Cohérence | 2 cartes voisines déclarées différemment (`CARD_SX` vs `<Card>` nu) | 🟢 | uniformiser |

**Bon modèle ici :** `ErpContextForm.jsx` utilise les tokens `colors.*` et labellise tous ses champs. À répliquer ailleurs.

### 4.6 Machine PnP (`/machine-pnp`)

La page la plus divergente : palette **slate** au lieu de zinc, rouges/bleus hors thème, et son propre système de table.

| Dimension | Constat | Sévérité | Reco |
|---|---|---|---|
| Couleur | rouge `#dc2626` (≠ `error #ef4444`), bleu `#2563eb` (≠ `#3b82f6`) — 2ᵉ palette | 🟡 | tokens sémantiques |
| Couleur | chaque `TextField` re-style label/input/bordure en dur (énorme duplication) | 🟡 | laisser le thème |
| Couleur | famille **slate** (`#f8fafc`, `#94a3b8`, `#cbd5e1`) au lieu de zinc | 🟡 | tokens zinc |
| A11y | `MachineCard` cliquable sans clavier ; slots PnP idem | 🟡 | `ButtonBase` |
| A11y | 2 boutons « Supprimer » identiques (live) ; recherche sans label | 🟡 | noms distincts |
| Lisibilité | labels de slots à **~7px** (`0.43rem`) | 🟡 | taille mini lisible |
| Bug | `MachinePnpTables.jsx:454` utilise `compactHeaderSx` **non importé** → risque runtime | 🔴 | corriger l'import |
| Cohérence | 3ᵉ système de table (thSx/tdSx en dur) ≠ thème ≠ `compactTableSx` | 🟡 | table unifiée |

**Bons modèles ici :** `MachinePnpTables` (IconButton + Tooltip partout) et le dialog de suppression de `MachinePnpDialogs` (confirmation + Alert d'impact).

### 4.7 Paramètres (`/parametre`)

| Dimension | Constat | Sévérité | Reco |
|---|---|---|---|
| Couleur | les 2 grandes cartes de section en `#111827` (slate) ≠ reste de l'app | 🟡 | `#18181b` |
| UX | suppressions/reset via **`window.confirm()` natif** (modale système hors thème) | 🟡 | `ConfirmDialog` |
| Cohérence | bordures en `var(--border)` (CSS var) ≠ reste de l'app | 🟢 | token unique |
| UX | saisie d'un type via `datalist` ici, via `Select`/`MenuItem` ailleurs | 🟢 | une seule UX |
| Copy | accents/apostrophes manquants (« Effacer l historique », « decroissant ») | 🟢 | corriger |
| UX | 4 cartes « Ouvrir la section » avec `Button disabled` sans explication | 🟢 | mention « à venir » |

**Bon modèle ici :** les champs de recherche de Paramètres **ont** un label — le pattern à généraliser sur toutes les autres pages.

---

## 5. Audit des dialogs / petites fenêtres

| Dialog | Constats clés | Sévérité |
|---|---|---|
| `ConfirmDialog` | fond `#111827` (slate) ≠ `#18181b` → 2 fonds de dialog différents dans l'app | 🟡 |
| `BomPickerDialog` | pas d'`aria-labelledby`, recherche sans label, libellé `"REF · · "` quand champs vides | 🟢 |
| `BomStockDialog` | fond `#111111`, bouton « Fermer » en **primaire émeraude** (suggère une confirmation à tort), défaut `|| 25` qui écrase un vrai 0 | 🟡 |
| `BomImportResolutionDialogs` | en-têtes clairs `#f5f5f5` + texte `#666`, action destructive sans confirmation, 4 dialogs sans `aria-labelledby` | 🔴 |
| `MachinePnpDialogs` | palette slate, accents FR manquants (« Creer », « Categorie »), 5 dialogs sans `aria-labelledby` ; **mais** très bon dialog de suppression (confirmation + impact) | 🟡 |
| `BomReviewTab` (dialog bulk) | tri/cellules sans label, chips-filtres sans `aria-pressed`, raccourcis clavier globaux sans `aria-keyshortcuts` | 🟡 |

**Transversal dialogs :** aucun ne lie son titre via `aria-labelledby`. Le bouton « Annuler » est stylé de **3 façons** différentes (`color="inherit"` / neutre / hex en dur). Standardiser une coquille de dialog unique (titre lié, Annuler à gauche neutre, action à droite, confirmation obligatoire si destructif).

---

## 6. Contrôle de contraste (WCAG 1.4.3 — ratios réels mesurés)

| Élément | Premier plan | Fond | Ratio | Requis | Verdict |
|---|---|---|---|---|---|
| Texte primaire | `#f4f4f5` | `#18181b` | 16.12:1 | 4.5:1 | ✅ |
| Texte secondaire | `#a1a1aa` | `#18181b` | 6.91:1 | 4.5:1 | ✅ |
| Texte secondaire | `#a1a1aa` | `#09090b` | 7.76:1 | 4.5:1 | ✅ |
| Accent vert | `#10b981` | `#18181b` | 6.98:1 | 3:1 | ✅ |
| Vert primary | `#059669` | `#18181b` | 4.70:1 | 4.5:1 | ✅ |
| **Texte tertiaire** | `#71717a` | `#18181b` | 3.67:1 | 4.5:1 | ❌ corps |
| **Texte tertiaire** | `#71717a` | `#09090b` | 4.12:1 | 4.5:1 | ❌ corps |
| **Texte « disabled »** | `#52525b` | `#18181b` | 2.29:1 | 4.5:1 | ❌ |
| **`#666` (dialogs import)** | `#666666` | `#18181b` | 3.09:1 | 4.5:1 | ❌ |
| **Sous-titre logo** | `#3f3f46` | `#09090b` | 1.91:1 | 3:1 | ❌ quasi invisible |

**Conclusion contraste :** la palette de marque est saine. Seuls les **gris les plus sombres** (`#71717a`, `#52525b`, `#3f3f46`) échouent — ils sont utilisés comme texte tertiaire / états vides / sous-titres. Remède simple : ne jamais descendre sous `#a1a1aa` pour du texte porteur de sens ; réserver `#52525b`/`#3f3f46` au purement décoratif non textuel.

---

## 7. Plan de refonte priorisé

Refonte **par consolidation**, en 3 vagues. La palette ne change pas ; on la rend cohérente puis on polit.

### Vague 1 — Quick wins (1-2 j, fort impact, faible risque)

1. 🔴 **Migrer les panneaux d'import en dark** (`BomImportOverviewPanel`, `BomImportResolutionDialogs`, `BomImportPreviewCard`) — supprime le défaut visuel le plus grave.
2. 🔴 **Corriger les bugs de tokens** `colors.textMuted` / `colors.textTertiary` dans `theme.js`.
3. 🔴 **Supprimer le code mort** de `BomImportWorkspaceCard` (~120 lignes) et **corriger l'import** `compactHeaderSx` de `MachinePnpTables`.
4. 🔴 **Confirmation sur les actions destructives** : « Supprimer de la BOM » (import) et « Supprimer révision » (bibliothèque).
5. 🟡 **Relever les contrastes** : remplacer `#71717a`/`#52525b` textuels par `#a1a1aa`, éclaircir le sous-titre logo.
6. 🟡 **Labelliser les champs** de recherche et les boutons-icônes sans nom (`aria-label`) — liste précise au §3.6.

### Vague 2 — Consolidation du design system (3-5 j, structurant)

7. **Enrichir `theme.js`** avec les tokens manquants (cf §8) et **une seule surface élevée** `#18181b`.
8. **Purger les couleurs en dur** composant par composant, en commençant par les plus divergents : `machine/*` (slate→zinc), `BomLibraryCard`/`BomLibraryDetail` (indigo→émeraude), rouges/bleus de MachinePnP → tokens sémantiques.
9. **Unifier les tables** : un seul style (celui du thème `MuiTableCell` + `compactTableSx`), supprimer `thSx/tdSx` en dur.
10. **Coquille de dialog unique** : `aria-labelledby`, bouton Annuler neutre standardisé, confirmation destructive intégrée. Migrer les dialogs inline (Dashboard, Import) et les `window.confirm()` (Settings) vers `ConfirmDialog`.
11. **Accent actif cohérent** : indicateur d'onglet toujours vert (corriger BOM Viewer).

### Vague 3 — Accessibilité & polish (2-4 j)

12. **Rendre tous les éléments cliquables accessibles au clavier** (`ButtonBase`/rôle + `tabIndex` + `onKeyDown` + `:focus-visible`) : StatCard, MachineCard, lignes de table, slots PnP, arbre catégories, en-têtes de tri (cf §3.5).
13. **Hiérarchie sémantique** : un seul `h1` par page (titre de page en `component="h1"`), `aria-current` sur l'étape active du workflow.
14. **Cohérence rédactionnelle** : accents FR (MachinePnpDialogs), icône recherche unique, terminologie « Production » unifiée, libellés de filtres.
15. **États vides** : tout passer par `EmptyState` (Dashboard, BomFiles, MachinePnP réimplémentent le leur).

### Effort estimé

| Vague | Effort | Risque | Gain |
|---|---|---|---|
| 1 — Quick wins | 1-2 j | Faible | Très élevé (visuel + bugs) |
| 2 — Design system | 3-5 j | Moyen | Élevé (maintenabilité) |
| 3 — A11y & polish | 2-4 j | Faible | Moyen-élevé (conformité AA) |

---

## 8. Proposition d'enrichissement des tokens (`theme.js`)

Pour permettre la migration de la Vague 2, compléter l'export `colors{}` afin que **plus aucun composant n'ait besoin d'un hex en dur** :

```js
export const colors = {
  // --- Marque (inchangé) ---
  green: '#10b981', greenDark: '#047857', greenPrimary: '#059669',

  // --- Surfaces : 3 niveaux, point final ---
  surfacePage: '#09090b',      // fond page + sidebar
  surfaceCard: '#18181b',      // cartes, dialogs, menus  (remplace #111827/#111111/#0f0f12/#1c1c1f)
  surfaceElevated: '#27272a',  // chips, en-têtes table, survol
  border: '#27272a',
  borderHover: '#3f3f46',

  // --- Texte : ne jamais descendre sous textSecondary pour du sens ---
  textPrimary: '#f4f4f5',
  textSecondary: '#a1a1aa',
  textTertiary: '#a1a1aa',     // alias sûr (corrige le bug undefined)
  textDecorative: '#52525b',   // NON textuel uniquement

  // --- Sémantique (aligne les variantes en dur) ---
  success: '#10b981', successText: '#34d399',
  warning: '#f59e0b', warningText: '#fbbf24',
  error:   '#ef4444',                         // remplace #dc2626
  info:    '#3b82f6',                         // remplace #2563eb / #38bdf8
};
```

Décisions à acter : (a) **abandonner la famille slate** (`#94a3b8`, `#cbd5e1`…) au profit du zinc ; (b) **abandonner l'indigo** (`#6366f1`) au profit de l'émeraude pour les accents de la bibliothèque ; (c) fixer **TOP/BOT** sur une seule convention de couleur (aujourd'hui divergente entre `BomLibraryCard` et `BomLibraryDetail`).

---

## 9. Ce qui marche déjà bien (à préserver)

- La **direction visuelle** dark + émeraude est nette et cohérente dans l'intention.
- Les **skeletons de chargement** et la gestion loading/erreur (`BomLibraryCard`, `BomImport`) sont soignés.
- **`ErpContextForm`** et **`StockStatusChip`** consomment déjà les tokens correctement → modèles de référence.
- Le **dialog de suppression de MachinePnP** (confirmation + Alert d'impact) est le bon patron destructif.
- L'`ErrorBoundary` par route est une bonne pratique.
- La **hiérarchie typographique** du thème (Inter, poids 700, letter-spacing) est de qualité.

---

*Audit réalisé avec le plugin `design` (design-critique + accessibility-review WCAG 2.1 AA), audit du code source React/MUI, et vérification live dans Chrome (arbre d'accessibilité + mesures de contraste). Aucun fichier de l'application n'a été modifié.*
