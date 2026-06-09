# Plan d'action — Restructurer le dépôt autour de `main` + `dev`

> **Objectif** : passer d'une branche géante brouillonne à une structure claire à deux branches permanentes :
> - **`main`** = version **stable / déployable** (on n'y touche qu'au moment d'une « release »).
> - **`dev`** = branche de **développement** au quotidien, qui contient **toutes les features actuelles** (les 71 commits de `audit-restructure-2026-05`).
>
> **À exécuter par Eric** dans PowerShell, à la racine `C:\Users\Eric\Documents\Projet\PCB-Production-V2`.
>
> ⚠️ **Ces opérations touchent l'historique.** Fais l'**Étape 0 (sauvegarde) en premier**, et à la **moindre erreur ou message inattendu, arrête-toi et copie-le à Claude** avant de continuer. Rien d'irréversible tant que la sauvegarde existe.

État au 2026-06-09 : branche courante `audit-restructure-2026-05` (**71 commits devant `main`, 5 derrière**), un `master` obsolète, une branche `refonte-design-2026-06`, et des fichiers parasites non suivis. L'idée : **renommer** la branche de travail en `dev` (on ne perd rien, on ne re-découpe rien), la réconcilier avec `main`, puis aligner `main` une fois comme base stable.

---

## Le modèle cible en une image

```
main  ●────────────────────────────────●────────────►   stable / déployable (releases)
       \                              ↑ merge dev→main
        \                            /
dev   ●──●──●──●──●──●──●──●──●──●──●────────────────►   développement (toutes les features)
              \        ↑ merge feat→dev
               \      /
feat/...        ●──●─/                                   gros chantiers ponctuels
```

- Au quotidien tu développes sur **`dev`** (petits commits directs OK).
- Pour un **gros** chantier : une branche `feat/...` partant de `dev`, fusionnée dans `dev` via PR.
- Quand `dev` est stable et testée → PR **`dev` → `main`** = une **release**.

---

## Étape 0 — Sauvegarde (filet de sécurité)

```powershell
# 0.1 Branche de sauvegarde qui fige l'état actuel exact
git branch sauvegarde-avant-restructure-2026-06-09

# 0.2 (ceinture + bretelles) copie ZIP de tout le dossier hors Git
Compress-Archive -Path . -DestinationPath ..\PCB-Production-V2_backup_2026-06-09.zip -Force
```

Tant que la branche `sauvegarde-avant-restructure-2026-06-09` existe, **tout est récupérable**.

---

## Étape 1 — Trier les fichiers en cours

Tu as 4 fichiers modifiés (vrai code) et des fichiers parasites.

### 1.1 Retirer les parasites du suivi

Le `.gitignore` a été mis à jour (ignore désormais `exports/`, `*.bak_*`, `*.db-journal`). On nettoie ce qui traîne :

```powershell
Remove-Item serveur\database\dev.db.bak_* -ErrorAction SilentlyContinue
Remove-Item serveur\database\dev.db-journal -ErrorAction SilentlyContinue
git rm -r --cached exports 2>$null   # sort exports/ du dépôt, garde les fichiers sur le disque
```

### 1.2 Décider du sort des scripts jetables

`serveur/fix_nc_resistor_harmonization.py` et `serveur/reharmonize_bare_caps.py` ressemblent à des scripts ponctuels.

- Déjà utilisés → supprime-les : `Remove-Item serveur\fix_nc_resistor_harmonization.py, serveur\reharmonize_bare_caps.py`
- Réutilisables → range-les dans `serveur/scripts/` et commite-les là.

### 1.3 Commiter le vrai code en cours

```powershell
git add serveur/src/services/harmony_rules.py serveur/src/services/pnp_export_service.py
git add serveur/src/tests/test_harmony_rules.py serveur/src/tests/test_pnp_export.py
git add .gitignore docs/guides/ .github/
git commit -m "chore(git): mise au propre workflow, CI et gitignore"
git status   # vérifie qu'il ne reste plus rien d'important non commité
```

---

## Étape 2 — Réconcilier la branche de travail avec `main`

But : que la future `dev` contienne **aussi** les 5 commits qui ne sont que sur `main`.

```powershell
git fetch origin
git switch audit-restructure-2026-05   # (tu y es probablement déjà)
git merge origin/main                  # ramener les 5 commits de main
```

- **« Already up to date »** ou **« Merge made… »** sans conflit → parfait, Étape 3.
- **Conflits** : Git liste les fichiers. Ouvre-les, garde la bonne version (entre les marqueurs `<<<<<<<` / `=======` / `>>>>>>>`), puis `git add <fichier>` et `git commit`. En cas de doute, **copie le conflit à Claude**.

---

## Étape 3 — Renommer la branche de travail en `dev`

On ne re-découpe rien : on donne juste un nom permanent et propre à ton travail.

```powershell
git branch -m audit-restructure-2026-05 dev   # -m = renommer (move)
git push -u origin dev                         # publier la branche dev sur GitHub
```

---

## Étape 4 — Aligner `main` comme base stable (une fois)

Au départ, `main` et `dev` partent du même point (une base « v1 » propre). Ensuite seulement `dev` prendra de l'avance.

```powershell
git switch main
git merge --ff-only dev     # main "rattrape" dev (avance simple, sans commit de fusion)
git push origin main
```

> Si `--ff-only` **refuse** (« not possible to fast-forward »), c'est que l'Étape 2 n'a pas tout ramené : **arrête-toi et préviens Claude**, ne force rien.

À partir d'ici : tu développes sur `dev`, et `main` ne bougera plus que via une PR `dev → main` (release).

---

## Étape 5 — Supprimer les branches mortes

```powershell
# master obsolète (local + distant)
git branch -D master
git push origin --delete master 2>$null

# l'ancien nom de branche distant (renommé en dev en local, mais l'ancien existe encore sur GitHub)
git push origin --delete audit-restructure-2026-05 2>$null
```

### À propos de `refonte-design-2026-06`

La refonte design est **déjà intégrée** dans ton travail (commits `2a9d2fa`, `347c0be`, `cde36a5`, `95d55cf` présents sur `dev`). Si la branche `refonte-design-2026-06` ne contient plus rien de neuf, tu peux la supprimer ; en cas de doute, vérifie d'abord :

```powershell
git log --oneline dev..refonte-design-2026-06   # commits présents SEULEMENT sur refonte
# si la liste est vide -> rien d'unique, supprime sans risque :
git branch -d refonte-design-2026-06
git push origin --delete refonte-design-2026-06 2>$null
```

---

## Étape 6 — Repartir : développer sur `dev`

```powershell
git switch dev
git pull origin dev
# ... tu développes ici au quotidien (petits commits) ...

# Pour un gros chantier, branche dédiée partant de dev :
git switch -c feat/mon-chantier
# ... coder, commits ...
git push -u origin feat/mon-chantier   # -> PR vers dev, CI verte, merge, delete

# Faire une release (quand dev est stable et testée) :
#   ouvrir une PR  dev -> main  sur GitHub, attendre la CI verte, merge.
```

---

## Étape 7 — Vérifications finales

```powershell
git switch dev
git status                 # "nothing to commit, working tree clean"
git branch -a              # doit montrer main + dev (plus de master ni audit-*)
git log --oneline -5
```

Sur GitHub : onglet **Actions** → le workflow **CI** doit s'être lancé sur tes push `dev` et `main` et finir **✅ vert**.

---

## Étape 8 — Protéger `main` ET `dev` (une seule fois)

Voir `docs/guides/Workflow_Git_GitHub.md` §5 : configurer un **Ruleset** sur `main` (PR obligatoire + CI verte requise + force-push bloqué) et un ruleset plus souple sur `dev` (au minimum : bloquer le force-push + exiger la CI verte). À partir de là, plus moyen de casser `main` par accident.

---

## Étape 9 — Quand tout est confirmé OK

```powershell
git branch -D sauvegarde-avant-restructure-2026-06-09   # supprimer le filet (sans regret)
```

---

### Récapitulatif

```
AVANT                                   APRÈS
audit-restructure (71 commits) 🔴       dev  ── toutes les features, développement ✅
main ──5──┐ divergence                  main ── base stable, releases via PR dev→main ✅
master (fantôme) ✗                      master ✗ supprimé
exports/ *.bak fix_*.py ✗               parasites ✗ ignorés
```
