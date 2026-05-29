# Audit Design — PCB Flow Production Suite
*Analyse réalisée le 15 mai 2026*

---

## 1. Vue d'ensemble de l'existant

L'application est une SPA React (MUI v5, dark mode) organisée en 7 pages accessibles via un drawer latéral permanent de 280 px. Le thème est cohérent et techniquement bien exécuté (couleurs, typographie Inter, tokens de couleur). Les problèmes identifiés sont essentiellement **UX et architecture d'information**, pas stylistiques.

---

## 2. Problèmes identifiés

### 2.1 Navigation : ambiguïté et absence de workflow visible

| # | Problème | Impact |
|---|----------|--------|
| N1 | Trois items "BOM" dans le menu : **Fichier BOM**, **Import BOM**, **BOM** — impossible de distinguer l'ordre et la relation entre eux au premier coup d'œil | Élevé |
| N2 | L'application a un workflow séquentiel implicite (Production → Import → Review → Commande → PnP) mais le menu présente 7 items à plat sans aucune indication d'ordre | Élevé |
| N3 | Le sidebar fait 280 px pour 7 labels courts — l'espace est gaspillé, surtout sur les écrans 1080p | Moyen |
| N4 | Aucun indicateur "étape courante dans le workflow" — l'utilisateur ne sait pas s'il a oublié une étape | Moyen |

### 2.2 AppBar : redondance et bruit visuel

| # | Problème | Impact |
|---|----------|--------|
| A1 | Le nom de la production active apparaît **trois fois** : titre AppBar, sous-titre AppBar, chip AppBar | Moyen |
| A2 | Le chip "Desktop actif / Mode web" ne déclenche aucune action — c'est une info technique sans intérêt utilisateur | Faible |
| A3 | La hauteur de l'AppBar (72 px) + le drawer (280 px) consomment ~35 % de l'espace horizontal et ~10 % vertical dès le départ | Moyen |

### 2.3 Dashboard : trop d'informations hétérogènes

| # | Problème | Impact |
|---|----------|--------|
| D1 | Les 4 StatCards ont toutes un icône `TrendingUp` alors qu'il n'y a aucune donnée de tendance — l'icône est mensongère | Moyen |
| D2 | StatCard "Production chargée" affiche le nom de la production — info déjà dans l'AppBar, doublon | Faible |
| D3 | Les deux cards de droite ("Production chargée" et "Dernière BOM chargée") répètent ce qui est déjà visible dans l'AppBar et les StatCards | Moyen |
| D4 | La création d'une production se fait depuis **deux endroits distincts** : Dashboard ET Import BOM. Le point d'entrée n'est pas clair | Élevé |
| D5 | Le nom suggéré pour une production (`prod01 DATE:03/2026`) est un format interne technique — difficile à lire rapidement dans un tableau | Faible |

### 2.4 Densité et lisibilité des tableaux

| # | Problème | Impact |
|---|----------|--------|
| T1 | Font-size des cellules : **0.82 rem** — sous le seuil de lisibilité confortable (14 px minimum recommandé). Problématique en fin de journée ou sur écrans basse résolution | Élevé |
| T2 | `verticalAlign: 'top'` dans les cellules crée un alignement incohérent quand les lignes ont des hauteurs différentes (ex: BOM Viewer avec champs inline) | Moyen |
| T3 | Les champs TextField inline dans les tableaux (BOM Viewer) créent une densité cognitive très élevée — édition + lecture dans la même vue sans mode distinct | Élevé |
| T4 | Aucune alternance de couleur de ligne (zebra striping) — difficile de suivre une ligne sur toute la largeur | Moyen |

### 2.5 Gestion de session : opacité pour l'utilisateur

| # | Problème | Impact |
|---|----------|--------|
| S1 | La notion de "session" (activeProduction, currentBom, selectedBomEntries) n'est **jamais expliquée** dans l'UI. L'utilisateur ne comprend pas pourquoi certaines pages sont vides | Élevé |
| S2 | Si aucune production n'est chargée, la plupart des pages affichent un état vide sans explication contextuelle ni CTA | Élevé |
| S3 | Charger une production navigue automatiquement vers `/bom` ou `/import-bom` selon l'état — comportement invisible qui peut dérouter | Moyen |

### 2.6 Machine PnP : complexité non guidée

| # | Problème | Impact |
|---|----------|--------|
| M1 | 4 sous-onglets (Machines, Feeders, Carts, Productions) + visualisation slot strip + affectation de production = la page la plus complexe sans aucun guide d'usage | Élevé |
| M2 | La visualisation "slot strip" est une représentation physique de la machine — sans légende ni tutoriel intégré, elle est cryptique | Moyen |

### 2.7 Commande Composant : champs ERP enfouis

| # | Problème | Impact |
|---|----------|--------|
| C1 | Les 6 champs ERP (projet, statue, délai, remarque, validateur, fournisseur) sont stockés en `localStorage` par production mais leur rôle dans l'export n'est pas clairement indiqué dans l'UI | Moyen |

---

## 3. Points positifs à conserver

- **Thème sombre cohérent** : palette bien construite, contraste acceptable, tokens utilisés systématiquement
- **Typography Inter** : choix moderne, bonne lisibilité
- **Composant `PageHeader`** : structure claire (eyebrow + title + description + actions) — à généraliser
- **Composant `EmptyState`** : présent et bien pensé quand utilisé
- **`ErrorBoundary`** sur chaque route : bonne pratique
- **Animations légères** sur les cartes (hover borderColor) : non intrusives
- **Labels en français** dans toute l'interface : cohérence linguistique
- **Boutons sans élévation** (`disableElevation: true`) : look moderne et flat

---

## 4. Recommandations prioritaires

### P0 — Critiques (à faire en premier)

**R1 : Renommer et réordonner le menu**
```
Avant : Dashboard | Fichier BOM | Import BOM | BOM | Commande Composant | Machine PnP | Paramètre
Après :
  ─ WORKFLOW ─────────────────
  1. Productions        (Dashboard actuel)
  2. Import BOM
  3. Revue BOM          (BOM Viewer actuel)
  4. Commande
  5. Machine PnP
  ─ BIBLIOTHÈQUE ──────────────
  · BOM enregistrées    (Fichier BOM actuel)
  ─ SYSTÈME ────────────────────
  · Paramètres
```

**R2 : Ajouter un bandeau de workflow**
Un composant `WorkflowStepper` horizontal affiché sous l'AppBar (ou dans le sidebar) indiquant les étapes et leur état (complété / courant / verrouillé).

**R3 : Réduire le sidebar à 220 px**
Les labels sont courts. Récupérer 60 px sur toute l'interface.

**R4 : Augmenter la font-size des tableaux à 0.875 rem (14 px)**
Et remonter le padding cellule à `10px 12px`.

### P1 — Importantes

**R5 : Simplifier l'AppBar**
Garder uniquement : [titre de la page] + [chip production active si pertinent]. Supprimer le chip mode Desktop/Web et le sous-titre redondant.

**R6 : Unifier le point de création de production**
La création de production ne doit exister que depuis "Productions" (Dashboard). La page Import BOM doit juste permettre de **sélectionner** une production existante, pas d'en créer une nouvelle.

**R7 : Remplacer les StatCards par un résumé contextuel**
Supprimer les icônes TrendingUp. Transformer les 4 cards en un bandeau compact (2 lignes max) ou en une seule card "État de la session".

**R8 : Ajouter un mode lecture/édition dans BOM Viewer**
Mode lecture par défaut (tableau dense lisible) → bouton "Éditer" pour activer les champs inline. Évite la confusion entre navigation et édition.

**R9 : État vide guidant**
Chaque page sans production chargée doit afficher un EmptyState avec un CTA direct ("Charger une production → ") et une explication en 1 phrase de pourquoi c'est nécessaire.

### P2 — Améliorations qualité

**R10 : Zebra striping léger sur les tableaux**
`backgroundColor: index % 2 ? 'rgba(255,255,255,0.02)' : 'transparent'`

**R11 : Légende de la slot strip (Machine PnP)**
Un tooltip ou un panneau pliable expliquant les couleurs (libre / affecté / fixe / vide).

**R12 : Tooltip sur les étapes du workflow**
Au survol d'une étape dans le WorkflowStepper : description de l'étape + statut (ex: "3 BOM importées").

---

## 5. Estimation effort

| Recommandation | Effort | Impact |
|---|---|---|
| R1 — Renommer menu | 1h | ⭐⭐⭐⭐⭐ |
| R2 — WorkflowStepper | 4h | ⭐⭐⭐⭐⭐ |
| R3 — Sidebar 220 px | 15min | ⭐⭐⭐ |
| R4 — Font-size tableaux | 15min | ⭐⭐⭐⭐ |
| R5 — AppBar simplifiée | 1h | ⭐⭐⭐ |
| R6 — Unifier création production | 2h | ⭐⭐⭐⭐ |
| R7 — Remplacer StatCards | 2h | ⭐⭐⭐ |
| R8 — Mode lecture/édition BOM | 3h | ⭐⭐⭐⭐ |
| R9 — Empty states guidants | 2h | ⭐⭐⭐⭐⭐ |
| R10 — Zebra striping | 30min | ⭐⭐ |
| R11 — Légende slot strip | 1h | ⭐⭐⭐ |
| R12 — Tooltips workflow | 1h | ⭐⭐⭐ |

**Total estimé : ~18h pour l'ensemble des recommandations.**
Les R1 + R2 + R4 + R9 seules (≈7h) apporteraient 80 % de la valeur UX.

---

## 6. Proposition de nouvelle architecture d'information

```
PCB Flow
├── 🔁 WORKFLOW
│   ├── 1 · Productions        ← entrée principale, gestion des sessions
│   ├── 2 · Import BOM         ← upload + pré-traitement
│   ├── 3 · Revue BOM          ← édition inline + validation
│   ├── 4 · Commande           ← agrégation + export
│   └── 5 · Machine PnP        ← affectation + suivi
│
├── 📁 BIBLIOTHÈQUE
│   └── BOM enregistrées       ← lecture seule, exploration
│
└── ⚙️ SYSTÈME
    └── Paramètres
```

Le WorkflowStepper (composant horizontal, 5 étapes) est affiché en permanence sous l'AppBar et indique :
- ✅ Étape complète (production chargée / BOM importée / BOM validée / commande générée / machine configurée)
- 🔵 Étape courante
- ⬜ Étape à venir (grisée)
