# [E04] CI/E2E ne se déclenchent pas sur la PR #013 — GitHub ne traite pas les events pull_request

| Champ | Valeur |
|---|---|
| **De** | orch |
| **Pour** | planif / architecte (Eric) |
| **Prompt lié** | 013 |
| **Statut** | OUVERT |
| **Créé le** | 2026-07-23 |

## Blocage / question (émetteur)

La PR **[#91](https://github.com/SkaberOne/PCB-Production-V2/pull/91)** (`fix/correctness-backend` → `dev`) n'obtient **aucun run de CI ni d'E2E**, donc impossible de valider la DoD « CI verte (dont E2E) ».

Faits vérifiés :
- Le push a bien atterri sur GitHub : `git ls-remote origin fix/correctness-backend` = `ef924bd` (= HEAD local).
- La PR #91 affiche pourtant **encore l'ancien HEAD `0acda6f`**, « 1 commit », « Checks 0 », onglet Checks = **« Workflow runs completed with no jobs »**. Le 2e commit `ef924bd` (RESULTAT + preuve + déplacement du prompt) **n'est pas vu** par la PR.
- Onglet **Actions** : **aucun run** pour la PR #91 (ni `opened`, ni `synchronize`). Le dernier run est `CI #250` (push sur `dev`, la fusion de l'audit) il y a ~1 h. Actions fonctionne donc, mais **les events `pull_request` ne sont pas traités**.
- Historique : sur les PR précédentes (#86–#90), le run `CI … opened` était systématiquement **skip/annulé** et la CI **verte venait de l'event `synchronize`** (un push suivant). Ici, même après un push `synchronize` (`ef924bd`), **rien ne se déclenche** et le HEAD de la PR ne se met pas à jour.

Conclusion : le pipeline d'events `pull_request` (sync du HEAD + planification des workflows) **ne répond pas** pour ce dépôt en ce moment. Cause hors de portée de l'orchestrateur (infra GitHub / réglage Actions / retard de traitement).

## Options envisagées

- **A)** Attendre que GitHub rattrape la file d'events, puis re-déclencher par un push léger (ou close/reopen de la PR) pour forcer un run `synchronize`. *Recommandé si c'est un retard transitoire.*
- **B)** Vérifier les réglages Actions du dépôt (Settings → Actions) : Actions activées pour les PR ? approbation requise ? `pull_request` non désactivé ? Vérifier aussi la **branche par défaut** (le bouton *Run workflow* / `workflow_dispatch` de `e2e.yml` n'apparaît pas → e2e.yml n'a peut-être pas `workflow_dispatch` sur la branche par défaut).
- **C)** Accepter 013 sur la base des preuves **locales** : `pytest` suite complète **573 passed, 1 skipped** + 5 tests ciblés `test_correctness_013.py` (dont le delete avec `PRAGMA foreign_keys=ON`). Merge manuel une fois la CI rétablie.

Recommandation orch : **A puis B** (attendre + re-push, sinon inspecter les réglages Actions). Ne pas merger tant que la CI n'est pas verte (DoD).

## Impact / en pause

- **013** : code terminé, testé vert en local, poussé (`ef924bd`), PR #91 ouverte — **en pause sur la CI GitHub uniquement**.
- **014 → 018** : en pause (règle « un prompt à la fois », 013 non clôturé DoD).
- Prod :8000 et staging :8001 non touchés.

---

## Réponse / décision (destinataire)

## Suite (émetteur, après application)

## Reponse / decision (destinataire) - RESOLU 2026-07-23

Cause = incident GitHub (Actions panne partielle ; Pull Requests + Webhooks degrades), PAS le repo. Decision Eric : attendre le retablissement.
Apres retablissement d'Actions : la PR #91 a rattrape son HEAD (cb80aee) et la CI est VERTE (pytest + npm test + e2e, verifie via API check-runs). 013 merge dans dev (merge manuel, DoD CI verte respectee). Echange clos.
