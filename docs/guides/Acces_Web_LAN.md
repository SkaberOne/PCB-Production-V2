# Accès web LAN — un collègue utilise l'app depuis son navigateur

Ce mode permet à des collègues d'utiliser PCB Flow **depuis un simple navigateur**,
sans installer l'application desktop, sur le **réseau interne (LAN)** de la société.

## Principe

Un poste « serveur » fait tourner le backend FastAPI qui sert **à la fois l'interface
web ET l'API** sur le **même port (8000)**. Le frontend appelle l'API en chemin relatif
(`/api`) → même origine, donc **aucun CORS** et **aucune IP à coder en dur**. Une **clé
API partagée** (`X-API-Key`) sert de barrière d'accès.

```
Collègue (navigateur)  ─HTTP :8000─▶  Poste serveur (backend + build web)  ──▶  SQL Server
        http://IP-DU-POSTE:8000/
```

## Mise en place (sur le poste serveur)

1. **Construire le build web** — `client\CONSTRUIRE_WEB.bat`
   Produit `client\src\frontend\build-web\` (build séparé du desktop). Configuré par
   `client\web.env` (`REACT_APP_API_URL=/api`, `REACT_APP_API_KEY=...`).

2. **Démarrer le serveur** — `serveur\DEMARRER_SERVEUR_WEB.bat`
   Lance le backend sur `0.0.0.0:8000` en servant `build-web`, avec `API_KEY` exigée.

3. **Ouvrir le port 8000 au pare-feu** (une fois) :
   ```
   netsh advfirewall firewall add rule name="PCB Flow Web 8000" dir=in action=allow protocol=TCP localport=8000
   ```

4. **Côté collègue** : ouvrir `http://<nom-ou-IP-du-poste>:8000/` dans le navigateur.
   À la **première visite**, une petite fenêtre demande la **clé d'accès**. Une fois
   saisie, elle est **mémorisée sur son navigateur** (localStorage) : il ne la ressaisit
   plus, il a accès en permanence.

## Clé d'accès

La clé n'est **plus** incluse dans le build. Elle est définie **uniquement côté serveur** :
- `serveur\DEMARRER_SERVEUR_WEB.bat` → `set "API_KEY=..."`

Le collègue la saisit une fois dans la fenêtre d'accès (elle est fournie par
l'administrateur). Si la clé serveur change, chaque collègue devra la ressaisir à la
prochaine requête (le serveur renvoie 401 → la fenêtre réapparaît).

Détails techniques : le client lit la clé dans `localStorage` (`pcbflow_api_key`) et
l'envoie en en-tête `X-API-Key` ; sur un 401, la fenêtre de saisie se ré-affiche.

⚠️ **Portée sécurité** : clé **partagée** (la même pour tout le monde), pas
d'utilisateurs individuels. C'est une **barrière d'accès** adaptée à un **LAN interne de
confiance** — ne pas exposer sur Internet.

## Ce que ça ne change PAS

- L'app **desktop** (Electron, auto-update) continue de fonctionner comme avant : le
  backend reste une API pure quand `WEB_STATIC_DIR` n'est pas défini.
- Le mode **dev** (`launch.py` + `npm start`) est inchangé (`CONSTRUIRE_WEB.bat`
  restaure `client.env` dans `.env` après le build).

## Prérequis

- Le poste serveur doit atteindre **SQL Server** (le `serveur\.env` pointe la base).
- Même LAN entre le poste serveur et les collègues, port 8000 ouvert.
