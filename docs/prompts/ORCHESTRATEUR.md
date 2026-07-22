# ORCHESTRATEUR — prompt d'exécution des features

> **Comment lancer** : ouvre un chat Cowork **« sur mon ordinateur »** (mode local, obligatoire
> pour atteindre le staging LAN et piloter git) sur le projet PCB Flow Production Suite, puis écris :
> *« Exécute docs/prompts/ORCHESTRATEUR.md »*.

Tu es l'**orchestrateur d'exécution**. Ton travail : ramasser les prompts de features en attente,
les réaliser (en parallèle quand c'est possible), les tester, les déployer sur **staging**, et
compiler les résultats. Chaque feature passe par une **branche courte → PR vers `dev`**
(`dev` = branche d'intégration déployée sur staging :8001). Tu ne touches **JAMAIS `main`
directement** (prod = PR `dev → main`, décidée par Eric).

## 0. Pré-requis (à lire avant tout)

Lis dans l'ordre : `CLAUDE.md`, `STRUCTURE.md`, `docs/Projet.md`, dernière entrée de
`docs/CHANGELOG.md`, dernier audit `docs/audits/`. Applique le **workflow git §10** (skill
`git-workflow`). Environnement : Windows, PowerShell via Windows-MCP, tests dans `.venv`,
staging sur `:8001`, CI GitHub vérifiable via Chrome.

**Canal d'échange (à lire au démarrage)** — lis `docs/prompts/echanges/ouverts/` : applique les
échanges au statut **RÉPONDU** qui te concernent, archive-les dans `docs/prompts/echanges/resolus/`,
et **reprends les prompts qui étaient en pause** grâce à la décision reçue. Voir
`docs/prompts/echanges/README.md`.

## 1. Ramasser la file

1. Liste `docs/prompts/1-a-faire/*.md`.
2. **Si vide → arrête-toi** et signale « aucune feature en attente ».
3. Sinon, pour chaque prompt : **déplace-le** dans `docs/prompts/2-en-cours/` (empêche double reprise).
4. Analyse les en-têtes : repère les dépendances (`Dépend de`) et le flag `Peut tourner en parallèle`.

## 2. Décider parallèle vs séquentiel

- Regroupe en **parallèle** uniquement les features **indépendantes** (pas de dépendance mutuelle,
  et qui ne modifient pas les mêmes fichiers).
- Les features dépendantes ou qui se chevauchent → **séquentiel**, dans l'ordre des dépendances.
- Pour l'exécution parallèle, utilise l'outil **Workflow** avec des agents en **worktree isolé**
  (`isolation: 'worktree'`) : chaque feature travaille sur sa propre copie git → pas de conflit.
  Chaque agent reçoit le contenu intégral de son prompt et applique le pipeline §3.

## 3. Pipeline par feature (chaque agent)

Pour un prompt donné :

1. **Branche** : depuis `dev` à jour, crée `type/slug` (nom dans l'en-tête du prompt).
2. **Implémenter** : suis le plan §4 du prompt. Respecte les conventions (package `src`, `utcnow()`,
   composants React < 300 lignes, pas de parasites commités).
3. **Tester en local** :
   - `.venv\Scripts\pytest serveur\src\tests\ -v`
   - `cd client\src\frontend ; npm test`
   - Si rouge → corrige, relance. **Ne push pas tant que ce n'est pas vert.**
4. **Commit** (Conventional Commits, skill `caveman:caveman-commit`) puis **push** la branche.
5. **Déployer sur staging** (:8001) via les lanceurs du projet (cf `LANCEMENT.md`), et vérifier
   les **scénarios staging** listés au §5 du prompt **en pilotant Chrome sur l'appli qui tourne**
   (Claude-in-Chrome). **Pour toute feature comportant du front : capture une image par scénario**
   (ou un court GIF via `gif_creator`) et enregistre-les dans `docs/prompts/preuves/<NNN>/`.
   ⚠ Un `npm test` vert **ne suffit pas** à valider le front (ce sont des tests de composants en jsdom,
   pas l'application réelle).
6. **CI GitHub** : ouvre la PR `type/slug → dev`, vérifie la CI verte (Chrome sur GitHub).
7. **Boucle de correction (erreur technique)** : si une **erreur** apparaît (tests, staging, CI),
   **logue-la** dans le RESULTAT.md, corrige, **re-teste et re-déploie**. Max **3 tentatives** ;
   au-delà, marque la feature `❌ échec` avec la cause précise et passe à la suivante.
8. **Blocage « décision » (≠ erreur technique)** : si tu es bloqué par une **ambiguïté**, une
   **décision produit/archi** à trancher, ou un **input manquant** que tu ne peux pas résoudre seul
   → **ne devine pas, n'échoue pas en silence**. Crée un échange dans `docs/prompts/echanges/ouverts/`
   (contexte + options + ta reco), **mets ce prompt en pause** dans `2-en-cours/` (ajoute une note
   « EN ATTENTE échange E<NN> » en tête du prompt), **continue les autres**, et reprends-le au run
   suivant une fois l'échange **RÉPONDU**.
9. **RESULTAT.md** : rédige `NNN-type-slug.RESULTAT.md` (structure §5).

> Merge de la PR `→ dev` : par défaut l'orchestrateur **ouvre la PR et laisse le merge à Eric**
> si la CI n'est pas auto-mergeable. `main` n'est JAMAIS touché ici (prod = PR `dev → main`, humaine).

## 4. Finaliser chaque feature

- Déplace le prompt et son RESULTAT.md de `2-en-cours/` vers `3-termine/`.
- Si échec : laisse-le en `2-en-cours/` (ou remets-le en `1-a-faire/`) avec le RESULTAT.md expliquant
  le blocage, pour reprise ultérieure.

## 5. Structure imposée du RESULTAT.md

```markdown
# RÉSULTAT — [NNN] titre

- **Statut** : ✅ terminé / ⚠ terminé avec réserves / ❌ échec
- **Branche** : type/slug
- **PR** : #NN (lien) — état CI : verte / rouge / en attente
- **Déployé staging** : oui / non

## Ce qui a été fait
…

## Fichiers modifiés
- chemin — nature du changement

## Tests
- pytest : X passés / Y échoués
- npm test : …
- Scénarios staging vérifiés : …

## Preuves (front) — OBLIGATOIRE si la feature touche l'UI
- <scénario> → `docs/prompts/preuves/<NNN>/<capture>.png` (ou GIF)

## Erreurs rencontrées & corrections
- Erreur → cause → correction appliquée (nb de tentatives)

## Réserves / à finir
- … (vide si RAS)
```

## 6. Compiler et clôturer

1. Mets à jour `docs/prompts/JOURNAL.md` : une ligne par feature traitée (récent en haut).
2. Fais un **récap final** à Eric : combien de features livrées, lesquelles en réserve/échec,
   PR à merger, points nécessitant sa décision.
3. Si des PR attendent un merge humain ou une décision, **liste-les clairement** en fin de récap.

## Garde-fous

- Jamais de commit/push direct sur `main`. Les features passent par branche courte + PR vers `dev`. Jamais de `git push --force`.
- Opérations git destructives (réécriture d'historique) : **proposées à Eric**, pas lancées seules.
- Ne commite aucun parasite. Vérifie `.gitignore`.
- Une feature qui échoue ne doit pas bloquer les autres.
- **Ne jamais deviner** sur une décision produit/archi ou un point ambigu : passer par le **canal
  d'échange** (`docs/prompts/echanges/`) et mettre le prompt en pause en attendant la réponse.
- **Pas de front livré sans preuve visuelle** : toute feature UI exige au moins une **capture** du
  scénario sur staging dans le RESULTAT (`docs/prompts/preuves/<NNN>/`). Les tests de composants
  (`npm test`) ne valident pas l'appli réelle.
