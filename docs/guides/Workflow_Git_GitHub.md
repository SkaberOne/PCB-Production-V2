# Workflow Git & GitHub — PCB Flow Production Suite

> **But du document** : expliquer en clair comment bien utiliser Git et GitHub sur ce projet, et fixer le processus que **toi (Eric) ET Claude** suivez avant/pendant/après chaque modification de code.
>
> Document à la fois pédagogique (pour comprendre) et normatif (les règles sont une **loi** du projet, comme `STRUCTURE.md`).
>
> Dernière mise à jour : 2026-06-09.

---

## 0. Diagnostic de départ (pourquoi ce document)

Audit du dépôt au 2026-06-09 (`https://github.com/SkaberOne/PCB-Production-V2`) :

| Constat | Détail | Gravité |
|---|---|---|
| **Une seule grosse branche de travail** | `audit-restructure-2026-05` a **70 commits d'avance** sur `main`, et `main` a **5 commits** que cette branche n'a pas. Les deux ont divergé. | 🔴 Élevée |
| **Confusion `master` / `main`** | Un vieux `master` local traîne en plus du `main` distant (qui est la branche par défaut sur GitHub). | 🟠 Moyenne |
| **Fichiers parasites non suivis** | `exports/`, `serveur/fix_nc_resistor_harmonization.py`, `reharmonize_bare_caps.py`, `dev.db.bak_*`, `dev.db-journal` traînent dans le statut. | 🟠 Moyenne |
| **Aucune CI** | Pas de `.github/workflows/`. Les tests ne tournent jamais automatiquement. | 🟠 Moyenne |
| **Messages de commit propres** ✅ | Format conventionnel respecté (`feat(...)`, `fix(...)`, `test(...)`). C'est déjà très bien, on garde. | 🟢 OK |

**Conclusion** : le « brouillon » vient du **modèle de branches** (une branche géante qui ne retourne jamais dans `main`), pas des commits eux-mêmes. Ce document corrige ça.

> Pour remettre le dépôt propre **maintenant**, voir le plan dédié : `docs/guides/Nettoyage_Git_Plan_Action.md`.

---

## 1. Le modèle choisi : **`main` + `dev`** (deux branches permanentes)

Le projet utilise deux branches qui vivent en permanence, plus des branches courtes ponctuelles :

- **`main`** = la version **stable et déployable**. On n'y touche qu'au moment d'une **release** (mise en production). Toujours verte.
- **`dev`** = la branche de **développement au quotidien**. Elle contient toutes les features en cours. C'est là que tu travailles tous les jours.
- **`feat/...` / `fix/...`** = branches **courtes et ponctuelles** pour les **gros** chantiers, qui partent de `dev` et y retournent via PR.

```
main  ●────────────────────────────────●────────────►   stable / déployable (releases)
       \                              ↑ merge dev→main
        \                            /
dev   ●──●──●──●──●──●──●──●──●──●──●────────────────►   développement (toutes les features)
              \        ↑ merge feat→dev
               \      /
feat/...        ●──●─/                                   gros chantiers ponctuels
```

Les **principes** :

1. **`main` est sacrée** : toujours fonctionnelle. On ne pousse **jamais** directement dessus ; elle n'avance que par une PR **`dev → main`** (= une release), avec CI verte.
2. **`dev` est ton atelier** : tu y commites au quotidien (petits commits directs OK). Elle doit rester verte le plus possible (lance les tests avant de pousser).
3. **Un gros chantier = une branche courte** partant de `dev`, fusionnée dans `dev` via **Pull Request** puis **supprimée**. Pour une petite modif, commiter directement sur `dev` suffit.
4. **On fusionne via une Pull Request** : c'est là que la CI vérifie que rien n'est cassé avant d'entrer dans `dev` ou `main`.

> 💡 **Quand faut-il une branche `feat/` plutôt que commiter direct sur `dev` ?** Si le chantier prend plus d'une journée, touche beaucoup de fichiers, ou est risqué → branche dédiée (tu peux l'abandonner sans polluer `dev`). Sinon, petits commits directs sur `dev`.

> ⚠️ Ce qu'il faut éviter (l'erreur passée `audit-restructure-2026-05`) : une branche qui vit des semaines et accumule 70 commits sans jamais retourner dans une branche permanente. `dev` est permanente, donc le problème disparaît — mais les branches `feat/` doivent rester **courtes**.

---

## 2. Nommer les branches

Une branche = un préfixe (le même que tes commits) + un tiret + un nom court en kebab-case.

| Préfixe | Pour | Exemple |
|---|---|---|
| `feat/` | nouvelle fonctionnalité | `feat/prix-carte-production` |
| `fix/` | correction de bug | `fix/bom-viewer-revision` |
| `refactor/` | réorganisation sans changement de comportement | `refactor/split-settings-page` |
| `test/` | ajout/réparation de tests | `test/isolation-backend` |
| `docs/` | documentation seule | `docs/workflow-git` |
| `chore/` | maintenance (deps, config, nettoyage) | `chore/gitignore-exports` |

Règles : minuscules, mots séparés par des tirets, court mais explicite. Pas d'espaces, pas d'accents, pas de `master`.

---

## 3. Le cycle de travail, étape par étape

C'est **le** processus à suivre à chaque tâche. Les commandes sont en PowerShell (Windows).

### 3.1 Avant de commencer : partir d'une `dev` à jour

Au quotidien tu travailles **sur `dev`**. Pour un gros chantier, tu en crées une branche courte :

```powershell
git switch dev            # aller sur dev
git pull origin dev       # récupérer la dernière version distante
git switch -c feat/ma-tache  # (gros chantier) créer SA branche et basculer dessus
```

> `git switch -c` = créer (`-c`) une branche et s'y placer. Équivalent moderne de `git checkout -b`.
> Pour une petite modif, tu peux sauter cette branche et commiter directement sur `dev`.

### 3.2 Pendant : coder + commiter par petits paquets

On commite **souvent** et **petit** : un commit = un changement cohérent qui se résume en une phrase.

```powershell
git add serveur/src/services/costing_service.py   # choisir ce qu'on enregistre
git status                                          # vérifier ce qui est ajouté
git commit -m "feat(costing): calcul du coût de revient par face"
```

Format des messages (déjà respecté, on continue) — **Conventional Commits** :

```
<type>(<portée>): <description courte à l'impératif, ≤ 50 caractères>

[corps optionnel : le POURQUOI, si non évident]
```

Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`.

### 3.3 Envoyer la branche sur GitHub

```powershell
git push -u origin feat/ma-tache   # -u seulement au premier push de la branche
# pushes suivants : git push
```

### 3.4 Ouvrir une Pull Request

Sur GitHub, un bandeau « Compare & pull request » apparaît. Sinon : onglet **Pull requests** → **New pull request** → base **`dev`** ← compare `feat/ma-tache`.

Dans la PR : un titre clair + 2-3 lignes décrivant le quoi/pourquoi. **La CI se lance automatiquement** (voir §6) et affiche ✅ ou ❌.

### 3.5 Fusionner puis nettoyer

Quand la CI est verte :

- Bouton **Merge** (ou **Squash and merge** si la branche a des commits brouillons de type « wip », « fix typo » — ça les regroupe en un seul commit propre).
- Bouton **Delete branch** sur GitHub.
- En local :

```powershell
git switch dev
git pull origin dev           # récupérer la fusion
git branch -d feat/ma-tache   # supprimer la branche locale devenue inutile
```

### 3.6 Faire une release (`dev` → `main`)

Quand `dev` est dans un état stable que tu veux figer comme version déployable : ouvre une PR **`dev → main`** sur GitHub, attends la **CI verte**, et fusionne. `main` reçoit alors un bloc de travail testé. C'est le **seul** moyen de faire avancer `main`.

### 3.7 Résumé visuel du cycle

```
dev à jour → (branche courte) → commits petits → push → PR vers dev → CI verte → merge → delete
     ▲                                                                                    │
     └────────────────────────────────────────────────────────────────────────────────┘
   puis, quand dev est stable :  PR  dev → main  → CI verte → release
```

---

## 4. Pourquoi des Pull Requests même en solo ?

C'est la question légitime quand on est seul. Réponses :

1. **La CI joue le rôle du relecteur** : elle empêche un code qui casse les tests d'entrer dans `main`. Sans PR, rien ne vérifie.
2. **Historique lisible** : chaque PR raconte une intention (« ajout du calcul de coût »). On retrouve facilement *quand* et *pourquoi* un changement est arrivé.
3. **Revenir en arrière est trivial** : annuler une PR fusionnée = un bouton « Revert ». Annuler du code poussé en vrac sur `main`, c'est l'enfer.
4. **`main` reste toujours déployable** : tu peux construire le `.exe` depuis `main` à tout moment en confiance.

> En solo, tu n'as pas besoin d'attendre l'approbation d'un humain : tu ouvres la PR, la CI passe, tu fusionnes toi-même. Le bénéfice est le **filet de sécurité automatique**, pas la bureaucratie.

---

## 5. Protéger `main` (à configurer une fois sur GitHub)

Pour rendre les règles ci-dessus **impossibles à contourner par accident**, on protège `main`. GitHub propose deux mécanismes : les anciennes *branch protection rules* et les nouveaux **Rulesets** (recommandés, plus souples et cumulables).

À configurer sur `github.com/SkaberOne/PCB-Production-V2` → **Settings** → **Rules** → **Rulesets** → **New branch ruleset** :

- **Target** : branche `main` (`Include default branch`).
- ✅ **Require a pull request before merging** — interdit le push direct sur `main`.
- ✅ **Require status checks to pass** — coche le check de la CI (apparaîtra sous le nom `tests` / `backend` / `frontend` après le premier run, voir §6). Empêche de fusionner si les tests sont rouges.
- ✅ **Block force pushes** — empêche de réécrire l'historique de `main`.
- (Solo) Inutile d'exiger un nombre d'approbations humaines : laisse « Required approvals » à 0.

Résultat : même si tu fais `git push origin main` par erreur, GitHub refuse. Tout doit passer par une PR avec CI verte.

**Pour `dev`**, crée un second ruleset plus souple (cible `dev`) : au minimum ✅ **Block force pushes** et ✅ **Require status checks to pass** (la CI). Inutile d'exiger une PR sur `dev` — tu y commites au quotidien — mais on garde le filet de la CI et l'interdiction de réécrire l'historique.

> Référence : [GitHub Docs — About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets).

---

## 6. CI / CD expliqué simplement

### 6.1 Les mots

- **CI = Continuous Integration (Intégration Continue)** : à chaque fois que tu pousses du code ou ouvres une PR, un robot (ici **GitHub Actions**) installe le projet sur une machine neuve et **lance les tests tout seul**. Si un test casse, tu le sais en quelques minutes, dans la PR, avant de fusionner. C'est un **garde-fou automatique**.

- **CD = Continuous Delivery/Deployment (Livraison/Déploiement Continu)** : étape d'après — une fois les tests verts, un robot **fabrique et/ou déploie** automatiquement le produit (par ex. construire `PCB Flow Production Suite.exe`, ou publier le serveur). 

> Pour ce projet, on met en place la **CI maintenant** (lancer les tests automatiquement). Le **CD** (build automatique de l'`.exe` / déploiement serveur) est une étape **ultérieure** — on pose les fondations d'abord. Voir §6.4.

### 6.2 Comment ça marche concrètement

GitHub lit les fichiers `.yaml` placés dans le dossier `.github/workflows/`. Chaque fichier décrit un **workflow** : « quand X arrive (push, PR…), fais Y (installe, teste…) ».

Le workflow installé sur ce projet (`.github/workflows/ci.yml`) fait, à chaque push et chaque PR :

1. **Job `backend`** : prend une machine Linux neuve, installe Python, installe `serveur/requirements_flexible.txt`, lance `pytest serveur/src/tests/`.
2. **Job `frontend`** : prend une machine neuve, installe Node, fait `npm ci` puis `npm test` dans `client/src/frontend/`.

Les deux jobs tournent **en parallèle**. Le résultat (✅/❌) s'affiche directement dans la PR et dans l'onglet **Actions** de GitHub.

### 6.3 Ce que ça change pour toi au quotidien

| Avant | Après (avec CI) |
|---|---|
| Tu lances les tests à la main (parfois tu oublies) | Ils tournent **tout seuls** à chaque push |
| Un bug peut entrer dans `main` sans qu'on le voie | La PR reste **rouge** tant que c'est cassé |
| « Ça marche chez moi » | Testé sur une **machine neuve** = reproductible |

Tu continues à lancer `pytest` et `npm test` en local pendant que tu codes (plus rapide pour itérer) ; la CI est le **dernier filet** avant `main`.

### 6.4 Plus tard : le CD (déploiement)

Quand la CI sera rodée, on pourra ajouter un workflow qui, à chaque **tag de version** (`v1.2.0`) :

- construit `client/dist/PCB Flow Production Suite.exe` (workflow sur runner Windows) ;
- attache l'`.exe` à une **Release** GitHub téléchargeable.

Ce sera un document/itération séparé — pas besoin maintenant.

---

## 7. Règles d'or (résumé opérationnel)

**À FAIRE :**

- ✅ Développer au quotidien sur `dev` ; partir d'une `dev` à jour (`git pull`) avant un gros chantier.
- ✅ Gros chantier = une branche courte (`feat/`, `fix/`…), fusionnée dans `dev` puis supprimée rapidement.
- ✅ Commits petits, fréquents, au format conventionnel.
- ✅ Pousser, ouvrir une PR, attendre la **CI verte**, puis fusionner.
- ✅ Faire avancer `main` uniquement par une release : PR `dev → main` avec CI verte.
- ✅ Lancer les tests en local avant de pousser.

**À NE JAMAIS FAIRE :**

- ❌ Pousser directement sur `main` (elle n'avance que par PR `dev → main`).
- ❌ Laisser vivre une branche `feat/` des semaines (la « branche géante »).
- ❌ Commiter des fichiers parasites : `.db`, `.bak`, `exports/`, scripts jetables `fix_*.py`, `dev.db-journal`. → ils doivent être dans `.gitignore`.
- ❌ Mélanger plusieurs sujets sans rapport dans une même branche/PR.
- ❌ Faire un `git push --force` sur `main` ou `dev`.

---

## 8. Glossaire express

| Terme | En clair |
|---|---|
| **Repository (repo)** | Le dépôt = tout le projet versionné. |
| **Commit** | Une photo enregistrée d'un changement, avec un message. |
| **Branche** | Une ligne de travail parallèle. `main` = la ligne officielle. |
| **`main`** | Branche principale **stable / déployable**. (Remplace l'ancien nom `master`.) N'avance que par release. |
| **`dev`** | Branche de **développement** permanente où tu travailles au quotidien ; contient toutes les features en cours. |
| **Release** | Le fait de fusionner `dev` dans `main` pour figer une version stable déployable. |
| **`origin`** | Le dépôt distant sur GitHub (par opposition à ta copie locale). |
| **Push / Pull** | Envoyer (push) / récupérer (pull) des commits vers/depuis GitHub. |
| **Pull Request (PR)** | Demande de fusionner une branche dans `main`, avec relecture + CI. |
| **Merge** | Fusionner une branche dans une autre. |
| **Squash** | Regrouper plusieurs commits en un seul à la fusion. |
| **CI** | Robot qui lance les tests automatiquement. |
| **CD** | Robot qui construit/déploie automatiquement après les tests. |
| **GitHub Actions** | Le service GitHub qui exécute la CI/CD (fichiers dans `.github/workflows/`). |
| **Ruleset** | Règles de protection d'une branche (ex : interdire le push direct sur `main`). |

---

## 9. Sources

- [GitHub Docs — GitHub flow](https://docs.github.com/get-started/quickstart/github-flow)
- [Atlassian — Comparing Git workflows](https://www.atlassian.com/git/tutorials/comparing-workflows)
- [GitHub Docs — Building and testing Python](https://docs.github.com/en/actions/guides/building-and-testing-python)
- [GitHub Docs — About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub Docs — Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
