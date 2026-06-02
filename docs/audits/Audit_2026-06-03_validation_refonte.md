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
