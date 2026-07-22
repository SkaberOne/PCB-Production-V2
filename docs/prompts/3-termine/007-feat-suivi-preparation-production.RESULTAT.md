# RÉSULTAT — [007] conditionnement affiché + suivi « préparé / installé » par composant

- **Statut** : ✅ terminé
- **Branche** : feat/suivi-preparation-prod
- **PR** : [#86](https://github.com/SkaberOne/PCB-Production-V2/pull/86) → dev — état CI : en attente (voir PR)
- **Déployé staging** : oui (:8001, base ECB_Production_STAGING)

## Ce qui a été fait
Suivi de la préparation physique d'une production, par (production, composant),
sans impact sur le solde de stock (annotation d'avancement, esprit `ComponentMachineLoad`).

- **A. Conditionnement** : les vues Commande et Machine PnP exposent et affichent la
  répartition par forme (`qty_reel/bag/tube`, formes non nulles seulement, ex. « 🎞️ 668 »).
- **B. « Préparé »** (Commande et stock) : case à cocher par composant, persistée, avec qui + quand.
- **C. « Installé »** (table d'affectation Machine PnP) : case à cocher par composant, persistée, qui + quand.

Modèle `ProductionComponentProgress` (UniqueConstraint (production, composant)), migration
additive checkfirst, service `ProductionProgressService` (upsert set-to + enrichisseur
générique des structures portant `component_id`), endpoint toggle unique, enrichissement
du résumé commande et du plan feeder.

## Fichiers modifiés
- serveur/src/models/production.py — nouveau modèle ProductionComponentProgress
- serveur/src/alembic/versions/b8d0f2a4c6e8_production_component_progress.py — migration (create table checkfirst)
- serveur/src/services/production_progress_service.py — service (nouveau)
- serveur/src/routes/marketplace_productions.py — endpoint PUT component-progress
- serveur/src/services/production_command_service.py — enrichit le résumé (conditionnement + progress)
- serveur/src/routes/marketplace_machines.py — enrichit le plan feeder
- serveur/src/tests/conftest.py — enregistre le modèle (cleanup)
- serveur/src/tests/test_production_component_progress.py — tests (nouveau)
- client/src/frontend/src/pages/CommandPage.jsx — passe conditionnement/progress + productionId
- client/src/frontend/src/components/command/ProcurementTable.jsx — colonne Cond. + case Préparé
- client/src/frontend/src/components/machine/MachinePnpTables.jsx — colonne Cond. + case Installé (table d'affectation)
- client/src/frontend/src/components/machine/MachineImplantationPanel.jsx — passe productionId
- client/src/frontend/src/components/command/__tests__/ProcurementTable.progress.test.jsx — test (nouveau)
- client/src/frontend/src/components/machine/__tests__/MachineAssignmentTable.progress.test.jsx — test (nouveau)

## Tests
- pytest : 562 passés / 0 échoué (1 skip préexistant). Migration : single-head + roundtrip OK.
- npm test : 41 suites / 155 tests passés (dont les 2 nouveaux fichiers 007).
- Scénarios staging vérifiés :
  - Commande : cocher « Préparé » (100nF, 2.2K) → persiste après reload ; conditionnement affiché.
  - Machine PnP : cocher « Installé » (slots 41/42) → persiste ; conditionnement affiché.
  - Confirmé aussi via API (`/command`, `/feeder-plan`) : is_prepared / is_installed + conditionnement.

## Preuves (front) — OBLIGATOIRE si la feature touche l'UI
- Commande « Préparé » + conditionnement → `docs/prompts/preuves/007/007-commande-prepare-conditionnement.jpg`
- Machine PnP « Installé » + conditionnement → `docs/prompts/preuves/007/007-machinepnp-installe-conditionnement.jpg`

## Erreurs rencontrées & corrections
- Aucune erreur bloquante. (1 clic UI initial hors case pendant les captures — corrigé en
  ciblant la case ; le toggle et sa persistance ont ensuite été confirmés UI + API.)

## Réserves / à finir
- Vue Commande : la table « Composants à commander » masque déjà (comportement préexistant)
  les composants entièrement couverts par le stock (`quantityToOrder = 0`). La case « Préparé »
  ne s'affiche donc que sur les lignes visibles (à commander). Si le besoin est de préparer
  *tous* les composants (y compris ceux couverts par le stock), c'est une évolution à trancher
  (liste dédiée) — non bloquant pour l'objectif du prompt.
- Le client web n'envoie pas d'en-tête `X-Workstation` : `prepared_by/installed_by` restent
  nuls tant qu'un poste n'est pas configuré (le « quand » est renseigné ; le « qui » suit dès
  que l'identité de poste est transmise — infra ADR 0015 déjà en place côté back).
