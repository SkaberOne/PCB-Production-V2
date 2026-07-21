# Fixtures — Import CAO Eagle (carte « OTR board Bicolor », KT240576C)

Jeu de calibration pour le parseur Eagle du **prompt 003**. Fournis par la planif via l'échange **E02**.

## Fichiers
- `OTR.brd`, `OTR.sch` — fichiers Eagle 9.6.2 réels (source BOM + centroïde).
- `OTR_machine_TOP.txt`, `OTR_machine_BOT.txt` — fichier de placement machine **ATTENDU**
  (format `Réf Valeur Empreinte X Y Angle Face`, `T`/`B`). Sert de **test de non-régression**.
- `parser_eagle_reference.py` — parseur de **référence VALIDÉ** (extrait 60 composants + centroïde).
  À porter dans `serveur/src/services/cao/`. **Pas besoin du repo privé `pcb-debug-assistant`.**

## Ce que le parseur doit produire (validé sur ce jeu)
- **Extraction complète** depuis le `.brd` : **60 éléments** (59 avec valeur + 1 logo `U$1` sans valeur).
  **Le parseur extrait TOUT** (aucune exclusion au niveau parseur).
- Par composant : `reference_item`, `value` (= `value_raw`), `footprint` (package Eagle), `x`, `y`,
  `rotation`, `face`.
- **Face** : rotation Eagle préfixée `M` (miroir) = **bottom**, sinon **top**.
- **MPN** (optionnel) : attribut `MANUFACTURER_PART_NUMBER` dans la techno du *device* (librairie du `.sch`).
  Présent pour ~6 composants (ICs, connecteurs).

## Transformation coordonnées carte → machine (VALIDÉE)
- **Top** : identité (x, y, rotation inchangés).
- **Bottom** : `x` inchangé ; **`y → H − y`** ; **`rotation → (rotation + 180) mod 360`**.
- **`H`** = hauteur de retournement, déduite du **contour** (layer 20 « Dimension ») du `.brd` :
  `H = y_min + y_max` du bounding box du contour. Sur OTR → **H = 34.20**.
- **Vérification exacte** via les `.txt` : pour tout composant *bottom*, `y_brd + y_machine = H` (= 34.20)
  et `rot_machine = (rot_brd + 180) mod 360`. (Le parseur peut donc s'auto-calibrer/valider sur ce jeu.)

## Exclusions du fichier machine = CURATION, pas une règle du parseur
Le fichier machine de référence a **49 lignes** (2 top + 47 bot) ; le parseur en produit ~60.
Absents du fichier machine : connecteurs J1-J6, test points SCL/SDA, logo `U$1`, **et C1/C4**
(→ **probable erreur d'export** côté CAO, confirmé par Eric ; à traiter comme curation, pas comme règle).

**Conséquence pour les tests :** le parseur extrait **tout** ; l'exclusion (connecteurs / TP / logo / DNP,
+ éventuels retraits manuels) se fait **en aval** (Revue BOM / règle de placement PnP). Le test de
transformation se fait sur les **références communes** au `.brd` et aux `.txt` — **ne pas** hard-fail
sur C1/C4.
