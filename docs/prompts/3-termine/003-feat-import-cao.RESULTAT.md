# RÉSULTAT — [003] import direct de fichiers CAO (Eagle) → BOM + centroïde

- **Statut** : ⚠ terminé en 2 incréments (incr.1 livré ; incr.2 = prompt 006)
- **Branche** : `feat/import-cao` (incrément 1)
- **PR** : [#81](https://github.com/SkaberOne/PCB-Production-V2/pull/81) (mergé) — CI verte
- **Déployé staging** : incrément 1 = backend pur (parseur), pas de front → preuves front dans l'incrément 2 (prompt 006)

## Ce qui a été fait (incrément 1)

- `serveur/src/services/cao/` : `parser_eagle` (Eagle `.brd`/`.sch` → 60 composants + centroïde + MPN via `(library, deviceset)`), `detect` (Eagle implémenté, KiCad reconnu mais reporté), `parser_base` (interface prête pour KiCad).
- Transformation carte → machine : top = identité ; bottom `x` inchangé, `y → H − y` (**H = span du contour layer 20 = 34.20**, recalé sur les `.txt` machine), `rot → (rot+180) % 360`.
- Fixtures de calibration `serveur/src/tests/fixtures/eagle_otr/` + `test_cao_import_eagle.py` (7 cas, **49 placements exacts** vs fichiers machine de référence).
- Échange **E02** (inputs parseur + fixtures) créé puis **résolu** (`echanges/resolus/`).

## Incrément 2 (endpoint + UI) → prompt 006

- Le branchement du parseur sur la chaîne d'import/harmonisation → Revue BOM, et l'UI de sélection de dossier, sont traités par le **prompt 006** (`feat/import-cao-ui`).

## Réserves / à finir

- Parseur **KiCad** reporté (détection seulement, message « à venir »).
- Suite = **prompt 006** (endpoint + UI + preuves front).
