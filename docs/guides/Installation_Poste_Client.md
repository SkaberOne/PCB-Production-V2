# Installation d'un poste Client — PCB Flow Production Suite

> Mise en service d'un nouveau poste **Client** (utilisation quotidienne de
> l'application), connecté à la base **SQL Server partagée** du poste **Host**.
> Contexte technique complet : `DEPLOYMENT.md` et ADR 0008 / 0009.

## Rôles

- **Host** : le PC central qui héberge SQL Server (base `ECB_Production`) et sert
  tous les postes. Host actuel : **`192.168.5.44`** (port TCP **1433**).
- **Client** : chaque poste qui exécute l'application. Il embarque son propre
  moteur (`pcb-flow-server.exe`) mais tape la base partagée du Host. Le Host n'a
  **pas** besoin que l'app soit ouverte : il suffit que le service SQL Server
  tourne.

## Prérequis sur le poste Client

1. Être sur le même réseau que le Host. Vérifier :
   ```powershell
   Test-NetConnection 192.168.5.44 -Port 1433   # doit renvoyer TcpTestSucceeded : True
   ```
2. Droits **administrateur** (l'installeur pose l'app + le driver ODBC en
   machine-wide, `perMachine: true` — ADR 0009).
3. Récupérer le dernier installeur `PCB Flow Production Suite Setup x.y.z.exe`
   (voir « Où récupérer les binaires » en bas).

## Étape 1 — Installer l'application

Lancer `PCB Flow Production Suite Setup x.y.z.exe` → accepter l'UAC → choisir le
profil **Client** → installer.

Le pilote **ODBC Driver 17 for SQL Server** est installé **automatiquement** par
l'installeur (`nsis/install_odbc.ps1`, idempotent) : depuis le MSI embarqué si
présent, sinon téléchargé chez Microsoft. Aucune manip driver si le poste a un
accès internet. En cas d'échec, voir « Dépannage ».

## Étape 2 — Configurer la connexion à la base

Au 1er lancement (ou plus tard via **Paramètres › Connexion base de données**),
renseigner :

| Champ | Valeur |
|---|---|
| Serveur (hôte) | `192.168.5.44` |
| Port | `1433` |
| Utilisateur | `pcbflow` |
| Mot de passe | *(fourni par l'administrateur — défini à l'installation du Host ; non versionné pour raison de sécurité)* |
| Base | `ECB_Production` |
| Driver | `ODBC Driver 17 for SQL Server` |

→ **Tester la connexion** (doit réussir) → **Enregistrer & redémarrer**. L'app
démarre sur la base partagée.

## Dépannage

- **Test de connexion échoue** : vérifier le réseau
  (`Test-NetConnection 192.168.5.44 -Port 1433`), que le service SQL Server tourne
  sur le Host, et que la règle de pare-feu « PCBFlow SQL Server 1433 » est active
  côté Host.
- **Driver ODBC absent** (l'auto-install a échoué, ex. poste hors-ligne) :
  installer manuellement ODBC 17 (msodbcsql, x64) depuis Microsoft, puis relancer
  l'app. Lien ci-dessous.
- **SmartScreen « éditeur inconnu »** au 1er lancement : *Informations
  complémentaires → Exécuter quand même* (ou signer l'app, cf. `DEPLOYMENT.md`).
- Journaux d'installation : `%PROGRAMDATA%\PCBFlow\install_odbc.log`.

## Où récupérer les binaires

Les installeurs sont des **binaires** : ils ne sont **pas** versionnés dans le
dépôt (ADR 0009) mais publiés dans **GitHub Releases**
(`SkaberOne/PCB-Production-V2`, générés par `npm run publish`).

- **Application** : `PCB Flow Production Suite Setup x.y.z.exe` → GitHub Releases.
- **Driver ODBC 17** (pour une install hors-ligne) : téléchargement Microsoft,
  fichier `msodbcsql.msi` x64 :
  https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server

> ⚠️ Si l'IP du Host change (bail DHCP), tous les Clients perdent la connexion.
> Prévoir une **IP fixe / réservation DHCP** pour le Host (`192.168.5.44`).
