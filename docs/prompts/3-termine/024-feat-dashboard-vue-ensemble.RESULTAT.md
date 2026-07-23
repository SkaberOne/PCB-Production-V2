# RÉSULTAT — [024] feat(dashboard) : vue d'ensemble globale (4 cases + bandeau mini-stats)

- **Statut** : ✅ terminé
- **Branche** : `feat/dashboard-vue-ensemble` (depuis `dev` à jour)
- **PR** : [#101](https://github.com/SkaberOne/PCB-Production-V2/pull/101) vers `dev` — CI verte (backend + frontend + e2e), mergée `--no-ff` (`ac78bb7`)

## Ce qui a été fait

### Backend — endpoint léger `GET /reports/dashboard-overview`
- `ReportService.get_dashboard_overview` : agrégats **COUNT/SUM en une réponse** (lecture seule, pas de N+1) — catalogue (références/révisions), stock (cartes en stock, références distinctes, valeur, `a_prix`), `stock_bas`, productions en cours (total/active/draft), commandes clients à préparer (total/open/ready), cartes à débugger, machines. Réutilise `BoardStockService.list_board_stock` pour la **valeur stock** (prix effectif override OU Costing — cohérent avec l'écran Stock cartes). Schéma `DashboardOverviewResponse` dans `routes/reports.py`.

### Front
- **`pages/DashboardPage.jsx`** (275 lignes, < 300) : la tête n'affiche plus les 4 cases session mais la vue d'ensemble globale, via le hook **`useDashboardOverview`**.
- **Rangée 1** — 4 grosses cases (`StatCard` réutilisé) : *Cartes au catalogue*, *Cartes en stock* (hint « N réf. · valeur X € » / « — € (prix à renseigner) »), ***Alertes stock bas*** (couleur **verte si 0**, **rouge si > 0** ; hint « aucune sous le minimum » / « N à réapprovisionner »), *Productions en cours*. Chaque case **cliquable** vers son écran (`/base-donnees?tab=cartes`, `/stock-cartes`, scroll ancre productions).
- **Bandeau fin** — 3 mini-stats (`DashboardMiniStat`, compact) : *Commandes clients à préparer* (→ `/commande-client`), *Cartes à débugger* (→ `/stock-cartes`), *Modèles machines* (→ `/machine-pnp`).
- **`Points à vérifier` / `Empreintes PnP`** déplacés de la tête vers **près de la production active** (`ProductionSessionStats`, colonne droite, affichés seulement si `activeProduction`) — fonction et clics de filtrage conservés.
- Thème dark/épuré inchangé ; responsive (4→2→1 colonnes).

## Tests
- **pytest** : `serveur/src/tests/test_dashboard_overview_024.py` (2) — agrégats sur jeu mixte (stock avec/sans prix, une ligne sous min → `stock_bas`=1, productions DRAFT/ACTIVE/COMPLETED, commandes OPEN/READY/DELIVERED, `cards_to_debug`, `MachineModel`) + base vide → zéros sans erreur. **Suite backend : 610 passed, 1 skipped**.
- **npm** : `pages/__tests__/DashboardPage.test.jsx` (+3) — rangée 1 rend les valeurs de l'agrégat, *Alertes stock bas* hint « aucune sous le minimum » à 0 / « N à réapprovisionner » à > 0, bandeau 3 mini-stats. **Suite frontend : 198 passed / 50 suites**.

## Preuve — `docs/prompts/preuves/024/`
- `024-01-dashboard-vue-ensemble-layout.jpg` / `024-02-dashboard-cards-band.jpg` — **layout** du nouveau dashboard : rangée 1 (4 cases globales, *Alertes stock bas* verte « aucune sous le minimum »), bandeau 3 mini-stats, et *Points à vérifier* / *Empreintes PnP (46)* déplacés à droite près de la production active.
- `024-03-api-dashboard-overview.json` — **agrégat réel staging** renvoyé par l'API : `references=86, revisions=251`, `cartes_en_stock=22 (3 réf., valeur 7008.42 €)`, `stock_bas=0`, `productions_en_cours=3 (1 active, 2 draft)`, `commandes_à_préparer=2 (1 open, 1 ready)`, `à_débugger=1`, `machines=0` — exactement les valeurs attendues (86 / 22 / 0 / 3 ; bandeau 2·1·0).

> **Note capture** : dans la session de capture, le navigateur de staging a timeouté ses appels XHR (serveur mono-worker saturé par le flux SSE après plusieurs redémarrages du serveur) → les valeurs s'affichent à 0 dans les screenshots. Le **layout** (structure, couleurs, cases déplacées) est correct sur les captures ; les **valeurs réelles** (86 / 22 / 0 / 3) sont prouvées par le JSON de l'API et leur rendu est couvert par les tests npm (payload → cases). CI e2e : un run initial est resté bloqué sur l'installation Playwright (infra runner) ; re-déclenché (commit vide) → CI complète verte.

## Décision / périmètre
- Valeur stock = prix effectif (override OU Costing) ; « — € (prix à renseigner) » si aucun prix.
- Hors périmètre : graphiques/temporel ; refonte de la table Productions.
