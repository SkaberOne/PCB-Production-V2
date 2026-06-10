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

## Installation (utilisateur)

1. Télécharger le dernier installeur depuis la page
   **[Releases](https://github.com/SkaberOne/PCB-Production-V2/releases/latest)** :
   `PCB Flow Production Suite Setup x.y.z.exe`.
2. Lancer l'installeur (installation par utilisateur, **sans droits
   administrateur**), puis ouvrir l'app depuis le **raccourci Bureau**.
3. Double-clic → l'application démarre seule (le moteur de production est
   embarqué, rien d'autre à installer).

> **Mises à jour automatiques** : l'app vérifie les nouvelles versions au
> démarrage et via **Aide → Rechercher les mises à jour**, et propose de les
> installer.

### Configuration de la base de données

Au premier lancement, un fichier de configuration est créé dans
`%APPDATA%\PCB Flow Production Suite\server\.env`.

- **Mono-poste** : une base **SQLite** locale (par défaut).
- **Multi-postes** : renseigner la connexion **SQL Server central** dans ce
  `.env` (prérequis : **ODBC Driver 17** sur chaque poste). Voir
  [`docs/guides/DEPLOYMENT.md`](docs/guides/DEPLOYMENT.md).

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
.\serveur\CONSTRUIRE_SERVEUR.bat          # backend → dist\ecb-server
cd client\src\desktop ; npm run dist      # installeur (NSIS + portable)
cd client\src\desktop ; npm run publish   # publie une Release (GH_TOKEN requis)
```

Détails : [`docs/guides/DEPLOYMENT.md`](docs/guides/DEPLOYMENT.md) ·
check-list : [`docs/guides/Deploiement_Checklist_GoLive.md`](docs/guides/Deploiement_Checklist_GoLive.md).

---

## Documentation

| Fichier | Rôle |
|---|---|
| [`docs/guides/Manuel_Utilisation.md`](docs/guides/Manuel_Utilisation.md) | **Manuel d'utilisation** (opérateur) |
| [`docs/Projet.md`](docs/Projet.md) | Description technique (vision, archi, modèle de données) |
| [`docs/guides/DEPLOYMENT.md`](docs/guides/DEPLOYMENT.md) | Build, packaging, mises à jour, base de données |
| [`docs/adr/`](docs/adr/) | Décisions d'architecture (ADR) |
| `STRUCTURE.md` | Organisation des dossiers du projet |
| `CLAUDE.md` | Process de travail assisté par IA |

---

*Outil métier interne — gestion de production PCB.*
