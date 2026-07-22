# RÉSULTAT — [006] import CAO — endpoint + UI dossier (003 incrément 2)

- **Statut** : ✅ terminé
- **Branche** : `feat/import-cao-ui` (depuis `dev` à jour)
- **PR** : [#82](https://github.com/SkaberOne/PCB-Production-V2/pull/82) vers `dev` — CI à valider verte
- **Déployé staging** : oui (:8001, build `build-web-staging`) — preuves front ci-dessous

## Ce qui a été fait

### Backend
- `serveur/src/services/cao/cao_import_service.py` (nouveau) : `prepare_cao_import(files)` → `detect_cao` → `EagleParser.parse_with_height` → `to_machine_placement` → **texte machine par face** (`Réf Valeur Empreinte X Y Angle Face`, format des exports `_TOP.txt`/`_BOT.txt`). Ce texte est relu par le `BomParser` existant : **l'harmonisation (valeurs + empreintes) et la persistance restent inchangées** (aucune duplication de la chaîne). Composant sans empreinte → ignoré + warning (curation en aval).
- `serveur/src/routes/bom_revision_imports.py` : endpoint `POST /bom/import-cao` (multipart, un **revision par face** TOP/BOT). Persistance **factorisée** dans `_persist_import_result(...)`, partagée avec `/import` (get-or-create `BomReference`, révision logique, `_replace_revision_items`, snapshot, sérialisation). KiCad reconnu mais reporté (« support à venir », pas de crash) ; aucun fichier CAO → 422 ; aucun composant exploitable → 422 ; une seule face → warning.
- `serveur/src/schemas/bom.py` : schéma `CaoImportResponse` (kind, supported, board, schematic, faces, revisions[], warnings).

**Décision d'architecture** (§3 du prompt) : la BOM CAO est **bi-face**. Le modèle `BomRevision` est mono-face (`type` TOP/BOT), et l'export machine (`pnp_export_service`) lit la face **par item** (`placement_side`). Choix retenu : **un revision par face** — fidèle à l'import `.txt` actuel (« exactement comme l'import actuel »), conforme à la convention « un snapshot par face » (`_TOP.txt`/`_BOT.txt` des fixtures OTR), et compatible avec la revue multi-BOM existante (`batchResults`). Aucun changement de schéma, aucune modification de la chaîne partagée → pas d'échange nécessaire.

### Frontend
- `client/src/frontend/src/components/import/CaoFolderImport.jsx` (nouveau, < 300 lignes) : sélection **dossier** (`webkitdirectory`), **auto-détection** des extensions CAO côté client (Eagle prioritaire, KiCad reconnu → « à venir »), inférence de la référence depuis le `.brd`, appel `/bom/import-cao`, **retour utilisateur** (type, carte, schéma, faces trouvées + comptes), bascule vers la **Revue peuplée** (`setSelectedBomEntries` + rattachement à la production active si présente).
- `client/src/frontend/src/pages/ImportBomPage.jsx` : intégration de la carte « Import CAO par dossier ».

## Preuves (front) — staging :8001

Répertoire `docs/prompts/preuves/006/` :
1. `006_preuve_1_carte_import_cao.jpg` — la carte « Import CAO par dossier » sur la page Import.
2. `006_preuve_2_detection_eagle.jpg` — dossier OTR sélectionné → détection Eagle (OTR.brd + OTR.sch), référence auto « OTR », import activé.
3. `006_preuve_3_import_60comp_2faces.jpg` — import réussi : **60 composant(s) sur 2 face(s) (TOP · 11, BOT · 49)**.
4. `006_preuve_4_revue_revisions_TOP_BOT.jpg` — Revue : deux révisions **OTR REV_A TOP (11 lignes)** + **OTR REV_A BOT (49 lignes)**.
5. `006_preuve_5_revue_bom_lignes_harmonisees.jpg` — table Revue BOM peuplée (valeur brute → valeur revue harmonisée, empreinte Eagle → PnP, type inféré).
6. `006_preuve_6_kicad_a_venir.jpg` — fichiers KiCad détectés → « Support KiCad à venir », import désactivé.

## Tests

- **pytest** : `serveur/src/tests/test_cao_import_endpoint.py` (service + endpoint sur fixtures OTR : 60 comp / 2 faces, centroïde exact LED10/C2, harmonisation, KiCad « à venir », no-CAO → 422). **Suite complète : 545 passed, 1 skipped** (hors `test_migrations.py`, comme la CI).
- **npm** : `client/src/frontend/src/components/import/__tests__/CaoFolderImport.test.jsx` (détection Eagle/KiCad/none, inférence référence, états d'erreur, import + bascule Revue). **Suite complète : 35 suites / 136 tests passed**.

## Réserves / à finir

- **Parseur KiCad** reporté (détection + message « à venir » seulement) — hors périmètre 006.
- **MPN CAO** : `parser_eagle` extrait les MPN, mais `BomItem` n'a pas de colonne MPN (§2 : pas de changement de schéma). Comme l'import `.txt`, le MPN reste résolu via la bibliothèque (match valeur + empreinte). Propagation directe du MPN CAO = évolution future possible.
- **Aperçu graphique** de la carte : hors périmètre (viewer = prompt suivant).
