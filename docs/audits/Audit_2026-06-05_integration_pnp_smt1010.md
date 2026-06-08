# Audit — Intégration PCB Production V2 ↔ PnP SMT1010

> **Date** : 2026-06-05
> **Objet** : Étudier comment la section *Machine PnP* de PCB Production V2 (après optimisation feeders + nozzles) peut envoyer sa configuration au logiciel de pilotage de la machine Pick&Place **SMT1010**.
> **Périmètre analysé** : dossier `C:\Users\Eric\Documents\Projet\PnP SMT1010` (binaires, fichiers projet `.ky`, base `PartDB.db`, config) + section Machine PnP de PCB Production V2.
> **Statut** : audit de cadrage. Aucune modification de code réalisée.

---

## 1. Synthèse exécutive

Le SMT1010 est une machine **Kayo / K8Pro** pilotée par un logiciel .NET propriétaire (closed-source). Ses fichiers de projet (`.ky`) sont des objets **.NET BinaryFormatter sérialisés** — donc très difficiles à écrire depuis l'extérieur.

**Bonne nouvelle décisive** : l'analyse des binaires révèle que le logiciel possède un **import CSV offline** (« Offline Import » / « Coord Import ») avec **auto-mapping des colonnes**. C'est la voie d'intégration recommandée : PCB Production V2 n'a **pas** besoin de générer le format `.ky` binaire ; il lui suffit d'**exporter un CSV** structuré selon les colonnes attendues par l'écran d'import de la machine.

Côté V2, **toute la donnée nécessaire existe déjà** : `BomItem` porte `x`, `y`, `rotation`, `placement_side`, `footprint_pnp`, et le service `assignment_planning` produit les affectations feeder + nozzle. La correspondance est quasi 1:1.

**Reco** : implémenter un **export CSV « format SMT1010 »** dans la section Machine PnP. Effort estimé faible à moyen. Le verrou restant n'est pas technique mais une **validation terrain** : confirmer l'ordre/nommage exact des colonnes sur l'écran d'import réel (non accessible lors de cet audit).

---

## 2. Anatomie du projet SMT1010

### 2.1 Le logiciel

| Fichier | Rôle |
|---|---|
| `SMT1010.exe` | Application principale (.NET Framework 4.0, ~6,9 Mo) |
| `K8ProPrj.dll` | Moteur de projet — namespace `KayoFile` (classes du `.ky`) |
| `K8ProUI.dll` | Interface (écrans d'import, bibliothèque, feeders) |
| `K8ProComLib.dll`, `MotionSerialPort.dll` | Communication carte de mouvement (série) |
| `OptimizeLibrary.dll` | **Optimiseur d'emplacements interne à la machine** ⚠️ |
| `CamVision.dll` | Vision / centrage composants |
| `System.Data.SQLite.dll` + `SQLite.Interop.dll` | Accès SQLite (`PartDB.db`) |
| `log4net.dll`, `glog.dll` | Journalisation |

Runtime : **.NET Framework 4.0** (`SMT1010.exe.config` → `supportedRuntime v4.0`). Logs écrits dans `D:\SMT\Log\K8PRO.log`.

> ⚠️ **Point d'attention stratégique** : la présence de `OptimizeLibrary.dll` signifie que la machine sait déjà optimiser elle-même les emplacements. Deux philosophies d'intégration possibles (voir §6) :
> - **A** — V2 optimise tout et impose la configuration complète (feeders figés).
> - **B** — V2 fournit le placement brut + la liste des composants, et laisse la machine optimiser les feeders.

### 2.2 Les fichiers projet `.ky`

Format = **sérialisation binaire .NET (`BinaryFormatter`)** de la classe `KayoFile.KayoPrj` (assembly `K8ProPrj, Version=1.25.8.26`). Ce ne sont **ni du texte, ni du JSON, ni du XML**.

Un `.ky` contient 5 blocs :

| Bloc | Classe | Contenu |
|---|---|---|
| `ChipList` | `BindingList<ChipPara>` | Liste des composants distincts + **affectation feeder & nozzle** |
| `MountList` | `BindingList<MountPara>` | Liste des **placements** (un par point à poser) |
| `PrjpParameter` | `PrjPara` | Paramètres carte : dimensions, panélisation, vitesses, marks |
| `JumpParam` | `AutoJumpParam` | Sauts automatiques |
| `MarkParam` | `MarkParameter[]` | Fiducials / marks de repérage |

**Champs de `ChipPara`** (composant + feeder), extraits des binaires :
`PartName`, `GroupName`, `ChipPackage`, `PartNum`, `FeederNum`, `Feeder`, `FeederX`, `FeederY`, `_FeederType`, `FeederTypeShow`, `TapeColor`, `NozzleNo`, `NozzType1`, `NozzType2`, `OrgAngle`, `PickOffset`, `LowSpeed`, `Priority`, `SizeX/Y/Z`, `PCamXYDiff`, `PCamADiff`, `CamThreshold`, `_VisionType`, `SurroundLight`/`CoaxialLight`/`RLight`/`GLight`/`BLight`, et un jeu complet de paramètres pick/mount (`zPickHigh`, `zPickUpSpeed`, `zMountHigh`, `zMountBlowDelay`…). Plus, pour les composants en plateau : `TrayPoint1..4`, `XTotal`, `YTotal`, `Xno`, `Yno`.

**Champs de `MountPara`** (placement) :
`PartName`, position (`System.Drawing.Point` X/Y), `Angle`, `FeederNum`, `FeederIndex`, `MountEnable`, `MountRound`, `ChipPackage`, + sous-liste `BGA_Para` pour les composants à billes.

→ **C'est exactement la donnée produite par la section Machine PnP de V2.** La structure cible est connue ; le seul obstacle est le *format d'écriture* binaire.

### 2.3 La base de composants `PartDB.db` (SQLite)

Bibliothèque partagée (≠ projet). Tables clés :

| Table | Rôle | Lignes |
|---|---|---|
| `KyPackage` | **Bibliothèque packages** : ~150 colonnes (footprint, feeder type, nozzles 1/2, vision, lumières, 10 jeux de paramètres pick/mount, bitmaps) | 3 |
| `KyFeeder` | Types de feeders disponibles | 10 |
| `KyNozzle` | Buses disponibles | 10 |
| `KyPartGroup` | Catégories | 11 |
| `KyVision`, `KyCamType` | Modes vision / caméras | 4 / 3 |
| `KyNameLink` | Alias de noms | 0 |

**Catalogue feeders réel de la machine** (`KyFeeder`) :

| ID | Type | Modèle |
|---|---|---|
| 1 | Tape&Reel | CL8 (8 mm) |
| 2 | Tape&Reel | CL12 |
| 3 | Tape&Reel | CL16 |
| 4 | Tape&Reel | CL24 |
| 5 | Tape&Reel | CL32 |
| 6 | Tape&Reel | CL44 |
| 7 | Tape&Reel | CL56 |
| 8 | Tube | Vibration 3 tubes |
| 9 | Tube | Vibration 5 tubes |
| 10 | Tray | Tray (plateau) |

**Buses réelles** (`KyNozzle`) : `501`, `502`, `503`, `504`, `505`, `506`, `507`, `508`, `511`, `Other`.

**Catégories** (`KyPartGroup`) : Resistor, Capacitor, Diode, SOP, SSOP, SOT, QFP, QFN, BGA, Other, INDUCTOR.

> 💡 Ces valeurs sont **les référentiels exacts** que V2 doit respecter pour que l'export soit accepté sans remappage manuel (noms de feeders `CL8/CL12/…`, noms de nozzles `501..511`, catégories).

### 2.4 Autres fichiers

- `SMT/System/System.ky` : config système (utilisateurs `Admin`/`Operator`, droits `KayoFeeder`, `KayoOpenProject`, `KayoNewProject`…) — binaire .NET également.
- `SMT/System/Basic.xml` : config de base (XML lisible).
- `X轴.prm5` / `Y轴.prm5` : paramètres des axes moteur X/Y.
- `1.ky`, `240701_OLD.ky` : projets exemples (utiles comme **gabarits de référence** pour valider un futur export).
- `YX_SMT1010_25_08_29.rar` : archive (probablement l'installeur du dossier `_CMD`).

---

## 3. La découverte clé : l'import CSV du SMT1010

L'analyse des chaînes de `SMT1010.exe` / `K8ProUI.dll` révèle un **écran d'import dédié** (`BomImport`) avec :

- Filtre de fichier **`*.CSV`**
- Boutons **`OffLineImport`** (« Offline Import ») et **`CoordImport`** (import de coordonnées)
- **`Button_Import_AutoSetColunmHead`** → **auto-mapping des en-têtes de colonnes** (l'utilisateur associe chaque colonne du CSV à un champ machine)
- Gestion rotation à l'import : `CONTEXT_IMPORT_ForWardRotation` / `ReverseRotation` (sens horaire/antihoraire configurable)
- Import séparé des feeders : `FeederImportParam`
- Import bibliothèque : `PartLibraryImport`

### Colonnes cible de l'import (extraites des binaires)

**Table « Chip / Part » (préfixe `Column_PrjC_`)** — la liste des composants + feeder/nozzle :

| Colonne machine | Signification |
|---|---|
| `PartName` | Nom/valeur du composant |
| `Footprint` | Empreinte |
| `FeederNum` | N° de feeder/station |
| `NozleType` | Type de nozzle *(orthographe machine : « Nozle »)* |
| `Quantity` | Quantité |
| `VisionMode` | Mode de vision |

**Table « Mount » (préfixe `Column_PrjMt_`)** — les placements :

| Colonne machine | Signification |
|---|---|
| `Num` | N° d'ordre du point |
| `PartName` | Composant à poser (lien vers la table Chip) |
| `PointX` | Coordonnée X |
| `PointY` | Coordonnée Y |
| `PointR` | Rotation |
| `Nozzle` | Nozzle |
| `ArrayNum` | N° dans le panel (panélisation) |
| `Post` | Poste/tête |
| `Valid` | Actif/ignoré (équivaut au `dnp` de V2) |

→ **Conclusion : on n'écrit pas le `.ky`. On exporte un CSV que la machine importe, puis elle (re)construit le projet en interne.**

---

## 4. Ce que PCB Production V2 possède déjà

| Donnée SMT1010 requise | Source dans V2 | Statut |
|---|---|---|
| Coordonnée X (`PointX`) | `BomItem.x` (Float) | ✅ présent |
| Coordonnée Y (`PointY`) | `BomItem.y` (Float) | ✅ présent |
| Rotation (`PointR`) | `BomItem.rotation` (Integer) | ✅ présent |
| Face (top/bottom) | `BomItem.placement_side` | ✅ présent |
| Empreinte (`Footprint`) | `BomItem.footprint_pnp` | ✅ présent |
| Référence/désignateur (`Num`/lien) | `BomItem.reference_item` | ✅ présent |
| Composant à ignorer (`Valid`) | `BomItem.dnp` (Boolean) | ✅ présent (inverser) |
| Valeur/nom (`PartName`) | `BomItem.value_harmonized` | ✅ présent |
| Quantité (`Quantity`) | `BomItem.quantity` | ✅ présent |
| Affectation **feeder/station** | `assignment_planning` → `build_slot_payload` (`position`, `slot_start`, `feeder_size_mm`) | ✅ produit par l'optimiseur |
| **Nozzle** | `serveur/src/utils/nozzles.py` + `PnpMachine.num_nozzles` | ✅ présent |
| Type feeder (CL8/CL12…) | `serveur/src/utils/feeder_types.py` + `PnpFeeder.size_mm` | ⚠️ à mapper vers nommage `CLxx` |

**Modèles concernés** : `serveur/src/models/bom.py` (`BomItem`), `serveur/src/models/machines.py` (`PnpMachine`, `PnpFeeder`, `PnpCart`), services `assignment_planning.py` / `assignment_helpers.py` / `assignment_fixed_feeders.py`.

**Front** : section `client/src/frontend/src/components/machine/` (10 composants : `MachinePnpWorkspace`, `MachinePnpSlotStrip`, `MachinePnpTables`, `MachineImplantationPanel`…) + page `pages/MachinePnpPage.jsx`.

→ **Aucune donnée manquante de fond.** Le travail est de la *transformation/export*, pas de la collecte.

---

## 5. Écarts & points de vigilance (à résoudre avant export fiable)

1. **Origine et unités des coordonnées.** V2 stocke X/Y issus du fichier P&P (souvent en mm, origine = origine CAO). La machine attend des coordonnées dans **son** repère (origine machine/PCB, sens d'axe). Il faudra un **offset + éventuelle inversion d'axe** paramétrables (les marks/fiducials servent de calage côté machine, mais le repère d'entrée doit être cohérent).

2. **Convention de rotation.** La machine expose `ForWardRotation`/`ReverseRotation` à l'import → le sens (horaire vs trigo) et l'angle de référence (`OrgAngle` par package) diffèrent fréquemment entre CAO et machine. À valider sur 2-3 composants asymétriques (SOT, QFP).

3. **Nommage des feeders.** V2 raisonne en `size_mm` (8/12/16…). La machine attend `CL8/CL12/CL16/CL24/CL32/CL44/CL56` (+ Tube/Tray). Prévoir une **table de correspondance** `size_mm → modèle Kayo`.

4. **Nommage des nozzles.** Le référentiel machine est `501..511`. Vérifier que la sortie nozzle de V2 mappe sur ces identifiants (sinon table de correspondance).

5. **Panélisation (`ArrayNum`).** Si V2 raisonne « 1 carte » mais que la machine pose un panel, il faut décider qui gère la répétition (V2 déplie le panel, ou `PrjPara.PcbArray*` côté machine).

6. **Faces top/bottom.** Un job machine = une face. Si une prod V2 mêle 2 faces, prévoir **2 exports CSV** (un par face).

7. **Caractères / encodage.** `value_harmonized` peut contenir des caractères spéciaux (µ, Ω…). CSV en **UTF-8 ou ANSI** selon ce que tolère l'import (la `Language.bin` machine est multilingue) — à tester.

8. **Validation par gabarit.** Les fichiers `1.ky` / `240701_OLD.ky` permettent de **vérifier les valeurs attendues** : ouvrir un de ces projets sur la machine, exporter (si possible) et comparer à un CSV V2 généré pour la même carte.

---

## 6. Chemins d'intégration — comparatif

| # | Approche | Effort | Robustesse | Dépendances | Verdict |
|---|---|---|---|---|---|
| **1** | **Export CSV « format SMT1010 »** (import offline machine) | **Faible-Moyen** | **Élevée** | Aucune (CSV pur, généré par le backend Python) | ✅ **Recommandé** |
| 2 | Générer le `.ky` via micro-pont .NET référençant `K8ProPrj.dll` | Élevé | Élevée (format natif exact) | Exécutable .NET/Windows appelé par le backend ; couplage à la version d'assembly (`1.25.8.26`) | Repli si le CSV s'avère trop limité |
| 3 | Réécrire le `.ky` en Python (parser BinaryFormatter maison) | Très élevé | Faible (fragile, casse à chaque MAJ machine) | — | ❌ À éviter |
| 4 | Écrire dans `PartDB.db` (SQLite) | Faible | Moyenne | Accès fichier sur le PC machine | 🔁 **Complément** : sync bibliothèque packages/feeders, **pas** le placement |

### Recommandation détaillée

**Phase 1 — Export CSV (cœur de l'intégration).**
Ajouter, dans la section Machine PnP, un bouton **« Exporter vers SMT1010 »** qui génère **deux exports cohérents** (ou un CSV combiné si l'import l'accepte) :
- un **CSV « composants »** (PrjC) : `PartName, Footprint, FeederNum, NozleType, Quantity, VisionMode` — alimenté par l'optimiseur feeders/nozzles ;
- un **CSV « placements »** (PrjMt) : `Num, PartName, PointX, PointY, PointR, Nozzle, ArrayNum, Post, Valid` — alimenté par `BomItem` + l'affectation.

Implémentation côté backend : nouveau service `serveur/src/services/smt1010_export_service.py` + route `GET /api/.../export/smt1010` renvoyant le(s) CSV. Tables de correspondance feeders/nozzles dans `serveur/src/utils/`.

**Phase 2 — Sync bibliothèque (option 4, complémentaire).**
Si l'on veut éviter la re-saisie des packages sur la machine, un utilitaire pourra alimenter `KyPackage`/`KyFeeder` de `PartDB.db` depuis la bibliothèque composants V2. À faire **après** la Phase 1, et seulement si la friction de saisie le justifie.

**Phase 3 — Repli `.ky` (option 2).**
Seulement si l'import CSV ne permet pas de figer certains paramètres critiques (offsets, vitesses par package). On encapsulerait alors un petit pont C# autour de `K8ProPrj.dll`.

---

## 7. Prochaines étapes (avant tout code)

1. **Valider l'écran d'import réel** (bloquant non technique) : sur le PC machine, ouvrir *Offline Import / Coord Import*, noter l'ordre exact des colonnes, le séparateur attendu, l'encodage, et si composants + placements vont dans **un** ou **deux** fichiers. → idéalement un **screenshot** de l'écran d'import + un CSV exemple exporté par la machine elle-même.
2. **Récupérer un CSV de référence** : si le SMT1010 peut *exporter* un projet en CSV, c'est le gabarit parfait à imiter.
3. **Caler 1 carte pilote** : choisir une carte simple déjà produite, générer le CSV V2, l'importer sur la machine, vérifier 3 composants asymétriques (rotation/offset).
4. **Décider philosophie A vs B** (§2.1) : feeders figés par V2, ou optimisation laissée à la machine.
5. Puis : `engineering:system-design` pour le service d'export, `TaskCreate` du plan d'implémentation, dev + tests.

---

## 8. Annexe — méthode d'analyse

Analyse statique uniquement (binaires non exécutés) :
- `file` + `strings` sur `SMT1010.exe`, `K8ProPrj.dll`, `K8ProUI.dll` → classes `KayoFile.*`, champs `ChipPara`/`MountPara`, colonnes d'import `Column_PrjC_*` / `Column_PrjMt_*`.
- `sqlite3` sur `PartDB.db` → schéma + référentiels feeders/nozzles/catégories.
- Lecture `SMT1010.exe.config` (runtime .NET, chemins logs).
- Côté V2 : lecture `models/bom.py`, `models/machines.py`, `services/assignment_*`, inventaire `components/machine/`.

Limites : le logiciel n'a pas été exécuté ; l'ordre/format précis des colonnes d'import doit être confirmé sur la machine (cf. §7).
