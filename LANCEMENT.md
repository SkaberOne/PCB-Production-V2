# 🚀 Quel script lancer ?

Fiche mémo des scripts de commande du projet. Double-cliquez sur le fichier indiqué.

---

## Au quotidien — version web (celle que tout le monde utilise)

| Je veux… | Fichier à lancer |
|---|---|
| **Démarrer la PROD** (port 8000) | `serveur\DEMARRER_SERVEUR_WEB.bat` |
| **Reconstruire la prod** après un changement de code | `client\CONSTRUIRE_WEB.bat` puis relancer le serveur ci-dessus |
| **Démarrer le TEST / staging** (port 8001, base isolée) | `serveur\DEMARRER_SERVEUR_WEB_STAGING.bat` |
| **Reconstruire le staging** | `client\CONSTRUIRE_WEB_STAGING.bat` |

> Adresse prod : `http://LAPTOP-053:8000` (clé `pcbflow-lan-2026`)
> Adresse test : `http://LAPTOP-053:8001` (clé `pcbflow-staging`)
> Après un nouveau build, faire **Ctrl+Shift+R** dans le navigateur pour vider le cache.

## Installation / mise en place

| Je veux… | Fichier à lancer |
|---|---|
| Installer / réparer les dépendances serveur (venv) | `serveur\INSTALLER_SERVEUR.bat` |

## Utilitaires (racine)

| Je veux… | Fichier à lancer |
|---|---|
| Pousser mes commits vers GitHub | `auto_push.bat` |
| Tester rapidement que l'API répond | `test_api.bat` (serveur doit tourner sur :8000) |

## Version desktop / `.exe` — rare (futures releases seulement)

Ces scripts sont rangés à part car **personne n'utilise l'app installable** pour l'instant ; tout le monde passe par la page web. Ils restent disponibles pour produire une release `.exe` plus tard.

| Je veux… | Fichier |
|---|---|
| Builder le backend embarqué (PyInstaller) | `serveur\_desktop\CONSTRUIRE_SERVEUR.bat` |
| Lancer le serveur en mode dev (:8000) | `serveur\_desktop\DEMARRER_SERVEUR.bat` |
| Builder le client portable | `client\_desktop\CONSTRUIRE_CLIENT.bat` |
| Lancer le client Electron / dev | `client\_desktop\DEMARRER_CLIENT.bat` |

> Release complète auto-update = `CONSTRUIRE_SERVEUR` puis `npm run dist` dans `client\src\desktop` (voir `docs/`).

---

_Scripts historiques encore archivés : `docs\archive\legacy-scripts\`._
