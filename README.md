# PCB Flow Production Suite

Application **Windows desktop** pour piloter le flux de production de cartes
électroniques (PCB) en atelier : de l'import des **BOM** (Bill of Materials)
jusqu'à la configuration des machines **Pick & Place**.

> **Version courante : 1.0.0** · Application autonome, installable, à mise à jour
> automatique. Stack : Electron · React 18 · FastAPI (Python) · SQLite / SQL Server.

---

## Ce que fait l'application

- **Import de BOM** (Eagle, Excel, CSV) avec révisions et historique
- **Harmonisation** des références composants entre formats fournisseurs
- **Bibliothèque** centralisée des composants et des BOM enregistrées
- **Calcul des besoins** composants par production
- **Préparation des commandes** composants avec export ERP (Excel)
- **Configuration des machines PnP** (feeders fixes/variables, chariots)
- **Coût de revient** par carte (« Prix carte »)
- **Suivi** des productions

---

## Installation

1. Télécharger le dernier installeur depuis la page
   **[Releases](https://github.com/SkaberOne/PCB-Production-V2/releases/latest)** :
   `PCB Flow Production Suite Setup x.y.z.exe`.
2. Lancer l'installeur (installation par utilisateur, **sans droits
   administrateur**), puis ouvrir l'app depuis le **raccourci Bureau**.
3. Double-clic → l'application démarre seule (le moteur de production est
   embarqué, rien d'autre à installer).

### Configuration de la base de données

Au premier lancement, un fichier de configuration est créé dans
`%APPDATA%\PCB Flow Production Suite\server\.env`.

- **Mono-poste** : une base **SQLite** locale (par défaut).
- **Multi-postes** : renseigner la connexion **SQL Server central** dans ce
  `.env` (prérequis : **ODBC Driver 17** sur chaque poste). Voir
  [`docs/guides/DEPLOYMENT.md`](docs/guides/DEPLOYMENT.md).

---

# Guide d'utilisation

Guide pratique pour l'opérateur. L'application accompagne une production, de
l'import de la BOM jusqu'à la configuration des machines Pick & Place.

## 1. Démarrer l'application

Double-cliquez sur le raccourci **PCB Flow Production Suite** (Bureau ou menu
Démarrer). Un court écran « Démarrage… » s'affiche, puis l'écran **Productions**
apparaît.

> Si l'écran « Backend indisponible » apparaît : la base de données n'est pas
> joignable. En multi-postes, vérifiez la connexion au serveur SQL (voir §8).

## 2. Comprendre l'écran

- **Barre du haut** : le **workflow en 5 étapes** (Productions → Import BOM →
  Revue BOM → Commande → Machine PnP). Les étapes se cochent en vert au fil de
  l'avancement.
- **Menu de gauche** :
  - *Workflow* : les 5 étapes de production.
  - *Bibliothèque* : Prix carte · BOM enregistrées · Base de données.
  - *Système* : Paramètres.
- **Bas de gauche** : la **production active** en cours.

## 3. Le workflow de production

**Étape 1 — Productions.** Point de départ. Créez une nouvelle production
(**+ Nouvelle production**) ou **chargez-en une existante** pour reprendre le
travail. La production active sert de contexte à toutes les étapes suivantes.

**Étape 2 — Import BOM.** Importez le ou les fichiers **BOM** de la carte (Eagle,
Excel, CSV). L'application **harmonise** les références et signale les
**composants manquants** (à compléter dans le catalogue) et les **empreintes
PnP** non renseignées. Complétez ce qui manque pour pouvoir continuer.

**Étape 3 — Revue BOM.** Passez la BOM **ligne par ligne** : vérifiez les
composants, **validez le stock** (la ligne passe au vert quand le besoin est
couvert), marquez les lignes non montées (DNP). Export CSV possible.

**Étape 4 — Commande.** L'application calcule la **liste des composants à
commander** à partir des BOM de la production (avec prix/disponibilité
fournisseurs si configurés). Saisissez les quantités reçues, puis **générez
l'export ERP** (Excel).

**Étape 5 — Machine PnP.** Configurez la ligne **Pick & Place** : machines,
**feeders** (fixes/variables), chariots, plan d'implantation. Cette étape prépare
le passage en machine.

## 4. Bibliothèque

- **Prix carte** : calcule le **coût de revient** d'une carte (matière + main
  d'œuvre + frais), en HT/TTC, et conserve un **historique de prix** par carte.
- **BOM enregistrées** : bibliothèque des BOM déjà importées (arborescence +
  détail des révisions). Bouton **Ouvrir** pour recharger une révision.
- **Base de données** : catalogue des composants, empreintes machine, règles de
  typage et d'harmonisation.

## 5. Paramètres

Référentiels et options : catalogue composants, empreintes machine, valeurs par
défaut de l'export ERP, connecteurs fournisseurs (Mouser, DigiKey…).

## 6. Mises à jour

L'application se met à jour **toute seule** : au démarrage, elle vérifie s'il
existe une nouvelle version ; vous pouvez aussi vérifier à tout moment via
**Aide → Rechercher les mises à jour**. Quand une mise à jour est prête, elle
propose de **redémarrer pour l'installer**.

## 7. Bonnes pratiques

- Travaillez toujours **dans une production active** (chargez-la avant l'import).
- Complétez les **composants/empreintes manquants** signalés à l'import : ils
  bloquent les étapes suivantes.
- **Validez le stock** en Revue BOM avant de générer la commande.
- En multi-postes, les données sont **communes** : une modification est visible
  par les collègues.

## 8. En cas de souci

| Symptôme | Que faire |
|---|---|
| « Backend indisponible » au démarrage | Base injoignable. Multi-postes : vérifier le serveur SQL et le réseau ; pilote **ODBC Driver 17** installé. |
| « Network Error » / données qui ne chargent pas | Fermer puis relancer l'application. |
| Une production semble figée | Recharger la production depuis l'écran Productions. |
| Doute sur la version | Menu **Aide → À propos**. |

---

## Architecture

```
┌──────────── Poste Windows ────────────┐
│  PCB Flow Production Suite (Electron)  │
│   ├─ Interface React 18 (MUI)         │
│   └─ lance → backend FastAPI packagé  │
│        (PyInstaller, 127.0.0.1)       │
└───────────────────┬───────────────────┘
                    │ ODBC / SQLite
                    ▼
        Base SQLite locale  ou  SQL Server central
```

Chaque poste exécute son interface **et** son backend local ; seule la **donnée**
est centralisée (SQL Server) en multi-postes. Les mises à jour poussent
l'interface et le backend **d'un seul bloc** (electron-updater + GitHub Releases).

---

## Développement

Prérequis : Windows 10/11, Python 3.11+, Node.js 18+, Google Chrome.

```powershell
# Backend (crée .venv + dépendances)
.\serveur\INSTALLER_SERVEUR.bat
.\serveur\DEMARRER_SERVEUR.bat            # API sur http://localhost:8000 (/docs)

# Frontend (React, port 3000)
.\client\DEMARRER_CLIENT.bat

# Tests
.venv\Scripts\pytest serveur\src\tests\ -v
cd client\src\frontend ; npm test
```

### Construire & publier

```powershell
.\serveur\CONSTRUIRE_SERVEUR.bat          # backend → dist\pcb-flow-server
cd client\src\desktop ; npm run dist      # installeur (NSIS + portable)
cd client\src\desktop ; npm run publish   # publie une Release (GH_TOKEN requis)
```

Détails : [`docs/guides/DEPLOYMENT.md`](docs/guides/DEPLOYMENT.md) ·
check-list : [`docs/guides/Deploiement_Checklist_GoLive.md`](docs/guides/Deploiement_Checklist_GoLive.md).

---

## Documentation technique

| Fichier | Rôle |
|---|---|
| [`docs/Projet.md`](docs/Projet.md) | Description technique (vision, archi, modèle de données) |
| [`docs/guides/DEPLOYMENT.md`](docs/guides/DEPLOYMENT.md) | Build, packaging, mises à jour, base de données |
| [`docs/adr/`](docs/adr/) | Décisions d'architecture (ADR) |
| `STRUCTURE.md` | Organisation des dossiers du projet |
| `CLAUDE.md` | Process de travail assisté par IA |

---

*Outil métier interne — gestion de production PCB.*
