# ADR 0002 — Limitations SQLite pour l'isolation des tests

**Date** : 2026-05-29
**Statut** : ⚠️ Identifié (à résoudre)
**Décideurs** : Claude (investigation) · à valider par Eric

---

## Contexte

Lors de la session 1 (29 mai 2026), un bug d'isolation des tests pytest entre fichiers
a été identifié et investigué en profondeur. Symptôme : des tests qui passent en
isolation échouent en suite globale avec des asserts type `assert N == 0`.

Le pattern canonical SQLAlchemy 2.x **transaction-per-test + rollback** a été
implémenté pour résoudre ce bug :

```python
connection = engine.connect()
transaction = connection.begin()
session = Session(bind=connection, join_transaction_mode="create_savepoint")
yield session
session.close()
transaction.rollback()  # → supposé annuler TOUT, y compris les commits internes
```

---

## Découverte

**Le pattern ne fonctionne PAS avec SQLite.**

Vérifié par 3 PoC isolés (script Python pur, sans pytest, sans FastAPI) :

```python
# Itération A : crée item-A, commit, close, rollback
# Itération B : devrait voir 0 items, voit en réalité l'item-A
# → l'item PERSISTE alors que le rollback aurait dû l'annuler
```

Testé avec :
- SQLite `:memory:` + `StaticPool` ❌
- SQLite fichier disque + `NullPool` ❌
- Avec `join_transaction_mode="create_savepoint"` ❌
- Avec `begin_nested()` explicite + event listener `after_transaction_end` ❌

---

## Cause

**Limitation SQLite** : les SAVEPOINTs SQLite ne sont pas strictement transactionnels
comme dans PostgreSQL/MySQL. Le `RELEASE SAVEPOINT` "promote" les changements de manière
persistante dans la connection, et le rollback de la transaction externe ne peut plus
les annuler.

C'est documenté indirectement dans plusieurs threads SQLAlchemy mais pas comme
limitation explicite (PostgreSQL/MySQL = comportement attendu, SQLite = comportement
divergent silencieux).

---

## Décision

**À court terme** : accepter le bug et utiliser `DELETE FROM` agressif entre tests
(`_purge_all_tables()` dans `conftest.py`). Cela résout l'isolation intra-fichier
mais reste imparfait inter-fichiers à cause du connection pool SQLite.

**À moyen terme** : migrer les tests vers SQL Server ou PostgreSQL.

### Options de migration

| Option | Effort | Bénéfice | Inconvénient |
|---|---|---|---|
| SQL Server local | Moyen (le projet supporte déjà) | Identique à la prod | Setup machine dev requise |
| PostgreSQL via Docker | Moyen | Standard industrie | Dépendance Docker |
| `pytest-postgresql` | Faible | Auto-managed | Dépendance lib supplémentaire |
| Garder SQLite + workarounds | Faible | Aucun coût | Bug persiste |

---

## Conséquences

### Si on garde SQLite
- ⚠️ ~30 tests qui passent en isolation échouent en suite globale
- ⚠️ Pas de CI fiable possible sur la suite complète
- ⚠️ Recommandé de lancer pytest **par fichier** plutôt qu'en suite

### Si on migre vers SQL Server / PostgreSQL
- ✅ Tests d'isolation parfaite (savepoint+rollback fonctionne nativement)
- ✅ Tests reflètent le comportement de production (SQL Server)
- ✅ CI possible
- ⚠️ Setup initial (1 semaine de travail)
- ⚠️ Tests un peu plus lents (vs `:memory:`)

---

## Documentation pour les développeurs

Si tu vois des asserts `assert N == 0` qui échouent en suite globale mais passent
en isolation, **ce n'est PAS une régression** — c'est ce bug. Vérifier :

```powershell
# Lancer le test seul → devrait passer
.venv\Scripts\pytest.exe serveur\src\tests\test_reports.py::test_overview_empty_db -v

# Lancer la suite → peut échouer à cause de ce bug
.venv\Scripts\pytest.exe serveur\src\tests\
```

Si seul = OK et suite = échec : laisser tomber, c'est ce bug. Ne pas refactor.

---

## Références
- Investigation détaillée : [[audits/Audit_2026-05-29_final]] section 5
- Code conftest : `serveur/src/tests/conftest.py` (avec docstring explicative)
- SQLAlchemy docs : https://docs.sqlalchemy.org/en/20/orm/session_transaction.html
