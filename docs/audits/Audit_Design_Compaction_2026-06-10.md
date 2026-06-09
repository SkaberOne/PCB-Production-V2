# Audit design — compaction de l'interface actuelle

**Date :** 2026-06-10
**Périmètre :** densité visuelle de l'app React (thème sombre émeraude/zinc), sans refonte. Objectif : réduire les espaces, baisser certaines polices, retirer les descriptions inutiles.
**Méthode :** lecture du code réel (`theme.js`, `AppShell.jsx`, `compactTable.js`, `PageHeader.jsx`, `GuideBanner.jsx`, pages et tableaux). Maquette comparative associée : `docs/design/Maquette_Design_Compact.html`.

---

## Impression d'ensemble

Le design est propre et cohérent (palette, bordures 1 px, radius 12, Inter). Le problème n'est pas l'esthétique mais la **redondance d'information textuelle en haut de chaque page** et des **paddings calibrés pour du confort**, pas pour un outil de production où l'utilisateur veut tout voir d'un coup. La plus grosse opportunité : supprimer la triple répétition du contexte et densifier les tableaux globalement.

---

## Constat n°1 — Le contexte est affiché 3 fois en haut de chaque page (priorité 🔴)

Sur une page workflow, l'utilisateur voit, empilés verticalement, avant la moindre donnée :

1. **Top bar** (`AppShell.jsx`) — hauteur 54 px — titre de la page (`currentPage.title`).
2. **Workflow stepper** (`AppShell.jsx`) — hauteur 46 px — les 6 étapes.
3. **PageHeader** (`PageHeader.jsx`) — `mb: 3` (24 px) — œil-de-bœuf + **titre H4 répété** (1,25 rem / 700, `mb: 1`) + **description** en `body1` (1 rem, `lineHeight: 1.6`, `maxWidth: 760`).
4. Parfois un **GuideBanner** — `py: 1.25` + `mb: 2.5` (~50 px).

Soit jusqu'à **~250 px de hauteur consommés avant la première ligne utile**, dont une grande part est de la redondance : le titre H4 du `PageHeader` répète mot pour mot le titre de la top bar.

| Élément | Actuel | Recommandation |
|---|---|---|
| `PageHeader` titre H4 | Répété sur chaque page intra-app | **Le retirer** quand la top bar affiche déjà le titre. Ne garder que la rangée `actions` (boutons) + éventuel éclairage de statut. |
| `PageHeader` description | Phrase longue `body1`, ex. « Sélectionne une BOM active à la fois, renseigne les quantités à produire par référence, puis finalise la revue avant de basculer vers la préparation composants. » | **Supprimer sur les pages workflow** (le stepper + les libellés de boutons disent déjà le flux). Conserver uniquement en **état vide** (page sans donnée), où l'explication a une vraie valeur. |
| `PageHeader` `mb` | 24 px | 12 px (`mb: 1.5`) quand conservé. |
| `GuideBanner` | `py: 1.25`, `mb: 2.5` | Garder le mécanisme (dismissible), mais **un seul** bandeau actif par page, et `mb: 1.5`. Ne pas cumuler avec une description. |

**Descriptions concrètes à retirer ou raccourcir** (repérées dans le code) :

- `BomViewerPage` : description de 25 mots → supprimer (workflow).
- `ImportBomPage` : « Charge une ou plusieurs BOM, corrige les informations utiles… » → supprimer (workflow).
- `CommandPage` : « Le module préparera une liste de composants… export ERP généré par le backend. » → supprimer (workflow).
- `MachinePnpWorkspace` / `MachinePnpPageLegacy` : descriptions longues → supprimer (workflow).
- `CostingPage`, `BaseDeDonneesPage`, `BomFilesPage`, `ErpDefaultsPage`, `SettingsPage` : raccourcir à **une demi-ligne** en `body2` 0,78 rem, ou retirer si le titre suffit.
- Conserver les descriptions des **`EmptyState`** (`BomReviewTab`, `BomSelectionPanel`, `BomStockTable`…) : là, le texte guide vraiment.

---

## Constat n°2 — Paddings et marges calibrés « confort » (priorité 🔴)

| Zone | Source | Actuel | Cible compacte |
|---|---|---|---|
| Marge latérale + verticale du contenu | `AppShell.jsx` `main` | `px: 3, py: 3` (24 px) | `px: 2, py: 2` (16 px) |
| Top bar | `AppShell.jsx` | 54 px | 44 px |
| Stepper workflow | `AppShell.jsx` | 46 px | 36 px |
| Sidebar | `AppShell.jsx` | 224 px | 200 px |
| Ligne de menu | `NavGroup` | `minHeight: 36`, `py: 0.75` | `minHeight: 32`, `py: 0.5` |

Le point « côtés gauche-droite » que tu mentionnes vient surtout des **24 px de marge** + des **tableaux qui ne remplissent pas la largeur**. Passer à 16 px et forcer `width: 100%` sur les tableaux récupère l'espace perdu.

---

## Constat n°3 — Densité des tableaux incohérente (priorité 🟡)

Deux régimes coexistent :

- Le **thème** (`MuiTableCell`) impose `padding: 8px 12px`, `fontSize: 0.875rem` → utilisé par les tableaux qui ne passent pas par l'util.
- L'util **`compactTable.js`** impose `px: 1, py: 0.75`, `fontSize: 0.79rem` → utilisé par `BomStockTable` et quelques autres.

Résultat : certaines pages sont denses, d'autres aérées. Selon `grep`, ~18 fichiers utilisent encore `TableCell` directement.

| Élément | Actuel | Cible |
|---|---|---|
| Padding cellule (thème) | `8px 12px` | `4px 10px` (≈ aligné sur `compactTable`) |
| Police cellule | 0,875 rem | 0,8 rem |
| En-tête de colonne | 0,75 rem, MAJUSCULES + `letterSpacing 0.05em` | 0,72 rem, garder MAJ mais `letterSpacing 0.02em` (moins large) |
| Colonnes numériques | alignées à gauche par défaut | **aligner à droite** + `font-variant-numeric: tabular-nums` (lecture en colonne, moins de scroll horizontal) |

**Recommandation structurante :** porter les valeurs de `compactTable.js` **dans le thème** (`components.MuiTable`/`MuiTableCell`), pour une densité unique sur toute l'app, et retirer l'util en doublon.

---

## Constat n°4 — Descriptions secondaires dans les lignes (priorité 🟡)

Dans `BomStockTable`, chaque ligne porte plusieurs sous-textes `caption` empilés :

- sous-ligne « valeur · empreinte · type » (utile, à garder en 0,72 rem),
- « Bobine X / Sachet Y / Tube Z » sous la quantité dispo,
- « Feeder A-04 », « Pose manuelle ».

Cela fait des lignes hautes (3-4 niveaux). Pistes :

- Déplacer le détail « Bobine/Sachet/Tube » dans un **tooltip** ou ne l'afficher qu'au survol → la ligne retombe à 1-2 niveaux.
- « Pose manuelle » : le **chip** de statut et la **caption** disent la même chose → garder seulement un indicateur (petit point ambre + tooltip).

---

## Constat n°5 — Sidebar et micro-typo (priorité 🟢)

- Logo : sous-titre « Production Suite » (0,6 rem) purement décoratif → optionnel, peut sauter pour gagner une ligne.
- Bloc « Production active » : libellé + valeur sur 2 lignes → fusionnable sur 1 ligne (« ● Carte A — Rev. C »).
- Numéros d'étape déjà retirés du menu (bien, audit 2026-05-29) — la redondance avec le stepper est déjà traitée côté menu, à faire de même côté `PageHeader`.

---

## Accessibilité — garde-fous à respecter en compactant

- **Plancher de police pour le texte porteur de sens : 0,75 rem (12 px).** Ne pas descendre en dessous pour des libellés lisibles. Les valeurs cibles ci-dessus (0,8 / 0,72 rem) restent au-dessus.
- **Contraste :** le commentaire de `theme.js` fixe déjà un plancher à `#a1a1aa` (≈ 5,3:1 sur `#18181b`, conforme AA). Le `#52525b` (`textDisabled`/group labels) est **sous AA** → le réserver au décoratif uniquement, ne jamais l'utiliser pour une donnée. À surveiller si on densifie les en-têtes de groupe.
- **Cibles cliquables :** lignes de menu à 32 px et lignes de tableau cliquables ≥ 28 px restent acceptables à la souris (usage desktop). En dessous, prévoir une zone de clic élargie.
- Conserver les `aria-label` existants (`BomStockTableRow`, boutons icône).

---

## Ce qui fonctionne déjà bien

- Palette et système de bordures cohérents ; `tableLayout: fixed` + ellipsis déjà en place dans `compactTable`.
- Stepper data-driven (jauges de progression réelles) — pertinent, à garder.
- Plancher de contraste documenté dans le thème — bonne hygiène a11y.

---

## Recommandations prioritaires

1. **Dégraisser le haut de page (🔴).** Retirer le titre H4 du `PageHeader` (doublon top bar) et supprimer les descriptions des pages workflow ; les garder uniquement dans les `EmptyState`. Gain : ~120-180 px de hauteur utile récupérés par page.
2. **Resserrer la coque (🔴).** Contenu `px/py: 24 → 16`, top bar `54 → 44`, stepper `46 → 36`, sidebar `224 → 200`, lignes de menu `36 → 32`.
3. **Densité de tableau unique (🟡).** Porter `compactTable` dans le thème (`4px 10px`, 0,8 rem), aligner les colonnes numériques à droite en `tabular-nums`, forcer `width: 100%`.
4. **Alléger les lignes denses (🟡).** Détail Bobine/Sachet/Tube en tooltip, dédoublonner « Pose manuelle ».
5. **Micro-gains sidebar (🟢).** Sous-titre logo optionnel, bloc production sur une ligne.

---

## Mise en œuvre suggérée (après validation)

Changements quasi tous **centralisés** : `theme.js` (table + spacing), `AppShell.jsx` (hauteurs/marges), `PageHeader.jsx` (rendre `title`/`description` optionnels et compacts), suppression des props `description=` au cas par cas. Faible risque, fort impact. À faire sur une branche courte `refactor/densite-ui` avec capture avant/après par page, pytest + `npm test` verts avant PR vers `dev` (cf CLAUDE.md §10).
