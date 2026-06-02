# ADR 0003 — Extraction datasheets + dossier `data/datasheets/`

**Date** : 2026-06-02
**Statut** : ✅ Accepté
**Décideurs** : Eric (validation règles) · Claude (investigation + implémentation)

---

## Contexte

Le calcul du nombre de composants en bobine (`estimateReelQuantity()` dans
`client/src/frontend/src/utils/bomPlanning.js`) dépend du **pitch** (pas entre
composants dans la bande) et de l'**épaisseur de bande**. Ces données, plus la
largeur de bande (qui conditionne le feeder) et la quantité par bobine, figurent
dans les datasheets fournisseur (PDF Mouser).

Aujourd'hui ces infos sont saisies à la main. On veut un **script sans LLM** qui
lit le PDF, applique d'abord une table normalisée **EIA-481** (boîtier → pitch /
largeur / feeder), complète par parsing PDF, et produit un `.md` par composant
servant à remplir la base et le calcul bobine.

Cela introduit un nouveau type d'artefact (PDF source + `.md` généré) qui n'a pas
sa place dans les dossiers existants définis par `STRUCTURE.md` (`serveur/`,
`client/`, `docs/`). `docs/` est réservé à la documentation projet, pas aux
données composant.

---

## Décision

Créer un nouveau domaine de données à la racine :

```
data/
└── datasheets/
    ├── pdf/        ← datasheets PDF source (input, gitignored)
    └── md/         ← fiches .md générées par composant (output)
```

- Le lien composant ↔ fichier se fait par **référence/MPN** dans le nom de fichier
  (ex. `data/datasheets/md/C0805_100NF.md`).
- `data/datasheets/pdf/` est **gitignored** (PDF lourds, propriété fournisseur).
- `data/datasheets/md/` est versionné (léger, utile à l'équipe).

### Champs base ajoutés à `COMPONENTS` (migration Alembic)

`qty_per_reel` (Integer), `reel_outer_diameter_mm` (Float),
`reel_hub_diameter_mm` (Float), en complément des `pitch_mm`, `tape_width_mm`,
`feeder_type`, `package` déjà existants.

### Stratégie d'extraction

**Table EIA-481 d'abord, PDF en complément.** La table `boîtier → pitch / largeur
/ feeder` couvre ~80 % des composants courants sans parsing. Le PDF affine et
récupère ce que la table ne donne pas (qté/bobine, dimensions bobine).

Notation feeder par largeur de bande : **CL8 / CL12 / CL16 / CL24**.

---

## Conséquences

- ✅ Calcul bobine fiabilisé (pitch + épaisseur de bande réels au lieu de défauts).
- ✅ Saisie base composant accélérée (pitch, largeur, feeder pré-remplis).
- ✅ Aucune dépendance LLM ni clé API (table locale + pdfplumber).
- ⚠️ Nouveau dossier `data/` à la racine → `STRUCTURE.md` mis à jour (cette ADR).
- ⚠️ Table EIA-481 et épaisseurs par défaut sont des **approximations**
  modifiables ; valeurs mesurées par Eric prioritaires.

---

## Références
- Modèle composant : `serveur/src/models/bom.py` (classe `Component`)
- Calcul actuel : `client/src/frontend/src/utils/bomPlanning.js` (`estimateReelQuantity`)
- Norme : EIA-481 / IEC 60286-3 (bandes porteuses CMS)
