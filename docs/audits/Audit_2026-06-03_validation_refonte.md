# Validation de la refonte design — Journal par vague

**Branche :** `refonte-design-2026-06`
**Référence :** `Audit_2026-06-03_design_accessibilite.md`
**Méthode de validation :** frameworks plugin `design` (design-critique + accessibility-review WCAG 2.1 AA), tests Jest, rendu live Chrome (console + inspection DOM des couleurs calculées).

---

## ✅ Vague 1 — Quick wins (validée le 2026-06-03)

### Corrections livrées

| # | Correction | Fichiers | Sévérité traitée |
|---|---|---|---|
| 1 | Panneaux d'import migrés en **thème dark** (tuiles teintées + valeurs sémantiques vives, en-têtes de table sur fond `background.default`, textes `#666` → `text.secondary`) | `BomImportOverviewPanel.jsx`, `BomImportResolutionDialogs.jsx`, `BomImportPreviewCard.jsx` | 🔴 |
| 2 | Bugs de tokens `undefined` corrigés (`textTertiary`/`textMuted` ajoutés, alias sûrs AA) | `theme.js` | 🔴 |
| 3 | ~120 lignes de **code mort** supprimées (`no-unreachable`) | `BomImportWorkspaceCard.jsx` | 🔴 |
| 4 | Import cassé `compactHeaderSx` corrigé (cellules d'en-tête confiées au thème) | `MachinePnpTables.jsx` | 🔴 |
| 5 | **Confirmation en deux temps** sur action destructive « Supprimer de la BOM » (sans `window.confirm`) | `BomImportResolutionDialogs.jsx` | 🔴 |
| 6 | **Contrastes** relevés : EmptyState (titre→primaire, desc→secondaire), eyebrow PageHeader, sous-titre logo (`#3f3f46` 1.91:1 → `#a1a1aa`), état vide BomFiles | `EmptyState.jsx`, `PageHeader.jsx`, `AppShell.jsx`, `BomFilesPage.jsx` | 🟡 |

### Preuves de validation

- **Tests Jest :** 18 suites / **66 tests — 100 % OK** (seul un warning de dépréciation `ReactDOMTestUtils.act`, sans rapport).
- **Console runtime :** navigation complète des 7 pages → **0 erreur / exception** (vérifié notamment sur Machine PnP, ex-`compactHeaderSx`, et Commande, ex-`textMuted`).
- **Inspection DOM :** scan des couleurs calculées sur Import BOM → **aucun fond clair résiduel** (seul match = input natif masqué de MUI, invisible).
- **Contraste mesuré :** tous les textes corrigés passent désormais AA (`#a1a1aa` = 6.91:1 sur carte, `#f4f4f5` = 16.12:1).

### Reporté (par cohérence de périmètre)

- **Labels `aria-label` champs de recherche + boutons-icônes sans nom** → **Vague 3** (a11y dédiée).
- **Confirmation « Supprimer révision » (bibliothèque)** → **Vague 2** (consolidation des dialogs via `ConfirmDialog`).
- **Couleurs en dur restantes (slate, indigo, surfaces multiples)** → **Vague 2** (design system).

**Verdict Vague 1 :** ✅ Tous les points 🔴 critiques de l'audit initial sont corrigés et validés. Aucune régression. Palette conservée.

---

## ✅ Vague 2 — Consolidation design system (validée le 2026-06-03)

### Corrections livrées

| # | Correction | Portée | Sévérité traitée |
|---|---|---|---|
| 1 | **Surfaces unifiées** sur `#18181b` : `#111827`, `#111111`, `#0f0f12`, `#1c1c1f`, `#161b22` éliminés | ConfirmDialog, SettingsPage, BomReviewTab, BomStockTab/Dialog, BomSelectionPanel, BomLibraryCard, BomLibraryDetail, DashboardPage | 🟡 |
| 2 | **Slate → zinc** : `#f8fafc`→`#f4f4f5`, `#94a3b8`→`#a1a1aa`, `#cbd5e1`→`#d4d4d8` (+ teintes rgba) | composants `machine/*`, SettingsPage | 🟡 |
| 3 | **Indigo → émeraude** : `#6366f1`→`#10b981`, `#4f46e5`→`#059669`, `#a5b4fc`→`#34d399`, fonds indigo→émeraude (+ rgba) | BomLibraryCard | 🟡 |
| 4 | **Rouges/bleus → tokens** : `#dc2626`→`#ef4444`, `#2563eb`→`#3b82f6` (+ hovers, + rgba) ; `#818cf8`→`#a855f7`, `#38bdf8`/`#67e8f9`→bleu palette | MachinePnpPage, DashboardPage, BomStockTable | 🟡 |
| 5 | **Indicateur d'onglet** BOM Viewer : gris `secondary` → **vert** `primary` (cohérent avec Machine PnP) | BomViewerPage | 🟡 |
| 6 | **Confirmations destructives via `ConfirmDialog`** : « Supprimer révision » (bibliothèque) et migration des **2 `window.confirm()` natifs** de Settings (suppression + reset de règles) | BomLibraryDetail, SettingsPage | 🟡 |

### Preuves de validation

- **Tests Jest :** 18 suites / **66 tests — 100 % OK** (aucune régression).
- **Inventaire code :** scan exhaustif → **0 couleur hors-palette restante** (surfaces, slate, indigo, rouges/bleus, y compris teintes rgba).
- **Rendu live :** scan des couleurs calculées du DOM (Settings) → **aucune couleur hors-palette dans le rendu** ; navigation Settings/BOM/Machine PnP → **0 erreur console**.
- **Palette conservée :** seuls les écarts ont été ramenés vers l'émeraude/zinc d'origine ; aucune nouvelle teinte introduite (hors alias internes).

### Reporté

- **`aria-labelledby` sur tous les dialogs** + structure de coquille commune → **Vague 3** (a11y).
- **Unification fine des 3 systèmes de table** → partiellement faite (en-têtes confiées au thème) ; reste à harmoniser `thSx/tdSx` de MachinePnP → **Vague 3**.

**Verdict Vague 2 :** ✅ Palette et surfaces entièrement unifiées sur les tokens. Confirmations destructives thématisées. Aucune régression.
