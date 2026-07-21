# [E02] Import CAO Eagle — code parseur + fixtures de calibration manquants

| De | orch |
| Pour | planif |
| Prompt lié | 003 |
| Statut | OUVERT |
| Créé le | 2026-07-21 |

## Blocage / question

Le prompt 003 (import direct de fichiers CAO Eagle → BOM + centroïde) est **bloqué par des inputs que l'orchestrateur ne peut pas produire seul** :

1. **Code `parser_eagle.py`** — le prompt indique explicitement « **porter** `parser_eagle.py` du repo `SkaberOne/pcb-debug-assistant` — **Eric fournit le code** » (§3 et §4.1). Ce repo n'est pas accessible depuis l'environnement de l'orchestrateur.
2. **Fixtures de calibration OTR** — les tests exigés (§5) valident le parseur au **fichier machine de référence près** : `.brd` + `.sch` réels de la carte « OTR board Bicolor » **et** le fichier de placement machine attendu (49 lignes). Sans ces fichiers de référence, impossible d'écrire/valider la transformation (top identité ; bottom `y→H−y`, `rot+180`, `H` déduit de la géométrie) ni de garantir l'égalité exacte demandée.

Écrire un parseur Eagle « à l'aveugle » (sans le code de référence ni la BOM/centroïde attendus) produirait un résultat **non validable** contre l'acceptance — donc non livrable.

## Options envisagées

- **A) Fournir les deux inputs** : déposer `parser_eagle.py` (ou le rendre accessible) **et** les fixtures OTR (`.brd`, `.sch`, fichier machine attendu) dans le repo (ex. `serveur/src/tests/fixtures/eagle_otr/`). → l'orchestrateur porte le parseur, câble détection dossier + endpoint + transform, et ajoute les tests de non-régression. **Voie recommandée.**
- **B) Démarrer d'abord la partie non bloquée** : interface parseur commune (`ParserBase`), `detect.py` (extensions Eagle/KiCad), UI « sélection dossier + auto-détection » + message « KiCad à venir », **sans** le parseur Eagle ni les tests de calibration. Livrable partiel, mais l'acceptance Eagle reste ouverte jusqu'aux inputs.
- **C) Reporter 003** entièrement jusqu'à disponibilité des inputs.

**Recommandation orch : A.** Si tu veux avancer en parallèle sans les fixtures, **B** est possible (scaffolding testable a minima), mais le cœur (parseur + calibration) attend **A**.

## Précisions utiles (si A)

- Confirmer `H` (hauteur de retournement) : déduit du bounding box du `.brd` ? (OTR : `H = 34.20`) — fournir la règle exacte attendue.
- Confirmer la liste d'**exclusions** placement PnP (connecteurs J1-J6, test points SCL/SDA, logo U$1, DNP C1/C4 à confirmer).
- Attribut MPN dans le `.sch` : `MANUFACTURER_PART_NUMBER` (techno du device) — confirmer.

## Impact / en pause

Prompt 003 **EN PAUSE** (déplacé en `2-en-cours/` avec note « EN ATTENTE échange E02 »). Les autres prompts continuent. Dès réception des inputs (option A) ou du feu vert scaffolding (option B), je reprends 003.
