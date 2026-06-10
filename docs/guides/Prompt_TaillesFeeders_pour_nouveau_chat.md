# Prompt de reprise — Compléter les tailles de feeder des composants

> À coller dans un nouveau chat. Objectif : combler les tailles de feeder manquantes
> en base, car elles faussent l'organisation des feeders (un composant sans taille
> est traité comme « petit », 1 position).

---

```
Projet : PCB Flow Production Suite / PCB Production V2 (dossier C:\Users\Eric\Documents\Projet\PCB-Production-V2), branche audit-restructure-2026-05. Lis d'abord CLAUDE.md, STRUCTURE.md, docs/CHANGELOG.md (dernière entrée), et le guide docs/guides/MachinePnP_Export_Session_2026-06-08.md.

Contexte : l'export PnP (SMT1010), le placement des feeders (dynamiques→avant / fixés→arrière, remplissage bilatéral petits-à-gauche / gros-à-droite) et le bornage des nozzles aux types montés (503/504/505) sont faits et commités (commit 1824f3b).

PROBLÈME À TRAITER MAINTENANT : certains composants de la bibliothèque n'ont PAS de taille de feeder renseignée. Conséquence : ils sont traités comme « petits » (1 position) par défaut, donc l'organisation des feeders (gros à droite, gros = >8 mm = 2 positions) est faussée. Je veux compléter ces tailles, avec sans doute une RECHERCHE INTERNET pour mapper « footprint/boîtier → largeur de feeder » (standard de bande EIA-481 : 8/12/16/24/32/44 mm selon le boîtier).

Ce que je veux faire, étape par étape :
1. Repérer les composants sans taille de feeder exploitable (feeder_type vide OU dont extract_component_feeder_size_mm renvoie None). Me donner la liste / le compte, regroupés par footprint_pnp / footprint_eagle / package.
2. Construire (avec recherche internet EIA-481) un mapping « footprint/boîtier → largeur de bande (mm) » : ex. 0402/0603/0805/1206 → 8 mm ; SOT-23/SOT-323 → 8 mm ; SOIC-8/SOT-223 → 12 mm ; SOIC-16/TSSOP large → 16 mm ; gros connecteurs/électrolytiques → 12/16/24 mm. Me proposer ce tableau et le faire VALIDER avant toute écriture en base.
3. Une fois validé, compléter la base : décider du moyen (saisie UI, script de remplissage, ou déduction automatique depuis le footprint au moment du calcul). Ne PAS casser la clé de matching (= champ `value` du composant). dev.db est hors Alembic → ALTER/UPDATE manuels.
4. Tests + redémarrage backend + vérif sur l'app (Chrome) et sur l'export réel (la colonne Feeder / le placement des gros feeders).

Ancrages techniques (à vérifier en lisant le code) :
- Modèle composant : serveur/src/models/bom.py → Component : champs `feeder_type` (String, ex. "CL8-4"/"CL12"), `footprint_pnp`, `footprint_eagle`, `package`. Clé de matching BOM↔composant = `value`.
- Parser taille : serveur/src/utils/feeder_types.py → `extract_component_feeder_size_mm`, `normalize_component_feeder_type`, table `COMPONENT_FEEDER_TYPE_TO_SIZE_MM`, `FEEDER_SIZE_PATTERN`.
- Règle taille→positions : serveur/src/services/assignment_helpers.py → `component_slot_usage` = 1 si ≤8 mm, sinon 2 (gros feeder = >8 mm).
- Déduction nozzle (corrélée au boîtier) : serveur/src/utils/nozzles.py → `deduce_nozzle_type` (_NOZZLE_TYPE_TOKENS) ; nozzles bornés via `clamp_nozzle_type`/`available_nozzle_types`.
- Mapping empreintes : table `FootprintMapping` (footprint_eagle → footprint_pnp) dans bom.py.
- Le placement utilise la taille via `feeder_size_mm` / `slot_usage` (serveur/src/services/assignment_planning.py).

Rappels techniques importants :
- Backend lancé en --no-reload via serveur\DEMARRER_SERVEUR.bat (qui vide API_KEY= sinon 401). Redémarrer manuellement après tout changement de code backend.
- dev.db est hors Alembic (ALTER/UPDATE manuels) ; pour la prod, prévoir une migration Alembic + un éventuel script de backfill.
- Ne pas écrire les fichiers source via le shell sur le montage (risque de troncature) — utiliser les outils d'édition. Lancer git et pytest côté Windows (le montage sandbox sert des lectures périmées/tronquées).
- Tests : .venv\Scripts\pytest serveur\src\tests -q ; front : cd client\src\frontend && npm test. Navigateur : Google Chrome uniquement.

Commence par l'étape 1 (repérage), puis propose le mapping de l'étape 2 et attends ma validation avant d'écrire quoi que ce soit en base.
```
