# Audit 2026-06-06 — Dérive de la chaîne de migrations Alembic

## Contexte

Suite à l'audit d'isolation des tests backend
(`Audit_2026-06-06_isolation_tests_backend.md`), restaient 16 échecs dans
`test_migrations.py`. Investigation menée jusqu'à la cause racine. Décision
d'Eric (2026-06-06) : **en rester là pour aujourd'hui** — corriger ce qui est
sûr, documenter la dérive, traiter la réconciliation plus tard.

## Ce qui a été corrigé (sûr, appliqué)

1. **Chaîne de révisions du test obsolète.** `REVISION_CHAIN` dans
   `test_migrations.py` s'arrêtait à `e1a3b7c9d4f2` (10 révisions) alors que la
   chaîne réelle compte 17 révisions (head = `k5f6a7b8c9d0`). Les 7 manquantes :
   erp_context, reel_fields, supplier_offers, erp_defaults, command_receipts,
   num_nozzles, nozzle_layout. Liste mise à jour. **La chaîne Alembic elle-même
   est saine** : 1 base, 1 head, 17/17 liées, aucun trou, aucun cycle.

2. **API Alembic périmée dans le test.** Le helper `run_upgrade/run_downgrade`
   appelait `mc.run_migrations(fn=...)` — ignoré par Alembic 1.18. Corrigé :
   `fn` passé via `opts=` à `MigrationContext.configure()`, et exécution
   enveloppée dans `Operations.context(mc)` pour installer le proxy `op`.

3. **2 migrations non portables SQLite.** `7b4a1c2e9f10` et `d8f2b91d3c4e`
   utilisaient `op.create_foreign_key` / `op.drop_constraint` en ALTER direct
   (rejeté par SQLite). Converties en `op.batch_alter_table` — pattern Alembic
   portable : ALTER natif sur SQL Server (prod inchangé), copy-move sur SQLite.

Résultat : **16 → 8 échecs** ; suite globale 270 passed, 8 failed, 1 skipped.

## Cause racine des 8 échecs restants — dérive migrations ↔ modèles

**10 tables présentes dans les modèles SQLAlchemy ne sont créées par AUCUNE
migration** :

```
COMMANDS, COMMAND_ITEMS, COMPONENT_TYPE_RULES, MACHINE_FOOTPRINT_CATALOG,
MACHINE_FOOTPRINT_RULES, PLAN_ASSIGNMENTS, PNP_FEEDERS, PNP_MACHINES,
PNP_MACHINE_FEEDERS, PRODUCTION_PLANS
```

Conséquences directes sur les tests restants :

- `test_head_revision_tables_exist` attend `PNP_MACHINES`, `PNP_FEEDERS` après
  upgrade → absentes.
- `7b4a1c2e9f10` crée une FK `PRODUCTIONS.machine_id → PNP_MACHINES`, mais
  `PNP_MACHINES` n'est jamais créée par migration → la reconstruction batch
  (downgrade SQLite) échoue sur `NoSuchTableError: PNP_MACHINES`.

### Pourquoi l'application fonctionne malgré tout

- En dev et en test, le schéma est créé par `Base.metadata.create_all()`
  (cf `conftest.py`, `database.py`) — pas par Alembic.
- `serveur/src/alembic/env.py` **force le mode offline** (lignes 85-90 : la
  branche online appelle quand même `run_migrations_offline()`). Autrement dit,
  `alembic upgrade` n'exécute jamais de DDL contre une vraie base — il émet du
  SQL. Les migrations ne provisionnent donc rien en pratique.
- Gotcha déjà connu : `dev.db` est entretenue hors Alembic (ALTER manuels).

**Les migrations Alembic sont aujourd'hui vestigiales et désynchronisées des
modèles.** Elles ne sont la source de vérité d'aucun environnement.

## État prod

Inconnu au 2026-06-06 (pas encore déployé / mécanisme non arrêté). Cette
question conditionne la stratégie de réconciliation : si la prod est un jour
provisionnée par `create_all` ou DDL manuel, Alembic restera optionnel ; si on
veut qu'Alembic devienne la source de vérité, il faut réconcilier ET décider du
`stamp` initial des bases existantes.

## Plan de réconciliation (chantier futur, NON fait)

Quand la décision prod sera prise :

1. **Avant `7b4a1c2e9f10`** dans la chaîne : créer `PNP_MACHINES`,
   `PNP_FEEDERS`, `PNP_MACHINE_FEEDERS` (la FK de `7b...` en dépend).
2. **En tête de chaîne** (après `k5f6a7b8c9d0`) : créer les 7 autres tables non
   référencées par des FK de migration : `COMMANDS`, `COMMAND_ITEMS`,
   `PRODUCTION_PLANS`, `PLAN_ASSIGNMENTS`, `COMPONENT_TYPE_RULES`,
   `MACHINE_FOOTPRINT_CATALOG`, `MACHINE_FOOTPRINT_RULES`.
3. Corriger `env.py` : la branche online doit appeler `run_migrations_online()`
   (et idéalement honorer `config.attributes["connection"]` pour les tests).
4. Décider du `alembic stamp` des bases existantes (dev.db, prod) pour éviter
   les « table already exists » au premier upgrade.
5. Idéalement : ajouter un test qui compare `Base.metadata.tables` au schéma
   produit par `upgrade head` afin de détecter toute dérive future
   automatiquement.

## Recommandation intérimaire

Marquer les tests d'exécution complète (`TestFullMigrationChain`,
`TestIndividualMigrationSteps`) en `xfail(reason="migrations désync. modèles —
cf audit 2026-06-06")` pour repasser la suite au vert visuel sans masquer le
sujet — **non fait** sur décision d'en rester là ; à activer si le rouge gêne
la CI.
