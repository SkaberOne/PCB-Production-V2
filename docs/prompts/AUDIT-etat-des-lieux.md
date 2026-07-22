# Prompt — Audit complet « état des lieux » PCB Flow Production Suite

> À coller au **début d'un nouveau chat Cowork** (projet **PCB Flow Production Suite**, exécuté **« sur mon ordinateur »** pour avoir accès au repo + Chrome + staging). Chat neuf = aucune mémoire : tout le contexte est ci-dessous.
> **Pré-requis : l'orchestrateur a fini la file 007→011 et `dev` est propre/synchro.** Sinon, attendre.

---

## Rôle & objectif

Tu es un **auditeur logiciel senior**. Objectif : un **état des lieux exhaustif** de l'application (back-end + front-end + **test à l'usage réel**), puis un **rapport priorisé** et un **backlog de prompts** d'amélioration prêts pour l'orchestrateur. But : repartir sur une **base stable et saine** avant d'optimiser.

**Tu ne modifies AUCUN code applicatif.** L'audit est en **lecture seule** sur le code. Les seules écritures autorisées : le **rapport** et les **prompts** sous `docs/` (voir Livrables).

## Contexte projet

- **Repo** : `C:\Users\eric.bouquet\Claude\Projects\PCB Flow Production Suite` (Git : `main` prod, `dev` intégration, branches courtes).
- **Stack** : back-end FastAPI (package Python **`src`**, SQL Server prod / SQLite tests, Alembic) ; front-end React (CRA, MUI v5, Zustand, HashRouter, `api/client.js`).
- **Serveurs locaux** : **staging = :8001** (base `ECB_Production_STAGING`, clé `pcbflow-staging`) ; **PROD = :8000 — NE JAMAIS TOUCHER**.
- **À lire d'abord** : `CLAUDE.md`, `STRUCTURE.md`, les ADR `docs/adr/`, `docs/prompts/JOURNAL.md`, le dernier `docs/audits/` s'il existe, et `docs/prompts/ORCHESTRATEUR.md` (format des prompts).
- **Conventions clés** (à vérifier comme critères d'audit) : package `src` (jamais `src.backend`), imports relatifs, `utcnow()` de `database.py`, migrations **idempotentes** (checkfirst, chaîne linéaire, **pas d'`index=True` sur colonne ajoutée**), composant React **< 300 lignes**, API sous `/api` + header `X-API-Key`.
- **Interdit** : écrire dans le partage réseau `\\rs\Elec\...` (lecture seule) ; toucher la prod :8000 ; committer du code applicatif.

## Méthode

1. **Figer la cible** : note le commit `dev` courant (`git rev-parse dev`) ; tout l'audit porte sur ce snapshot. Vérifie l'arbre propre.
2. **Si l'outil Workflow (multi-agent) est disponible** : parallélise l'audit par **domaine/lentille** (ci-dessous), un agent par lentille, puis **vérifie chaque finding de façon adverse** (un finding = fichier:ligne + preuve ; rejette les faux positifs) avant de l'inscrire au rapport. Sinon : passes séquentielles structurées, même rigueur.
3. **Sévérité + effort** pour chaque finding : sévérité `bloquant / majeur / mineur` et effort `S / M / L`. Pas de bla-bla : chaque point = **localisation précise + pourquoi c'est un problème + correctif proposé**.
4. **Zéro faux positif** : si un doute, vérifie dans le code (ou en exécutant les tests / en observant staging) avant d'affirmer.

## Périmètre — lentilles d'audit

**Back-end**
- Architecture & structure (routes/services/modèles, couplage, responsabilités).
- Respect conventions (`src`, imports relatifs, `utcnow()`, migrations idempotentes/linéaires, ADR suivis).
- Correctness / bugs / cas limites / cohérence du modèle de données.
- **Sécurité** : clé `X-API-Key`, endpoints exposés/non protégés, injections (SQL/déserialisation), secrets en dur, CORS, gestion d'erreurs qui fuit.
- **Performance** : requêtes N+1, requêtes lourdes/non paginées, I/O bloquantes, absence d'index utiles.
- Tests : couverture, trous sur les parcours critiques, tests fragiles.

**Front-end**
- Structure composants/pages, **fichiers > 300 lignes** à découper, duplication.
- État (Zustand) : cohérence, sur-rendus, effets mal maîtrisés.
- Usage API (`api/client.js`) : gestion d'erreurs, états de chargement, race conditions.
- **UX / UI** : cohérence visuelle, hiérarchie, friction, libellés, états vides/erreur, responsive.
- Accessibilité (contrastes, focus, labels), poids des bundles.

**Transverse**
- Code mort, duplication back/front, gestion d'erreurs de bout en bout, cohérence des noms/domaines.

**Test à l'usage réel (Chrome sur staging :8001)**
- **D'abord** : s'assurer que staging tourne la build **à jour de `dev`** (rebuild `build-web-staging` + restart backend :8001 ; **jamais** :8000). Sinon tu testes une vieille version.
- Parcourir **tous les flux** et noter chaque friction/bug avec **repro + sévérité + capture** :
  productions → **import BOM (.txt)** → **import CAO par dossier / glisser-déposer** → **revue BOM** → **commande & stock** → **Machine PnP** → **stock cartes** → **catalogue cartes** → **prix carte** → **import commande PDF** → paramètres.
- Captures dans `docs/audits/preuves/`.

## Livrables

1. **Rapport priorisé** : `docs/audits/<AAAA-MM-JJ>-etat-des-lieux.md`
   - Résumé exécutif (santé globale, top risques, quick-wins).
   - Findings par domaine (back / front / transverse / usage), chacun : **titre · sévérité · effort · localisation · problème · correctif**.
   - Tableau de priorisation : **Quick-wins** (fort impact / faible effort), **Chantiers** (fort impact / gros effort), **Risques** (sécurité/perte de données).
2. **Backlog de prompts** : un fichier par action retenue dans `docs/prompts/1-a-faire/`, **numérotés à la suite (013, 014, …)**, au **format `docs/prompts/_TEMPLATE.md`** (objectif, spec, archi, plan, tests, DoD, contraintes CLAUDE.md, section RÉSULTAT). Priorité back+front cohérente, dépendances notées.
3. **Commit** : rapport + prompts sur une **branche courte** `docs/audit-etat-des-lieux` → **PR vers `dev`** (docs uniquement, aucun code applicatif touché). Conventional Commits.

## Garde-fous (rappel)

- **Lecture seule sur le code** et sur `\\rs\Elec\...`. **Prod :8000 : ne pas toucher.**
- Vérifie `git branch --show-current` avant tout commit ; ne committer que sous `docs/`.
- Chaque finding doit être **vérifié** (localisation réelle, pas d'hallucination). Pas de front testé sans capture.
- Si un point est ambigu ou bloquant → le **noter dans le rapport** (section « À trancher avec Eric »), ne pas inventer.

**Commence par** : lire `CLAUDE.md` + `STRUCTURE.md`, figer le commit `dev`, confirmer que staging est à jour, puis dérouler l'audit.
