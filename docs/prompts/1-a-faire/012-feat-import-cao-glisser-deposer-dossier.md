# [012] feat(import): glisser-déposer d'un dossier carte + extraction auto de l'arborescence

| Champ | Valeur |
|---|---|
| **ID** | 012 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/import-cao-drop-dossier` |
| **Priorité** | haute · **Dépend de** 006 (mergé — `CaoFolderImport.jsx` + endpoint `/bom/import-cao` présents sur `dev`) · **Parallèle** : **non** avec un prompt touchant `ImportBomPage` / `CaoFolderImport` / la chaîne d'import (006, 011) |
| **Créé le** | 2026-07-22 |

## 1. Objectif (le POURQUOI)

Un ingé crée une **nouvelle carte** : il doit pouvoir **glisser-déposer le dossier du projet** dans l'app et récupérer la BOM sans rien saisir à la main. Aujourd'hui (006) l'import CAO existe mais :
1. c'est un **bouton « Sélectionner le dossier »** (`webkitdirectory`), **pas un vrai glisser-déposer** (aucune zone de dépôt) ;
2. il **n'exploite pas la structure** : la référence est devinée depuis le **nom du fichier** `.brd`, la révision est un champ manuel (`REV_A` par défaut), le nom est manuel.

But : **déposer le dossier carte** `KT<ref> - <nom>` → l'app **lit l'arborescence** (`Rev.X/Conception/`), **extrait réf + nom + révision(s)** automatiquement, et importe **toutes les révisions absentes** de la base (comme le fait 011 côté serveur, mais ici en interactif côté navigateur).

## 2. Spécification (le QUOI)

**Zone de dépôt (vrai drag-and-drop).** Ajouter dans `CaoFolderImport` une **zone de dépôt** (`onDragOver`/`onDragLeave`/`onDrop`) où l'ingé **dépose un dossier**. Un **dossier** déposé se lit via l'API entries : `DataTransferItem.webkitGetAsEntry()` → parcours récursif (`FileSystemDirectoryReader`) pour récupérer les fichiers **avec leur chemin relatif**. Conserver le **bouton « Sélectionner le dossier »** existant (`webkitdirectory`) en **fallback** — dans ce cas la structure vient de `file.webkitRelativePath`.

**Structure attendue (identique au 011) :**
```
KT<référence> - <nom carte>/        ← ex. "KT190562 - NanoSH MK2"  (dossier DÉPOSÉ)
  Rev.A/  Rev.B/ ...                 ← une révision par sous-dossier
    Conception/                      ← fichiers CAO ICI (.brd + .sch, ou .kicad_pcb)
```
- **Référence + nom** = depuis le **nom du dossier carte déposé** (`KT<ref> - <nom>`), regex ex. `^(KT\d+[A-Z]?)\s*-\s*(.+)$`.
- **Révision** = depuis chaque sous-dossier `Rev.<X>` (`Rev.A` → `A`).
- **Fichiers CAO** dans `Rev.<X>/Conception/`. **Ne PAS se fier au nom de fichier** (incohérent).

**Comportement au dépôt du dossier carte :**
- Parser l'arbo → lister les **révisions trouvées** (`Rev.X`) avec, pour chacune : type détecté (Eagle `.brd`/`.sch` / KiCad / aucun CAO).
- **Importer toutes les révisions absentes** de la base pour cette référence ; **ignorer** celles déjà présentes (idempotent). Récupérer les révisions existantes via l'API (ex. `GET /bom/{bom_id}/revisions` ou la liste des références) pour décider.
- Pour chaque révision **Eagle absente** → appeler l'endpoint existant **`POST /bom/import-cao`** (fichiers `.brd`/`.sch` de ce `Rev.X/Conception/` + `reference`, `revision`, `name` **extraits de l'arbo**).
- **KiCad** détecté → **listé « support à venir »**, non importé, pas d'erreur.
- **Révision déjà en base** → listée « déjà importée », ignorée.

**Retour à l'écran** : récap par révision — **importées** / **déjà en base (ignorées)** / **KiCad (à venir)** / **erreurs**. Puis bascule possible vers la **Revue** peuplée (comportement 006 conservé).

**Critères d'acceptation :**
- [ ] **Zone de dépôt** fonctionnelle : déposer un **dossier carte** `KT... - ...` déclenche la lecture de l'arbo (drag-and-drop réel, pas seulement le bouton).
- [ ] **Réf + nom** extraits du **nom du dossier** ; **révision(s)** extraite(s) des sous-dossiers `Rev.X` — **plus aucune saisie manuelle obligatoire** quand l'arbo est conforme.
- [ ] Fichiers CAO lus dans `Rev.X/Conception/` (via `webkitGetAsEntry` au drop, via `webkitRelativePath` au bouton).
- [ ] **Toutes les révisions Eagle absentes** sont importées ; les **existantes ignorées** (idempotent) ; **KiCad listé** (non importé).
- [ ] Récap clair (importées / ignorées / KiCad / erreurs) + bascule Revue.
- [ ] **Fallback** : dossier non conforme (pas de `KT... -`, pas de `Rev.X`) → conserver le comportement 006 (réf devinée + champs éditables) sans planter.
- [ ] Le bouton « Sélectionner le dossier » (006) reste disponible.
- [ ] **Captures front** dans `docs/prompts/preuves/012/`.

**Hors périmètre :** parseur KiCad (reporté) ; parcours **serveur** du partage réseau (c'est 011) ; renseignement des MPN. **012 = import interactif côté navigateur**, un dossier carte à la fois.

## 3. Architecture & décisions

- **Front d'abord, réutilisation maximale.** Le endpoint `POST /bom/import-cao` (006) **existe déjà** et importe **une** révision (fichiers + `reference`/`revision`/`name`). 012 **n'a pas besoin de nouvel endpoint** : la boucle multi-révisions se fait **côté client** (un appel par révision absente). Ajouter un endpoint seulement si un besoin réel apparaît (sinon **échange**).
- **Lecture d'un dossier déposé** : `event.dataTransfer.items[i].webkitGetAsEntry()`. Si `entry.isDirectory` → `createReader().readEntries()` **récursif** (attention : `readEntries` renvoie par lots, **ré-appeler jusqu'à liste vide**). Produire une liste de `{ file, relativePath }`. Extraire un helper testable `walkDropEntries(dataTransferItems) → File[]` (chaque `File` porte son chemin — soit `webkitRelativePath`, soit un chemin reconstruit).
- **Extraction structure** : helper pur `parseCardTree(files)` → `{ reference, name, revisions: [{ revision, caoFiles, kind }] }`. **Réutiliser / mutualiser** la logique de structure du **011** (regex `KT<ref> - <nom>`, `Rev.X`, `Conception/`) — factoriser un util commun front (ex. `utils/cardTree.js`) plutôt que dupliquer. `detectCao` (006) reste la brique de détection Eagle/KiCad par lot de fichiers.
- **Idempotence** : avant d'importer, récupérer les révisions déjà en base pour la référence (API existante) ; n'importer que les absentes.
- **Robustesse** : dossiers biscornus (pas de `Conception`, `Archives`, `history`, révision sans CAO) → **ne pas planter**, signaler dans le récap.
- `CaoFolderImport.jsx` fait déjà ~291 lignes → **découper** (composant zone de dépôt + composant récap révisions + helpers) pour rester < 300 lignes par fichier.
- Décisions (Eric, 2026-07-22) : dépôt du **dossier carte** `KT... - ...` ; multi-révisions = **importer toutes les nouvelles** (absentes), ignorer les existantes.

## 4. Plan d'implémentation

1. **Cartographier** `CaoFolderImport.jsx` (006) : `detectCao`, `handleFolderChange`, appel `/bom/import-cao`, bascule Revue. Repérer la logique de structure du **011** à mutualiser.
2. **Helpers testables** : `walkDropEntries` (lecture récursive `webkitGetAsEntry`) + `parseCardTree` (réf/nom/révisions depuis chemins). Util commun avec 011 si possible.
3. **Zone de dépôt** : `onDragOver/Leave/Drop`, états visuels (survol, lecture en cours), fallback bouton conservé.
4. **Orchestration import** : récupérer les révisions existantes → pour chaque révision Eagle absente, `POST /bom/import-cao` (réf/rév/nom extraits) ; agréger les résultats.
5. **Récap** : importées / ignorées / KiCad / erreurs + bascule Revue.
6. **Découpe** des composants (< 300 lignes) + tests + staging + **captures**.

## 5. Tests

- `npm test` :
  - `parseCardTree` : `KT190562 - NanoSH MK2/Rev.A/Conception/x.brd` → `{reference:'KT190562', name:'NanoSH MK2', revisions:[{revision:'A', kind:'eagle'}]}` ; multi-révisions ; KiCad → `kind:'kicad'` ; dossier non conforme → fallback (pas de crash).
  - `walkDropEntries` : arbo simulée (mock `webkitGetAsEntry`/`readEntries` par lots) → tous les fichiers récupérés avec chemin.
  - Composant : dépôt d'un dossier → liste des révisions ; révision déjà en base marquée ignorée ; bouton fallback fonctionne.
- `pytest` : inchangé (réutilise `/bom/import-cao` du 006) ; ajouter un cas seulement si un util backend est touché.
- **Staging (:8001)** : déposer un vrai dossier carte Eagle (ex. le dossier OTR reconstitué en `KT... - .../Rev.A/Conception/`) → révision importée, Revue peuplée ; re-déposer → « déjà en base » ; **captures** `docs/prompts/preuves/012/`.

> ⚠️ **Pré-requis staging** : le serveur :8001 doit tourner la build **à jour de `dev`** (006 inclus). Si l'endpoint `/bom/import-cao` est absent de l'openapi live → **redéployer** (redémarrer back + rebuild front) avant de tester ; sinon **ouvrir un échange**.

## 6. Définition de « terminé »

- [ ] Critères §2 remplis (drop réel + extraction arbo + multi-révisions absentes + KiCad listé + fallback)
- [ ] `npm test` (+`pytest` si backend touché) verts
- [ ] Déployé staging **à jour de dev**, scénarios vérifiés **+ captures** `docs/prompts/preuves/012/`
- [ ] CI verte · PR vers `dev` · `RESULTAT.md`

## 7. Contraintes & rappels (CLAUDE.md)

- **Lecture seule** sur le partage réseau (ne JAMAIS écrire dans `\\rs\Elec\...`). Ici l'import passe par le **navigateur** (fichiers déposés), pas par un accès serveur au partage.
- Package `src` · `utcnow()` · imports relatifs (si backend touché).
- **Composant React < 300 lignes → découper** (`CaoFolderImport` dépasse déjà : factoriser).
- Pas de front livré sans **preuve visuelle** (captures staging).
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte, Chrome uniquement.
- Ne jamais deviner sur un point bloquant → **canal d'échange** `docs/prompts/echanges/`.

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 012-feat-import-cao-glisser-deposer-dossier.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
