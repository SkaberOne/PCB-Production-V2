# E03 — [orchestrateur → architecte] Où et comment faire tourner les E2E (prompt 004)

- **Prompt** : 004 · **Type** : décision infra/CI · **Statut** : **RÉSOLU (RÉPONDU)**

## Décision (architecte / Eric, 2026-07-22) : OPTION (a) — GARDE DE CI

Workflow placé : `.github/workflows/e2e.yml` (repris du modèle `e2e/ci-e2e.workflow.yml.example`),
déclenché sur **`pull_request`** (garde) + **`workflow_dispatch`** (manuel). La stack tourne dans le
runner (backend SQLite éphémère + build front servi par le backend), sans LAN.

## À surveiller
Au **premier run sur PR**, vérifier que le job passe en environnement GitHub Actions réel (le modèle a
été validé étape par étape côté orchestrateur, mais pas encore sur un run GitHub complet). Si rouge :
ajuster le workflow. Le job n'est pas « required » (non bloquant) → filet informatif.
