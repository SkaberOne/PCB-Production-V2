# ADR 0007 — Système de mise à jour automatique

**Date** : 2026-06-10
**Statut** : ✅ Accepté
**Décideurs** : Eric (multi-postes, auto-update prioritaire) · Claude (architecture)
**Référence** : `docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md` (§4 Phase D, §5, §9.2)

---

## Contexte

L'app vise un déploiement **multi-postes** (confirmé Eric, 2026-06-10) où pousser
un correctif à la main sur chaque poste serait pénible. Aujourd'hui : aucun
mécanisme de mise à jour (`electron-builder` en `--publish never`, pas
d'`electron-updater`) — écart D3, classé **bloquant**. Le vrai enjeu du déploiement
n'est pas la 1ʳᵉ install mais la **série de mises à jour** dans la durée
(« Elephant » du pré-mortem §8).

---

## Décision

### 1. electron-updater + electron-builder + GitHub Releases

Mécanisme retenu (standard 2026) : **`electron-updater`** côté app + **`electron-builder`**
configuré en `publish: github`. À chaque release, electron-builder publie
automatiquement les **installeurs** (NSIS) **et** le fichier de métadonnées
**`latest.yml`** requis par l'updater.

- Hébergement : **GitHub Releases** (dépôt du projet). Un **PAT GitHub** (scope `repo`)
  côté machine de build sert au `publish` ; il n'est **jamais** embarqué dans l'app.
- Alternative documentée (non retenue par défaut) : serveur HTTP générique / S3 si
  un hébergement strictement privé devient nécessaire.

### 2. Ce qui est mis à jour = frontend + backend d'un bloc

L'app Electron embarque le build React **et** `pcb-flow-server.exe` (ADR 0006). Une mise
à jour pousse donc **les deux ensemble** → cohérence frontend/backend garantie, pas
de désynchronisation de contrat API entre couches d'un même poste.

### 3. Déclenchement : automatique au démarrage + bouton manuel

- Au lancement : `autoUpdater.checkForUpdatesAndNotify()`.
- **Bouton manuel** « Rechercher les mises à jour » (menu *Aide* ou écran Paramètres)
  avec **barre de progression** et action « Redémarrer pour installer ».
- L'installation s'applique au redémarrage (`quitAndInstall`).

### 4. Versionnage SemVer + canaux

- **SemVer** : `MAJOR` = rupture (schéma DB / contrat API), `MINOR` = fonctionnalité,
  `PATCH` = correctif. Version courante : `1.0.0`.
- Pipeline de release : bump de version dans `client/src/desktop/package.json` →
  `electron-builder` publie installeurs + `latest.yml`.
- **Canal `beta`** prévu (`"version":"x.y.z-beta"` + `generateUpdatesFilesForAllChannels: true`)
  pour valider une version sur 1 poste avant promotion en `latest`.

### 5. Migrations DB jouées au boot, toujours rétro-compatibles

Après mise à jour, le backend packagé joue `alembic upgrade head` au démarrage
(ADR 0008 / Phase E). Sur base SQL Server **partagée**, les migrations doivent rester
**additives et rétro-compatibles** tant qu'un poste peut être resté sur l'ancienne
version (déploiement progressif). Voir ADR 0008.

---

## Conséquences

- ✅ Eric développe une version stable → bump → publish → les postes proposent la MAJ
  (auto au démarrage + bouton manuel), sans intervention sur chaque machine.
- ✅ Rollback possible : réinstaller la version précédente / restaurer un `latest.yml`
  antérieur.
- ✅ Canal beta → tester avant diffusion générale.
- ⚠️ Discipline SemVer + migrations rétro-compatibles **obligatoire** dans la durée
  (sinon un poste en retard casse sur base partagée).
- ⚠️ Sans **signature de code** (ADR/ Phase F optionnelle), SmartScreen avertit au
  1ᵉʳ lancement d'une nouvelle version (non bloquant en diffusion interne).
- ⚠️ Dépendance à la disponibilité de GitHub Releases pour la distribution.

---

## Alternatives écartées

- **Réinstallation manuelle poste par poste** : rejetée — c'est précisément le
  point de douleur en multi-postes (décision Eric).
- **Mise à jour frontend et backend séparément** : risque de désynchronisation de
  contrat ; bloc unique retenu.
- **Serveur de mise à jour auto-hébergé dès le départ** : surcoût d'infra non
  justifié ; GitHub Releases retenu, S3/HTTP gardé en option.

---

## Références
- Plan : `docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md` (§4 Phase D, §5)
- Fichiers : `client/src/desktop/package.json` (build.publish), `main.js` (autoUpdater)
- ADR liés : `0006-packaging-lancement-desktop.md`, `0008-base-partagee-sql-server.md`
