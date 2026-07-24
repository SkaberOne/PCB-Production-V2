# [029] feat(ui): afficher « référence — nom » des cartes (import BOM + commande client) + replier par défaut

| Champ | Valeur |
|---|---|
| **ID** | 029 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/affichage-reference-nom-carte` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : oui |
| **Source** | Retour Eric (usage import BOM + commande client) · **Créé le** 2026-07-24 |

## 1. Objectif (le POURQUOI)
Partout où on choisit/liste une **carte**, l'UI n'affiche que la **référence** (ex. `AMPLI_GEN6`), pas le **nom**, ce qui rend l'identification difficile. Eric veut voir **« référence — nom »** de façon **générale**. En plus, dans le panneau « BOM enregistrées » (import BOM), chaque carte est **dépliée par défaut** → ça prend trop de place ; il faut **replier par défaut**.

## 2. Spécification (le QUOI)

### A. Import BOM — panneau « BOM enregistrées » (`components/import/BomLibraryCard.jsx`)
- **Afficher « référence — nom »** au niveau du groupe carte (`LibraryReferenceGroup`), au lieu de `referenceEntry.reference` seul. Si le nom est absent (carte legacy) → afficher la référence seule (pas de tiret orphelin).
- **Replier par défaut** le menu déroulant de **chaque carte** : `LibraryReferenceGroup` → `const [open, setOpen] = React.useState(false);` (au lieu de `true`). Les **groupes de catégorie** (AMPLI, SANS CATÉGORIE) peuvent rester dépliés (on voit la liste des cartes), mais les **révisions** d'une carte restent cachées tant qu'on ne clique pas.
- Vérifier que la donnée `referenceEntry` contient bien le **nom** ; sinon, ajouter le champ `name` à la source de « BOM enregistrées » (endpoint/bibliothèque BOM) — ajout léger, lecture seule.

### B. Commande client (`pages/ClientOrdersPage.jsx` — onglets Clients **et** Machines)
- La liste des cartes (`refs`) est construite avec `label: x.reference`. **Ajouter le nom** : `label = x.name ? \`${x.reference} — ${x.name}\` : x.reference`.
- S'applique aux **deux** usages : sélection d'une carte **pour un client** (ClientsTab) **et** sélection d'une carte **pour une machine à créer** (MachinesTab).
- Si la source des `refs` ne renvoie pas `name`, l'**ajouter au payload** (`BomReference.name`) — ajout léger.

### C. Généralisation — sélecteur de carte (`components/bom/BomPickerDialog.jsx`)
- Le libellé `primary` affiche `${reference} · ${revision} · ${side}` : **ajouter le nom** (`${reference} — ${name}` puis `· rév · face`). Nom absent → référence seule. Vérifier le champ `name` dans les items ; l'ajouter si manquant.
- (Objectif « en général » : partout où une carte est proposée au choix, réf **+** nom.)

**Critères d'acceptation :**
- [ ] « BOM enregistrées » : chaque carte affiche **« référence — nom »** (référence seule si pas de nom).
- [ ] « BOM enregistrées » : chaque carte est **repliée par défaut** (révisions cachées jusqu'au clic).
- [ ] Commande client (client **et** machine) : le sélecteur de carte affiche **« référence — nom »**.
- [ ] `BomPickerDialog` (et tout sélecteur de carte) affiche **« référence — nom »**.
- [ ] Aucune régression : la recherche/sélection continue de fonctionner (filtre par réf **et** nom si possible) ; cartes legacy sans nom → référence seule, pas de « — » orphelin.
- [ ] Captures `docs/prompts/preuves/029/` (BOM enregistrées replié + réf-nom ; commande client réf-nom).

**Hors périmètre :** refonte des panneaux ; changement du modèle de données (juste exposer `name` si absent).

## 3. Architecture & décisions
- **Front** : `BomLibraryCard.jsx` (label réf-nom + `open` défaut `false` sur le groupe carte), `ClientOrdersPage.jsx` (label réf-nom pour `refs`), `BomPickerDialog.jsx` (primary réf-nom). Découper si > 300 lignes.
- **Back (si besoin)** : exposer `name` (`BomReference.name`) dans les réponses qui alimentent ces listes (bibliothèque BOM enregistrées, `refs` commande client, items du picker) si le champ n'y est pas déjà. Lecture seule, léger.
- Helper d'affichage commun conseillé (ex. `formatCardLabel(reference, name)` → `"REF — Nom"` ou `"REF"`), réutilisé aux 3 endroits.

## 4. Tests
- `npm test` : le helper `formatCardLabel` (avec/sans nom) ; `BomLibraryCard` rend le groupe carte **replié** par défaut et affiche réf-nom ; `ClientOrdersPage` sélecteur affiche réf-nom ; `BomPickerDialog` affiche réf-nom.
- `pytest` (si back touché) : `name` présent dans les réponses concernées.
- **Staging (:8001)** : import BOM → « BOM enregistrées » replié + réf-nom ; commande client → sélection carte (client + machine) réf-nom. Captures `docs/prompts/preuves/029/`.

## 5. DoD
Critères §2 · `npm test` (+`pytest` si back) verts · migration N/A · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 6. Contraintes
Composant React < 300 lignes (découper) · pas de front sans preuve · réutiliser un helper commun `formatCardLabel` · cartes sans nom → référence seule. Branche courte depuis `dev`, PR vers `dev`, CI verte.

## 7. RÉSULTAT — à remplir par l'orchestrateur
