# [013] fix(backend): bugs correctness francs (capacité machine, auto_assign, delete_production)

| Champ | Valeur |
|---|---|
| **ID** | 013 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/correctness-backend` |
| **Priorité** | **haute** · **Dépend de** aucune · **Parallèle** : oui (backend, fichiers distincts) |
| **Source** | Audit 2026-07-22 (R1–R4) · **Créé le** 2026-07-22 |

## 1. Objectif
Corriger 4 bugs backend confirmés par l'audit, dont 2 endpoints capacité cassés à 100 % et une suppression de production qui plante en prod SQL Server.

## 2. Spécification (chaque point = un fix précis + un test de non-régression)

1. **`serveur/src/services/assignment_planning.py:1061`** — `check_machine_capacity` interroge `PnpCart` avec un id de `PnpMachine`. → Remplacer `db.query(PnpCart)` par `db.query(PnpMachine)` (importer PnpMachine). `machine.num_positions` devient valide.
2. **`serveur/src/services/assignment_planning.py:1069`** — `num_assignments = len(query(ProductionPlan).filter(id==plan_id).all())` (toujours 0/1). → `num_assignments = db.query(PlanAssignment).filter(PlanAssignment.production_plan_id == plan_id).count()`.
3. **`serveur/src/services/production_service.py:194`** — `auto_assign_components` tronque via `zip` si capacité insuffisante. → Lever `ValueError` explicite (comme le promet la docstring) en listant les composants qui ne rentrent pas, au lieu de tronquer.
4. **`serveur/src/services/production_workspace_service.py:622`** — `delete_production` oublie `ProductionRun` et `ProductionComponentProgress` (FK NOT NULL, pas de cascade) → IntegrityError en prod. → Avant `db.delete(production)`, purger : `db.query(ProductionRun).filter(production_id==...).delete(synchronize_session=False)` et idem `ProductionComponentProgress`. Vérifier aussi les `StockMovement` liés aux runs supprimés.

## 3. Tests
- `pytest` : (1)/(2) endpoint capacité renvoie des valeurs cohérentes sur un plan avec assignations réelles ; (3) capacité insuffisante lève ValueError ; (4) **test qui déclare un lot (ProductionRun) + un composant préparé (ProductionComponentProgress) puis supprime la production** — doit réussir sans FK error. ⚠ SQLite n'applique pas les FK par défaut : activer `PRAGMA foreign_keys=ON` dans le test (ou vérifier l'absence d'orphelins) pour reproduire le comportement prod.
- Staging : supprimer une production ayant un lot → OK ; endpoint capacité machine cohérent. Captures `docs/prompts/preuves/013/`.

## 4. DoD
Critères §2 remplis · `pytest` vert (dont test FK delete) · staging + captures · CI verte · PR vers `dev` · RESULTAT.md.

## 5. Contraintes
Package `src` · imports relatifs · `utcnow()` · pas de migration nécessaire · pas de front. Branche courte depuis `dev`, PR vers `dev`, CI verte.

## 6. RÉSULTAT — à remplir par l'orchestrateur
