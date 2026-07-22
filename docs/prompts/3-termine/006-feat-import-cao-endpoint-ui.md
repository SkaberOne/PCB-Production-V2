# [006] feat(import): import CAO — endpoint + UI dossier (003 incrément 2)

| Champ | Valeur |
|---|---|
| **ID** | 006 |
| **Type** | feat |
| **Branche cible (PR)** | `dev` |
| **Branche de travail** | `feat/import-cao-ui` (créée depuis `dev` à jour) |
| **Priorité** | haute |
| **Dépend de** | **003 incr.1** (mergé — `services/cao/` + fixtures présents sur `dev`) |
| **Créé le** | 2026-07-21 |
| **Peut tourner en parallèle** | non (touche `ImportBomPage` / `bom_revision_imports`) |

---

## 1. Objectif (le POURQUOI)

Le parseur CAO Eagle est livré (003 incr.1 : `serveur/src/services/cao/`). Il reste à le **brancher sur le flux réel** : un endpoint qui reçoit les fichiers CAO d'un **dossier**, les parse, et injecte le résultat dans la **chaîne d'import/harmonisation existante → Revue BOM** ; plus l'**UI de sélection de dossier** avec auto-détection. But : l'ingénieur choisit le **dossier de la carte** et récupère la BOM + centroïde dans la Revue, **sans script CAO**.

## 2. Spécification (le QUOI)

- **Backend** : endpoint qui reçoit un **lot de fichiers CAO** (multipart), les **détecte** (`services/cao/detect`), **parse** (`parser_eagle`), produit les items (réf, valeur, footprint, x/y/rotation/face) et les **injecte dans la chaîne d'import existante** (harmonisation valeurs + empreintes → `BomReference`/`BomRevision`/`BomItem` → session Revue), exactement comme l'import actuel.
- **Frontend** (`ImportBomPage`) : mode **« import CAO par dossier »** — `<input webkitdirectory>` (ou multi-fichiers), **auto-détection** des extensions CAO côté client, envoi à l'endpoint, retour utilisateur (fichiers détectés, faces trouvées), puis bascule sur la **Revue peuplée**.
- **KiCad** : la détection le **reconnaît** mais renvoie « support à venir » (parseur reporté).

**Critères d'acceptation :**
- [ ] Sélection d'un **dossier** → fichiers CAO **auto-détectés** → import → **Revue BOM peuplée** (valeurs, footprints, x/y/rotation/face) **via la chaîne d'harmonisation existante**.
- [ ] Le **centroïde** alimente l'export machine (format existant inchangé).
- [ ] Messages d'erreur clairs : aucun fichier CAO, une seule face, schéma manquant.
- [ ] **KiCad détecté → « support à venir »** (pas d'erreur, pas de crash).
- [ ] **Captures front** dans `docs/prompts/preuves/006/`.

**Hors périmètre :** parseur KiCad (reporté) ; aperçu graphique de la carte (viewer = prompt suivant).

## 3. Architecture & décisions

**Réutiliser au maximum la chaîne d'import existante** : le parseur produit la même structure d'items que l'import `.txt` actuel (cf 003 incr.1 + fixtures `eagle_otr`). **Pas de changement de schéma** (`BomItem` a déjà x/y/rotation/placement_side).

| Zone | Fichier | Action |
|---|---|---|
| Endpoint import CAO | `serveur/src/routes/bom_revision_imports.py` | nouvel endpoint (ex. `POST /bom/import-cao`) : reçoit les fichiers, `detect` → `parser_eagle` → items → **injecte dans la chaîne existante** (`bom_file_service` / point d'entrée de l'import `.txt`). |
| Parseur / détection | `serveur/src/services/cao/*` | **déjà livrés** — réutiliser (parser_eagle, detect, parser_base). |
| Chaîne harmonisation | `serveur/src/services/bom_file_service.py`, `harmony_rules.py` | réutiliser (harmonisation valeurs/empreintes + création items). **Identifier le point d'entrée** commun avec l'import `.txt`. |
| UI import | `client/src/frontend/src/pages/ImportBomPage.jsx` + `components/import/*` | mode « sélection dossier » + auto-détection + appel endpoint + retours + bascule Revue. |

Si la chaîne d'harmonisation existante attend un **format `.txt` figé** difficile à alimenter directement depuis les items parsés → **ouvrir un échange** (`docs/prompts/echanges/`) plutôt que bricoler (option : générer en interne le texte au format attendu vs passer les items en direct).

## 4. Plan d'implémentation

1. **Cartographier** le point d'entrée actuel de l'import (`bom_revision_imports` → `bom_file_service`) : où les items harmonisés sont créés à partir du fichier `.txt`.
2. **Endpoint** : recevoir les fichiers CAO → `detect` → `parser_eagle` → items → injecter au **même point d'entrée** (réutiliser l'harmonisation).
3. **Frontend** : sélection dossier + auto-détection + envoi + retours + bascule Revue.
4. **Vérifier** : importer le **dossier OTR** (fixtures) → Revue peuplée + centroïde + faces corrects.
5. Tests (endpoint + front) + staging + **captures**.

## 5. Tests

- `pytest` : endpoint import CAO sur les fixtures `eagle_otr` → items corrects (60), faces, centroïde ; détection KiCad = « à venir ».
- `npm test` : composant sélection dossier / auto-détection / états d'erreur.
- **Staging (:8001)** : importer le dossier OTR → Revue peuplée → **captures** dans `docs/prompts/preuves/006/`.

## 6. Définition de « terminé »

- [ ] Critères §2 remplis
- [ ] `pytest` + `npm test` verts
- [ ] Déployé staging, scénario vérifié **+ captures** `docs/prompts/preuves/006/`
- [ ] CI GitHub verte · PR ouverte vers `dev`
- [ ] `RESULTAT.md` rédigé

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** · `utcnow()` · imports relatifs.
- Composant React > 300 lignes → découper.
- Pas de front livré sans **preuve visuelle** (captures staging).
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte, Chrome uniquement.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 006-feat-import-cao-endpoint-ui.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
