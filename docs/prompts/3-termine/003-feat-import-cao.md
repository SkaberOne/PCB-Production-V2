> **EN ATTENTE — echange [[E02]]** (docs/prompts/echanges/ouverts/E02-orch-p003-parser-fixtures.md) : import CAO Eagle en pause tant que parser_eagle.py + fixtures OTR ne sont pas fournis. Repris a reception.

# [003] feat(import): import direct de fichiers CAO (Eagle/KiCad) par dossier → BOM + centroïde

| Champ | Valeur |
|---|---|
| **ID** | 003 |
| **Type** | feat |
| **Branche cible (PR)** | `dev` (branche d'intégration, déployée sur staging :8001) |
| **Branche de travail** | `feat/import-cao` (créée depuis `dev` à jour) |
| **Priorité** | haute |
| **Créé le** | 2026-07-21 |
| **Dépend de** | aucune (mais recouvre l'écran Import ; ne pas paralléliser avec un autre prompt touchant `ImportBomPage`/`bom_revision_imports`) |
| **Peut tourner en parallèle** | **oui** avec le 002 (fichiers disjoints : écran Import vs Revue BOM) ; non avec un autre prompt touchant `ImportBomPage`/`bom_revision_imports` |

> **Périmètre de CE prompt : Eagle uniquement.** Le parseur **KiCad est reporté** à un prompt ultérieur (pas de BOM de référence pour le calibrer aujourd'hui). Ce prompt doit néanmoins laisser l'architecture **prête à accueillir KiCad**.

---

## 1. Objectif (le POURQUOI)

Aujourd'hui, pour importer une carte, l'ingénieur doit d'abord lancer un **script CAO** (Eagle/KiCad) qui exporte la BOM et le fichier de placement (top + bot) en `.txt`, puis les importer. On veut **supprimer cette étape** : l'ingénieur **sélectionne le dossier de la carte**, le logiciel **détecte automatiquement les fichiers CAO** (`.brd`/`.sch` Eagle, `.kicad_pcb`/`.kicad_sch` KiCad) et **extrait tout seul la BOM (top + bot) et le centroïde**. Objectif : tout rassembler dans le logiciel.

## 2. Spécification (le QUOI)

À l'import, l'ingénieur choisit **un dossier** (ou dépose plusieurs fichiers). Le logiciel :
- **Auto-détecte** les fichiers CAO par extension : Eagle (`.brd` + `.sch`), KiCad (`.kicad_pcb` + `.kicad_sch`). Le fichier **carte** (`.brd` / `.kicad_pcb`) est la source du placement + valeurs ; le **schéma** (`.sch` / `.kicad_sch`) enrichit (MPN notamment).
- **Extrait la BOM complète** (une ligne par composant : référence, valeur, empreinte, quantité, MPN si dispo) **et le centroïde** (x, y, rotation, face top/bottom) — un seul fichier carte contient **les deux faces**, découpées automatiquement.
- Débouche dans le **flux d'import existant** : harmonisation auto (valeurs + empreintes) → **Revue BOM** (où se fait la curation : exclusions, corrections, feature 002).

**Critères d'acceptation :**
- [ ] Import par **sélection de dossier** (ou multi-fichiers) avec **auto-détection** des fichiers CAO ; message clair si aucun fichier CAO trouvé, ou si les deux faces / le schéma manquent.
- [ ] **Eagle** : le `.brd` est parsé → tous les composants placés (réf, valeur, empreinte, x, y, rotation, face) ; le `.sch` enrichit le MPN.
- [ ] La **face** est correcte (Eagle : rotation préfixée `M` = miroir = **bottom**).
- [ ] Le **centroïde** produit correspond au format machine actuel (voir §3, transformation) — validé au fichier de placement de référence près.
- [ ] Les données extraites alimentent la Revue BOM (harmonisation + curation) comme un import normal.
- [ ] La **détection reconnaît aussi** les fichiers KiCad (`.kicad_pcb`/`.kicad_sch`), mais le **parseur KiCad n'est PAS implémenté ici** : afficher un message clair « support KiCad à venir ». L'interface parseur doit être conçue pour l'accueillir sans refonte.
- [ ] Un jeu de **fixtures de test Eagle** (fichiers `.brd`/`.sch` réels + sortie machine attendue) est ajouté et vérifié.

**Hors périmètre :** le **parseur KiCad** (reporté à un prompt ultérieur, faute de BOM de référence pour calibrer — l'architecture doit juste rester prête à l'accueillir) ; l'aperçu graphique de la carte (feature viewer, prompt suivant) ; la refonte visuelle de l'écran d'import au-delà de l'ajout « sélection dossier + auto-détection ».

## 3. Architecture & décisions

**Pas de changement de schéma** : `BomItem` a déjà `reference_item`, `value_raw`, `value_harmonized`, `footprint_eagle`, `footprint_pnp`, `x`, `y`, `rotation`, `placement_side`, `dnp`, `quantity` (`serveur/src/models/bom.py`). Le parseur remplit ces champs, puis la chaîne existante harmonise (`harmony_rules.py`) et mappe les empreintes.

**Backend :**

| Zone | Fichier | Action |
|---|---|---|
| Parseur Eagle | `serveur/src/services/cao/parser_eagle.py` (**nouveau**) | **porter** `parser_eagle.py` du repo `SkaberOne/pcb-debug-assistant` (parse `.brd` XML `<element>` + `.sch` pour MPN). Eric fournit le code. |
| Parseur KiCad | `serveur/src/services/cao/parser_kicad.py` | **REPORTÉ** — ne pas implémenter ici. Prévoir seulement l'**interface** (ex. `ParserBase` : `parse(files) -> list[dict]`) pour que KiCad s'ajoute sans refonte. |
| Détection dossier | `serveur/src/services/cao/detect.py` (**nouveau**) | identifier le type CAO par extensions, apparier carte+schéma. |
| Transform placement | `serveur/src/services/pnp_export_service.py` (existant) | appliquer/réutiliser la transformation coordonnées carte → machine (cf ci-dessous). |
| Endpoint import | `serveur/src/routes/bom_revision_imports.py` (existant) | nouvel endpoint (ou extension) acceptant un lot de fichiers CAO ; réutiliser la suite `bom_file_service` (harmonisation, création BomItems). |

**Transformation coordonnées carte → machine (VALIDÉE sur la carte réelle « OTR board Bicolor », Eagle 9.6.2) :**
- **Face top** : identité (x, y, rotation inchangés).
- **Face bottom** : `x` inchangé · `y → H − y` (miroir vertical, `H` = hauteur de retournement de la carte, à **déduire de la géométrie du `.brd`** — bounding box / dimension board ; sur OTR `H = 34.20`) · `rotation → (rotation + 180) mod 360`.
- Format de sortie machine (déjà en place) : `Réf Valeur Empreinte X Y Angle Face` (espaces, `T`/`B`).

**Deux sorties depuis les fichiers CAO :**
1. **BOM complète** (tous les composants, connecteurs inclus) → harmonisation → Revue → carte/commande.
2. **Placement PnP** (composants SMD placés, coordonnées transformées) → alimente l'export machine existant. **Exclusions** du placement : connecteurs, test points, logo (élément sans valeur), et **DNP**.

**Données de calibration (carte OTR, à utiliser comme fixtures de non-régression) :**
- `.brd` = 60 éléments placés (59 avec valeur + 1 logo sans valeur).
- Fichier machine attendu = 49 placements (2 top : LED10/LED11 ; 47 bottom) — exclut J1-J6 (connecteurs), SCL/SDA (test points), U$1 (logo), C1/C4 (à confirmer : DNP).
- Valeurs `.brd` ↔ `.txt` machine identiques (même révision). Exemples de transform bottom : `C24 (4.94, 26.93, rot0) → (4.94, 7.27, rot180)` ; `IC1 (65.67, 28.02, rot180) → (65.67, 6.18, rot0)`.

**Décisions actées (Eric, 2026-07-21) :**
- **Import par dossier + auto-détection** des fichiers CAO.
- Parseur Eagle **porté** de `pcb-debug-assistant` ; KiCad **à écrire**.
- Aucun changement de schéma (le modèle porte déjà le centroïde).
- L'extraction **débouche dans la Revue** (harmonisation + curation manuelle), elle ne remplace pas ces étapes.
- MPN : extrait du `.sch` quand présent (attribut `MANUFACTURER_PART_NUMBER`, dans la techno du device de la librairie), sinon vide.

**Frontend :**
- `client/src/frontend/src/pages/ImportBomPage.jsx` + `components/import/*` : ajout **sélection de dossier** (`<input webkitdirectory>` ou multi-fichiers) + auto-détection côté client (filtrage extensions) et envoi au nouvel endpoint ; retour utilisateur (fichiers détectés, faces trouvées).

**ADR :** envisager un court ADR « import CAO » (numéro suivant disponible) documentant la transformation de coordonnées et la stratégie parseur.

## 4. Plan d'implémentation

1. **Récupérer** `parser_eagle.py` depuis `SkaberOne/pcb-debug-assistant` (Eric le fournit) et le porter dans `services/cao/parser_eagle.py` (adapter aux conventions du projet : package `src`, `utcnow`, etc.).
2. Écrire `detect.py` (appariement carte/schéma par extension) et l'endpoint d'import lot CAO.
3. Brancher la sortie parseur sur la chaîne existante (`bom_file_service` → harmonisation → BomItems → Revue).
4. Implémenter la **transformation de placement** (top identité ; bottom `y→H−y`, `rot+180`) avec `H` déduit de la géométrie ; **exclusions** PnP.
5. **Fixtures de non-régression** : intégrer les fichiers Eagle OTR + le fichier machine attendu ; test qui vérifie l'égalité (BOM 60, placement 49 au format machine, transform exacte).
6. **KiCad (reporté)** : ne PAS implémenter le parseur KiCad. Définir l'interface parseur commune ; la détection reconnaît les extensions KiCad et affiche « support à venir ».
7. **Frontend** : sélection dossier + auto-détection + envoi + retours utilisateur.
8. Tests + staging (importer la carte OTR depuis ses fichiers, vérifier BOM/centroïde/faces dans la Revue).

## 5. Tests

**Automatiques (obligatoires avant push) :**
- `pytest` : parseur Eagle sur fixtures OTR → 60 composants, faces (11 top / 49 bottom sur le `.brd`), valeurs ; placement machine = 49 lignes **identiques** au fichier de référence (transform exacte) ; détection dossier (Eagle ET KiCad reconnus) ; enrichissement MPN. (Tests parseur KiCad = prompt ultérieur.)
- `npm test` : composant d'import (sélection dossier, auto-détection, états d'erreur).

**Staging (:8001) :**
- [ ] Sélectionner le dossier OTR → fichiers CAO détectés → import → Revue BOM peuplée (réf, valeur, empreinte, x/y/rot/face) ; faces correctes ; export machine cohérent.

## 6. Définition de « terminé »

- [ ] Critères d'acceptation §2 remplis (parseur KiCad **reporté** — hors périmètre de ce prompt ; seule la détection + l'interface prête sont requises)
- [ ] `pytest` + `npm test` verts en local
- [ ] Déployé sur staging, scénario §5 vérifié
- [ ] CI GitHub verte sur la branche
- [ ] PR ouverte vers `dev`
- [ ] `RESULTAT.md` rédigé

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** · imports relatifs · `utcnow()` pour les timestamps.
- Ne jamais commiter de parasites (fichiers CAO de test = fixtures propres sous `serveur/src/tests/fixtures/`, pas de `.db`/`.bak`).
- Composants React > 300 lignes → découper.
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte.
- Navigateur de test : **Google Chrome uniquement**.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 003-feat-import-cao.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
