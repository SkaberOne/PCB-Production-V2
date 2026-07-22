# [E02] Import CAO Eagle — code parseur + fixtures de calibration manquants

| De | orch |
| Pour | planif |
| Prompt lié | 003 |
| Statut | **RÉSOLU** |
| Créé le | 2026-07-21 |

## Blocage / question

Le 003 est bloqué par deux inputs que l'orchestrateur ne peut pas produire seul : (1) le code
`parser_eagle.py` (repo privé inaccessible), (2) les fixtures de calibration OTR (`.brd`, `.sch`,
fichier machine attendu). Recommandation orch : **option A** (fournir les inputs).

---

## Réponse / décision (planif)

**Option A retenue — les inputs sont fournis.** Ils sont dans `serveur/src/tests/fixtures/eagle_otr/` :
`OTR.brd`, `OTR.sch`, `OTR_machine_TOP.txt`, `OTR_machine_BOT.txt`, `parser_eagle_reference.py` (+ `README.md`).

1. **Code parseur** : **pas besoin du repo privé.** Utilise `parser_eagle_reference.py` fourni — il est
   **validé** (extrait les 60 composants + centroïde de l'OTR). Porte-le / adapte-le dans
   `serveur/src/services/cao/parser_eagle.py` (conventions projet : package `src`, `utcnow`, etc.).
2. **`H` (hauteur de retournement)** : déduite du **contour** (layer 20 « Dimension ») du `.brd`,
   `H = y_min + y_max` du bounding box. Sur OTR = **34.20**. Les `.txt` permettent de le vérifier
   exactement (`y_brd + y_machine = H` pour tout composant bottom).
3. **Transform** (confirmée) : top = identité ; bottom `x` inchangé, `y → H − y`, `rot → (rot+180) mod 360`.
4. **MPN** : attribut `MANUFACTURER_PART_NUMBER` (techno du device dans la librairie du `.sch`). Confirmé.
5. **C1/C4** : Eric confirme **probable erreur d'export** — **pas de règle** à créer. Décision produit :
   **le parseur extrait TOUT** (C1/C4 inclus) ; l'exclusion du placement machine (connecteurs, TP, logo,
   DNP, + retraits manuels comme C1/C4) est une **curation en aval** (Revue / règle PnP), pas une règle
   du parseur.

**Acceptance §2 ajustée en conséquence :** le test de non-régression compare (a) l'**extraction complète**
= 60 composants depuis le `.brd`, et (b) la **transformation** sur les **références communes** au `.brd`
et aux `.txt` machine — **sans hard-fail sur C1/C4** (les 2 seules réf du `.brd` absentes du `.txt`, +
les non-PnP connecteurs/TP/logo). KiCad reste **hors périmètre** (reporté).

## Suite (émetteur, après application)

<!-- À remplir par l'orchestrateur : reprendre le 003 avec ces inputs, ajouter les fixtures aux tests,
     puis déplacer cet échange dans resolus/. -->

---

**Appliqué (orch) :** services/cao/ (parser_eagle porté, detect, transform). H = span du contour layer 20 = 34.20 (recalé sur les .txt : le contour descend à −0.2, donc span et non y_min+y_max). PR #81 (003 incrément 1), 541 pytest. Incrément 2 (endpoint + UI) à suivre.
