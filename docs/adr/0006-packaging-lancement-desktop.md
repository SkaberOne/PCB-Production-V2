# ADR 0006 — Packaging du backend & lancement autonome de l'application desktop

**Date** : 2026-06-10
**Statut** : ✅ Accepté
**Décideurs** : Eric (cible déploiement) · Claude (architecture + implémentation)
**Référence** : `docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md` (§2, §4 Phase A, §9.1)

---

## Contexte

L'application est stable en usage mais **pas déployable en l'état**. L'exécutable
Electron ne charge que le build React et tape une URL backend figée
(`REACT_APP_API_URL`, port 8000 en dur) : sans backend Python démarré à côté
(qui exige `.venv` + `pip install` chez l'utilisateur), l'app affiche
« Backend non disponible » (écarts D1, D2, D4 du plan).

Cible retenue (confirmée par Eric, 2026-06-10) : **multi-postes**, chaque poste
exécutant son frontend + son backend local, tous connectés à un **SQL Server
central** (cf. ADR 0008). Un déploiement « double-clic » exige donc qu'Electron
**démarre lui-même le backend**, sans Python installé sur la machine.

---

## Décision

### 1. Backend packagé en exécutable autonome avec PyInstaller

Le backend FastAPI est gelé en `pcb-flow-server.exe` via **PyInstaller en mode `onedir`**
(et non `onefile`) : démarrage plus rapide, et surtout compatibilité avec les
drivers ODBC et les binaires natifs (pyodbc). Le dossier `pcb-flow-server/` est embarqué
dans l'app Electron via `extraResources` (cf. ADR 0006 / Phase C).

- Point d'entrée gelé dédié : `serveur/server_entry.py` (robuste quand `frozen`,
  résout les chemins via `sys._MEIPASS` / `sys.executable`, pas via `__file__`).
- Spec PyInstaller : `serveur/pcb-flow-server.spec` — déclare les `hiddenimports`
  (uvicorn workers, pyodbc, dialectes SQLAlchemy) et embarque en `datas` les
  fichiers de migration Alembic (`src/alembic/`) + `alembic.ini`.
- Le backend gelé **bind `127.0.0.1` uniquement** (jamais `0.0.0.0`) : il ne sert
  que le renderer local du même poste.

### 2. Electron démarre et supervise le backend

Dans `client/src/desktop/src/main.js`, séquence au `app.whenReady` :

1. **Détecter un port TCP libre** sur `127.0.0.1` (pas de port 8000 en dur →
   lève D4 et évite les collisions multi-instances).
2. **`child_process.spawn`** de `pcb-flow-server.exe` avec le port choisi passé en
   argument/env. En dev (non packagé), spawn de `python launch.py` à la place.
3. **Health-check** : poller `GET http://127.0.0.1:<port>/api/health` jusqu'à `200`
   (timeout borné, ex. 30 s) en affichant un **écran d'attente** ; n'afficher la
   fenêtre principale qu'une fois le backend prêt.
4. **Injection runtime** : l'URL/port (et plus tard la clé API, ADR 0007/Phase B)
   sont transmis au renderer via `preload.js` + `contextBridge`
   (`window.electronAPI.getBackendUrl()`), **jamais bakés dans le bundle**.
5. **Teardown** : `app.on('before-quit')` et `window-all-closed` tuent le process
   backend ; garde anti-orphelin si Electron crashe (kill par PID au démarrage suivant).

### 3. Le renderer lit l'URL backend à l'exécution

`client/src/frontend/src/api/client.js` lit l'URL injectée par Electron au runtime
(`window.electronAPI?.getBackendUrl()`), avec repli sur
`process.env.REACT_APP_API_URL || http://localhost:8000/api` pour le dev navigateur.
Le port n'est donc plus figé au build.

---

## Conséquences

- ✅ **Double-clic autonome** : l'exe démarre sur une machine sans Python ni Node
  et charge des données (critère de sortie Phase A).
- ✅ Port dynamique → pas de collision si plusieurs instances / un autre service
  occupe 8000.
- ✅ Cohérence frontend/backend : les deux sont embarqués et versionnés d'un bloc
  (prépare l'auto-update, ADR 0007).
- ⚠️ **Prérequis ODBC Driver 17** : PyInstaller n'embarque pas les drivers système ;
  à documenter/installer sur chaque poste (risque « Tiger » du plan §8).
- ⚠️ Build PyInstaller à maintenir (hiddenimports, datas Alembic) ; testé sur Windows.
- ⚠️ Taille de l'installeur accrue (backend Python gelé embarqué).

---

## Alternatives écartées

- **PyInstaller `onefile`** : extraction temporaire à chaque lancement (lente) et
  problèmes connus avec pyodbc/ODBC ; `onedir` retenu.
- **Serveur applicatif central unique** (1 backend pour tous les postes) : ajoute
  un service à héberger/maintenir et un point de panne ; rejeté au profit de
  « backend local par poste, donnée centralisée » (ADR 0008).
- **Embarquer Python + venv tel quel** (sans geler) : exige Python sur la machine
  ou un embeddable fragile ; PyInstaller retenu pour l'autonomie réelle.
- **Garder l'URL backend bakée au build** : impose un rebuild pour tout changement
  de port/host ; injection runtime retenue.

---

## Références
- Plan : `docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md` (Phase A, §9.1)
- Fichiers : `serveur/server_entry.py`, `serveur/pcb-flow-server.spec`,
  `client/src/desktop/src/main.js`, `client/src/desktop/src/preload.js`,
  `client/src/frontend/src/api/client.js`
- ADR liés : `0001-monorepo-structure.md`, `0007-systeme-mise-a-jour.md`,
  `0008-base-partagee-sql-server.md`
