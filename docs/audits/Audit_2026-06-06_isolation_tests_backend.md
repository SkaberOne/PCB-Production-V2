# Audit 2026-06-06 — Échecs préexistants de la suite de tests backend

## Contexte

En corrigeant l'export ERP (Référence KT), 10 échecs préexistants ont été constatés
dans `test_marketplace.py` lorsqu'il est lancé en suite (alors que chaque test passe
en isolation). Investigation menée jusqu'à la cause racine, corrections appliquées.

## Symptômes

- `pytest test_marketplace.py` : 10 failed / 17 passed.
- Chaque test échouant passe seul (`pytest ...::test_x` → passed).
- Suite complète `serveur/src/tests` : 47 échecs sur les 5 fichiers concernés
  (cohérent avec les « 57 échecs préexistants » notés le 2026-06-03).
- Erreurs typiques : `assert 7 == 1` (données fantômes), `KeyError: 'id'`
  (création renvoyant 409 doublon), `400 Bad Request`, `NameError`.

## Diagnostic — 3 causes racines

### 1. `conftest.py` importé deux fois → deux bases de test distinctes (cause principale)

Les fichiers de test importaient `from tests.conftest import client, ...`, tandis que
pytest charge le même fichier comme plugin sous le nom `src.tests.conftest`
(`__init__.py` présent). Python crée alors **deux modules distincts**, donc
**deux engines SQLite in-memory** :

```
modules=['src.tests.conftest', 'tests.conftest']
engines={'src.tests.conftest': 1609203828368, 'tests.conftest': 1609317940944}
```

- La fixture autouse `cleanup_db` (drop+recreate par test) s'exécute sur l'engine du
  module plugin.
- Le `client` des tests, lui, écrit dans l'engine de l'autre module — l'ordre
  d'exécution des modules fait que le dernier `app.dependency_overrides` gagne.
- Résultat : **aucune isolation réelle** entre tests en suite ; en isolation, l'engine
  démarre vierge, d'où des tests verts.

**Correction** : import unifié `from src.tests.conftest import ...` dans les 9 fichiers
de test concernés → un seul module, un seul engine, cleanup effectif.

### 2. Caches TTL process-level non invalidés entre tests

`src/utils/catalog_cache.py` (règles de types, lookup footprints, TTL 60 s) survit au
drop+recreate de la DB → un test d'un fichier réchauffait le cache avec ses mappings,
polluant les lectures d'un test d'un autre fichier
(`test_load_saved_bom_session_reuses_existing_footprint_mapping_for_other_boms`).

**Correction** : `invalidate_all()` ajouté dans la fixture `cleanup_db` (avant et après
chaque test).

### 3. Imports manquants dans les fichiers de test

`NameError` sur `Command`, `BomReference`, `BomRevision`, `ComponentTypeRule`,
`MachineFootprintRule`, `Component`, `FootprintMapping` : les tests utilisaient ces
modèles sans les importer (ils transitaient probablement par un état d'import
antérieur). Imports ajoutés dans `test_marketplace.py`, `test_bom_workflow.py`,
`test_components.py`, `test_bom_import.py`.

## Bug produit réel découvert et corrigé

`ReportService.list_top_components` (`report_service.py`) **comptait les composants
DNP** dans le besoin total (`assert 18 == 10`). Partout ailleurs (agrégation commande,
preview frontend), les DNP sont exclus. Filtre `BomItem.dnp.is_(False)` ajouté.
C'était le seul échec des 10 qui révélait un vrai bug de code produit ; le test était
correct.

## Incident d'intervention (noté pour mémoire)

Premier remplacement d'imports fait via PowerShell `Get-Content`/`Set-Content` →
**corruption d'encodage UTF-8** (mojibake) sur les 9 fichiers. Restauré via
`git checkout`, refait proprement en Python (`read_text/write_text encoding='utf-8'`).
Règle : ne jamais réécrire des fichiers UTF-8 accentués avec les cmdlets PowerShell
sans `-Encoding` explicite en lecture ET écriture — préférer Python.

## Résultats

| Périmètre | Avant | Après |
|---|---|---|
| `test_marketplace.py` | 10 failed / 17 passed | **27/27 verts** |
| `test_components.py` | 9 failed | **25/25 verts** |
| `test_bom_workflow.py` | 9 failed | **22/22 verts** |
| `test_bom_import.py` | 3 failed | **11/11 verts** |
| Suite complète hors migrations | — | **253 passed, 1 skipped, 0 failed** |
| Suite complète totale | ~57 échecs (2026-06-03) | **16 failed** (migrations uniquement) |

## Reste à faire — chantier séparé

`test_migrations.py` : 16 échecs. Cause apparente : **rupture de la chaîne Alembic** —
`test_chain_has_no_gaps` attend `e1a3b7c9d4f2` mais trouve `k5f6a7b8c9d0` comme
`down_revision` (révision manquante ou ordre cassé), ce qui fait échouer en cascade
les tests up/down par étape. À rapprocher du gotcha connu : dev.db a reçu des `ALTER`
manuels hors Alembic. Recommandation : audit dédié de la chaîne de migrations
(reconstituer l'ordre, créer la révision manquante ou corriger les `down_revision`).

## Recommandations

1. Lancer systématiquement la suite **complète** (pas fichier par fichier) avant
   commit : c'est le seul mode qui détecte les fuites d'isolation.
2. Toute nouvelle table/modèle doit être importée dans `conftest.py` (sinon exclue du
   drop+recreate).
3. Tout nouveau cache process-level doit être branché sur `invalidate_all()`.
4. Convention d'import unique dans les tests : `from src.tests.conftest import ...`.
