# ECB Production Manager

Application de gestion de production PCB — Windows desktop.

**Stack** : FastAPI (Python) · React 18 · Electron · SQLite/SQL Server

---

## Démarrage rapide

### 1. Installation (première fois)

```
Double-cliquer : serveur\INSTALLER_SERVEUR.bat
```

Puis installer les dépendances client :
```powershell
cd client\src\frontend && npm install
cd client\src\desktop && npm install
```

### 2. Lancer le serveur

```
Double-cliquer : serveur\DEMARRER_SERVEUR.bat
```

API disponible sur http://localhost:8000  
Swagger : http://localhost:8000/docs

### 3. Lancer le client

```
Double-cliquer : client\DEMARRER_CLIENT.bat
```

Interface sur http://localhost:3000 — **utiliser Google Chrome**.

### 4. Build exe client (déploiement)

```
Double-cliquer : client\CONSTRUIRE_CLIENT.bat
```

Produit `client\dist\ECB Production Manager.exe` (portable).

---

## Configuration

| Fichier | Rôle |
|---|---|
| `serveur\.env` | IP, port, DB, CORS — **éditer avant de démarrer** |
| `client\client.env` | URL du serveur API — **éditer pour réseau** |

---

## Déploiement réseau

1. Éditer `serveur\.env` : `CORS_ORIGINS` avec l'IP client
2. Éditer `client\client.env` : `REACT_APP_API_URL=http://IP_SERVEUR:8000`
3. Rebuild client : `client\CONSTRUIRE_CLIENT.bat`
4. Démarrer serveur sur le serveur, distribuer l'exe client

---

## Documentation

- `CLAUDE.md` → process de travail AI
- `STRUCTURE.md` → structure des dossiers (loi)
- `APP_DESCRIPTION.md` → description complète app
- `docs/` → specs, guides, rapports d'audit
