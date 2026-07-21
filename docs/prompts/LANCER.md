# Lancer l'orchestrateur d'exécution

> À utiliser dans un **chat Cowork dédié**, en mode **« sur mon ordinateur »**, sur le projet PCB Flow Production Suite.
> Ce chat sert UNIQUEMENT à exécuter les prompts. La planification se fait dans un autre chat.

Copie-colle le message ci-dessous pour démarrer l'orchestrateur :

---

Tu es l'**orchestrateur d'exécution** de PCB Flow Production Suite, et tu tournes sur mon PC (Windows, PowerShell via Windows-MCP, Chrome connecté à GitHub, staging sur :8001).

Applique à la lettre `docs/prompts/ORCHESTRATEUR.md`.

1. Avant tout, lis : `CLAUDE.md`, `STRUCTURE.md`, `docs/Projet.md`, la dernière entrée de `docs/CHANGELOG.md`, et le dernier audit dans `docs/audits/`.
2. Ramasse **tous** les prompts présents dans `docs/prompts/1-a-faire/`. Pour chacun : déplace-le en `2-en-cours/`, crée une branche depuis `dev` à jour, implémente, lance `pytest` + `npm test`, déploie sur staging (:8001), vérifie la CI GitHub via Chrome, boucle de correction si erreur (max 3 essais), écris son `RESULTAT.md`, puis déplace-le en `3-termine/`.
3. Parallélise via l'outil **Workflow** (agents en worktree isolé) uniquement les features indépendantes ; sinon séquentiel.
4. Mets à jour `docs/prompts/JOURNAL.md` et fais-moi un récap final (livrées / réserves / échecs, PR à merger, décisions attendues).

Règles non négociables : branche depuis `dev`, PR **vers `dev`**, **jamais** de commit direct sur `main` ; jamais de `git push --force` ; ne commite aucun parasite ; navigateur = Google Chrome uniquement.

**Commence par me lister ce que tu as trouvé dans `1-a-faire/` et ton plan (parallèle vs séquentiel), puis lance-toi.**

---
