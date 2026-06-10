# SPÉCIFICATIONS - PCB Flow Production Suite

**Date** : 18/03/2026  
**Version** : 1.0 MVP  
**Responsable** : Équipe Développement  

---

## 📋 TABLE DES MATIÈRES
1. [Vue d'ensemble](#vue-densemble)
2. [Module BOM](#module-bom)
3. [Module Marketplace](#module-marketplace)
4. [Module PnP](#module-pnp)
5. [Module Database](#module-database)
6. [Module Paramètres](#module-paramètres)

---

## VUE D'ENSEMBLE

### Objectifs
- **Automatiser** la gestion des BOM (import, harmonisation, versioning)
- **Optimiser** la sourcing de composants (sélection fournisseur flexible)
- **Faciliter** la production (assignment feeder auto, planning PnP)
- **Centraliser** toutes les données en base de données SQL Server

### Cas d'usage principaux
1. **Technicien production** : importe BOM Eagle → harmonise → crée commande → génère planning PnP
2. **Acheteur** : accède à la liste de commande, vérifie disponibilités, exporte en Excel
3. **Gestionnaire DB** : met à jour composants, footprints, machines PnP

### Périmètre MVP
- ✅ **BOM** : import, harmonisation, versioning
- ✅ **Marketplace** : liste commande, export Excel
- ✅ **PnP** : assignment feeder, planning production
- ✅ **Database** : gestion manuelle données
- ✅ **Settings** : configuration
- ❌ **APIs fournisseurs** → Phase 2
- ❌ **Costing avancé** → Phase 2

---

## MODULE BOM

### 1.1 Import BOM Eagle

#### Entrée
- Fichier `.txt` exporté depuis Eagle (format spécifique à valider)
- Sélection du type : **TOP** ou **BOT**
- Référence carte (ex: `KT123456_Carriere_Board`)
- Révision (ex: `REV_A`, `REV_B`)

#### Processus
```
1. Lecture fichier .txt
2. Parse colonnes (Référence, Valeur, Footprint, Quantité, etc.)
3. Détection des composants (DNP = Do Not Place)
4. Validation format
5. Stockage en BDD (table BOM_ITEMS)
```

#### Sortie
- BOM importée en base de données
- Statut : ✅ OK ou ⚠️ ERREURS (affiche liste des problèmes)
- Suggestion de correction (harmonisation)

---

### 1.2 Harmonisation Composants

#### Règles initiales (à compléter)
| Entrée | Sortie | Type |
|--------|--------|------|
| `nf`, `NF`, `Nf` | `nF` | Capacité |
| `uf`, `UF`, `Uf` | `µF` | Capacité |
| `r`, `R` (valeur uniquement) | `Ω` | Résistance |
| `k`, `K` (ex: 10k) | `kΩ` | Résistance (kilo) |
| `m`, `M` (ex: 1m) | `mΩ` | Résistance (milli) |
| Pas d'unité (ex: `10k2`) | unité calculée | Auto-détect |

**À compléter avec vous** : liste complète des cas réels rencontrés

#### Processus
```
1. Extraction valeur + unité
2. Application règles harmonisation
3. Validation (numérique, gamme connue)
4. Affichage avant/après (user review)
5. Confirmation ou correction manuelle
```

#### Stockage
```sql
-- Peut être stocké comme:
component_value = "4.7kΩ" (harmonisé)
component_value_raw = "4k7" (original Eagle)
```

---

### 1.3 Organisation et Versioning

#### Structure fichiers
```
BDD (SQL Server)
└── Cartes (table BOM_REFERENCES)
    └── KT123456_Carriere_Board
        ├── REV_A
        │   ├── BOM_TOP (50 items)
        │   └── BOM_BOT (35 items)
        ├── REV_B
        │   ├── BOM_TOP (52 items)
        │   └── BOM_BOT (35 items)
        └── REV_C (current)
            ├── BOM_TOP
            └── BOM_BOT

-- En local (export):
/BOM/KT123456_Carriere_Board/REV_A/BOM_TOP.txt
/BOM/KT123456_Carriere_Board/REV_A/BOM_BOT.txt
/BOM/KT123456_Carriere_Board/REV_B/BOM_TOP.txt
/BOM/KT123456_Carriere_Board/REV_B/BOM_BOT.txt
```

#### Import multi-cartes
- Télécharger ZIP contenant plusieurs BOM
- Format : `KT??????_*_TOP.txt` et `KT??????_*_BOT.txt`
- Tri automatique par référence carte
- Import batch (transaction SQL unique)

---

### 1.4 Données BOM (schéma BDD)

```sql
-- Table: BOM_REFERENCES
CREATE TABLE BOM_REFERENCES (
    id INT PRIMARY KEY,
    reference VARCHAR(50) UNIQUE,  -- ex: KT123456_Carriere_Board
    description VARCHAR(255),
    created_at DATETIME,
    updated_at DATETIME
);

-- Table: BOM_REVISIONS
CREATE TABLE BOM_REVISIONS (
    id INT PRIMARY KEY,
    bom_ref_id INT,
    revision VARCHAR(20),  -- REV_A, REV_B, etc
    type VARCHAR(10),  -- TOP ou BOT
    created_at DATETIME,
    status VARCHAR(20),  -- DRAFT, ACTIVE, ARCHIVED
    FOREIGN KEY (bom_ref_id) REFERENCES BOM_REFERENCES(id)
);

-- Table: BOM_ITEMS
CREATE TABLE BOM_ITEMS (
    id INT PRIMARY KEY,
    bom_revision_id INT,
    reference_item VARCHAR(50),  -- R1, U2, C5, etc
    value_raw VARCHAR(100),  -- Original: "4k7"
    value_harmonized VARCHAR(100),  -- "4.7kΩ"
    footprint_eagle VARCHAR(100),  -- "0805", "LQFP48"
    footprint_pnp VARCHAR(100),  -- Mapping PnP
    quantity INT,
    dnp BOOLEAN DEFAULT 0,  -- Do Not Place
    notes TEXT,
    FOREIGN KEY (bom_revision_id) REFERENCES BOM_REVISIONS(id)
);

-- Table: COMPONENTS
CREATE TABLE COMPONENTS (
    id INT PRIMARY KEY,
    reference VARCHAR(100) UNIQUE,  -- Ex: "RESC0805"
    value VARCHAR(100),  -- Valeur standard (ex: "4.7kΩ")
    package VARCHAR(50),  -- "0805", "0603", "LQFP48"
    supplier_code VARCHAR(100),  -- Code interne ou fournisseur
    description TEXT,
    notes TEXT
);

-- Table: FOOTPRINT_MAPPING
CREATE TABLE FOOTPRINT_MAPPING (
    id INT PRIMARY KEY,
    footprint_eagle VARCHAR(100),
    footprint_pnp VARCHAR(100),
    machine_compatible VARCHAR(50),  -- Numéro machine
    notes TEXT
);
```

---

## MODULE MARKETPLACE

### 2.1 Créer une Liste de Commande

#### Entrée
- Sélection 1 ou plusieurs BOM (par référence + révision)
- Quantité à produire par carte (ex: 10 cartes KT123456)
- Sélection TOP, BOT ou BOTH

#### Processus
```
1. Récupère tous les items BOM sélectionnés
2. Agrège par composant (deduplicate)
3. Multiplie par quantité produite
4. Agrège si même composant sur TOP et BOT
5. Calcule total par composant
```

#### Exemple
```
BOM: KT123456_REV_A (10 cartes)
├── TOP: C1=0.1µF (qty 10)
├── TOP: R1=10kΩ (qty 10)
├── BOT: C2=100µF (qty 10)
└── BOT: U1=ATmega328 (qty 10)

Agrégation:
- 0.1µF: 10 pcs
- 10kΩ: 10 pcs
- 100µF: 10 pcs
- ATmega328: 10 pcs
```

### 2.2 Export Excel

#### Format
- Une ligne par composant
- Colonnes : Référence, Valeur harmonisée, Nombre, Footprint, Notes
- Compatibilité import ERP (format à définir avec vous)
- Exportable : `Commande_2026-03-18_KT123456.xlsx`

#### Contenu
```
Référence | Valeur | Quantité | Package | Notes
----------|--------|----------|---------|-------
C1        | 0.1µF  | 10       | 0603    |
R1        | 10kΩ   | 10       | 0805    |
U1        | STM32  | 10       | LQFP48  | Microcontrôleur
DNP       | -      | 0        | -       | Composants non placés
```

### 2.3 Sélection Fournisseur (Phase 2)

À laisser pour phase 2 (avec APIs). MVP = pas d'intégration fournisseur.

---

## MODULE PnP

### 3.1 Sélection Machine PnP

#### Données requises
- 2-3 machines PnP avec noms (ex: "Neoden NLX600", "Juki APX", etc.)
- Capacités par machine :
  - Nombre emplacements feeders
  - Type feeder supportés (8mm, 12mm, 16mm...)
  - Vitesse de placement (placements/heure) - optionnel MVP
  - Position de chaque emplacement (X, Y) - optionnel MVP

---

### 3.2 Assignment Feeder Automatique

#### Entrée
- BOM sélectionnée
- Machine PnP choisie
- Type de production : TOP, BOT ou BOTH

#### Processus
```
1. Récupère liste composants de la BOM
2. Récupère liste feeders disponibles (8mm, 12mm, 16mm)
3. Récupère capacité machine (ex: 60 emplacements)
4. Problème de bin packing:
   - Assigner chaque composant à un feeder
   - Respecter limites emplacements
   - Prioriser feeders moins coûteux (si multi-options)
   - Regrouper composants similaires si possible
5. Génère affectation (position 1-60 → composant)
```

#### Algorithme (simplifié)
```
FOR EACH composant IN BOM:
  - Identifier taille package (0603, 0805, LQFP48, ...)
  - Trouver feeder compatible (si plusieurs, choisir le moins cher)
  - Assigner à première position libre sur machine
  - SI pas de place : alerte et proposition split sur 2ème machine

OUTPUT: 
- Feeder assignment (position → composant)
- Graphe visuel machine (vue de dessus avec feeders)
- Alertes si problèmes
```

### 3.3 Plan de Production

#### Contenu (à définir précisément plus tard)
- Ordre de placement (par position feeder)
- Temps estimé de production
- Notes d'assemblage especiales
- Graphe machine (position feeder → composant visuel)

#### Format de sortie
- Fiche de production PDF
- Fichier de configuration machine (format propriétaire selon machine)
- Dashboard temps réel (optionnel MVP)

---

## MODULE DATABASE

### 4.1 Gestion Composants

#### Fonction
- Créer, modifier, supprimer composants
- Recherche rapide par référence/valeur
- Import/export Excel

#### Données par composant
- Référence
- Valeur standard
- Package(s) compatible(s)
- Notes (type, fournisseur par défaut, etc.)

### 4.2 Gestion Footprints

#### Fonction
- Mapping Eagle ↔ PnP
- Créer manuellement via UI
- Import Excel
- Suppression/modification

#### Données
- Footprint Eagle (ex: "0805", "LQFP48")
- Footprint PnP (code interne, ex: "TH_0805")
- Machine(s) compatible(s)
- Notes

### 4.3 Gestion Machines PnP

#### Fonction
- Ajouter/modifier/supprimer machines
- Définir emplacements feeders
- Types feeders supportés

#### Données
- Nom machine
- Nombre emplacements
- Types feeders (8mm, 12mm, 16mm)
- Notes

---

## MODULE PARAMÈTRES

### 5.1 Configuration Base de Données

- **Serveur SQL** : adresse, port, login, password
- **Base de données** : nom
- **Test de connexion** : ✅ / ❌

### 5.2 Fichiers

- **Dossier de stockage** : chemins d'import/export BOM
- **Backup** : contrôle Manuel

### 5.3 Clés API (Phase 2)

- Farnell API key
- Digi-Key API key
- RS API key
- Mouser API key

---

## 📊 RÉSUMÉ DES TABLES BDD

| Table | Fonction |
|-------|----------|
| `BOM_REFERENCES` | Références cartes |
| `BOM_REVISIONS` | Révisions BOM (A, B, C) |
| `BOM_ITEMS` | Composants dans chaque BOM |
| `COMPONENTS` | Base composants (library) |
| `FOOTPRINT_MAPPING` | Mapping Eagle → PnP |
| `PNP_MACHINES` | Machines disponibles |
| `PNP_FEEDERS` | Types feeders (8mm, 12mm, 16mm) |
| `COMMANDS` | Listes de commande |
| `COMMAND_ITEMS` | Items dans commande |
| `PRODUCTION_PLANS` | Plans de production (PnP) |

---

## ⏭️ PROCHAINES ÉTAPES

1. **Valider** ce document avec vous
2. **Détailler** :
   - Format exact fichier BOM Eagle (.txt)
   - Liste complète règles harmonisation
   - Structure exacte export Excel
   - Détails "plan de production"
3. **Commencer code** avec architecture tech

