# [015] perf(backend): N+1 dashboard + cluster de requêtes par-élément

| Champ | Valeur |
|---|---|
| **ID** | 015 · **Type** perf · **Branche cible** `dev` · **Branche** `perf/nplus1-backend` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : oui (services distincts) |
| **Source** | Audit 2026-07-22 (perf) · **Créé le** 2026-07-22 |

## 1. Objectif
Supprimer les N+1 confirmés, à commencer par le **dashboard** (chemin chaud, latence croît avec le volume). Aucune régression fonctionnelle : mêmes résultats, moins de requêtes.

## 2. Spécification (par ordre d'impact)

1. **Dashboard** — `serveur/src/services/report_service.py:124` (`get_productions_summary`) : ajouter `.options(joinedload(Production.machine), joinedload(Production.bom_links))` ; remplacer les agrégats par-production par **une** requête `GROUP BY production_id` sur `ProductionRun` (dict) + une requête unique du dernier `Command` par production ; sortir `can_i_produce` de la boucle (ou version batchée). Pagination/limite si `include_finished`.
2. **`serveur/src/services/production_stock_service.py:256`** (`can_i_produce`) : lire `stocks[component_id].loss_pct` au lieu d'appeler `_effective_loss_pct` (qui requête par composant) ; passer le lookup Component déjà chargé à `aggregate_needs_per_board` (éviter le 2ᵉ full-scan Component).
3. **`serveur/src/services/costing_service.py:394`** (`list_cards`) : remplacer la requête ProductionCosting par référence par **une** requête (sous-requête MAX(computed_at) ou `row_number()`) → dict.
4. **`serveur/src/services/production_service.py:516`** (`get_plan_summary`) : charger les Component en une requête `.in_(ids)` → dict.
5. **`serveur/src/routes/bom_components.py:918,892`** + imports lourds : handlers `async def` à corps synchrone (openpyxl/PDF) → passer en `def` (threadpool FastAPI) **ou** `await run_in_threadpool(...)`. Garder `read_upload_capped` async.
6. **Mineurs** (même patron `.in_()` / préchargement) : `costing_service.py:305`, `bom_catalogue_import.py:77`, `assignment_planning.py:835`, `supplier_offer_service.py:326`.

## 3. Tests
- `pytest` : résultats **inchangés** sur les endpoints touchés (dashboard summary, can_i_produce, list_cards, plan summary) — comparer avant/après sur fixtures. Optionnel : compter les requêtes (echo SQLAlchemy) pour prouver la baisse.
- Staging : dashboard se charge avec plusieurs productions ; valeurs cohérentes. Captures `docs/prompts/preuves/015/`.

## 4. DoD
Critères §2 · `pytest` vert (parité résultats) · CI verte · PR vers `dev` · RESULTAT.md. Peut être livré en incréments (dashboard d'abord).

## 5. Contraintes
Package `src` · imports relatifs · pas de changement de schéma. Branche courte depuis `dev`, PR vers `dev`.

## 6. RÉSULTAT — à remplir par l'orchestrateur
