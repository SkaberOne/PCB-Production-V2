# RÉSULTAT — [027] feat(production) : réactiver / désarchiver une production depuis l'UI

- **Statut** : ✅ terminé
- **Branche** : `feat/reactiver-desarchiver-production` (depuis `dev` à jour)
- **PR** : [#104](https://github.com/SkaberOne/PCB-Production-V2/pull/104) vers `dev` — CI verte (backend + frontend + e2e), mergée `--no-ff`

## Problème

L'archivage d'une production était un aller sans retour dans l'UI : le menu ⋮ d'une production archivée ne proposait que Renommer / Mode d'assemblage / Dupliquer / Supprimer. Impossible de récupérer une production archivée par erreur (scénario PROD-05).

## Ce qui a été fait

### Backend
- La transition **`ARCHIVED → DRAFT`** était **déjà autorisée** par `ProductionWorkspaceService.update_production` (tout statut non-`ACTIVE` est appliqué directement). Aucune modification de code serveur nécessaire : le désarchivage réutilise le `PATCH /marketplace/productions/{id}` avec `{status: "DRAFT"}`, exactement comme l'archivage utilise `{status: "ARCHIVED"}`.
- On ne réactive **jamais** directement en `ACTIVE` (on passe par `DRAFT`) pour ne pas court-circuiter l'invariant d'unicité de la production active (`_ensure_single_active_production`).

### Frontend
- **`hooks/useDashboardProductionActions.js`** : nouveau `handleUnarchiveProduction` (miroir de `handleArchiveProduction`) → `PATCH … {status:'DRAFT'}`, toast « Production « X » réactivée (brouillon). », puis `loadProductions()`. Exporté par le hook.
- **`pages/DashboardPage.jsx`** : relaie `onRequestUnarchiveProduction={handleUnarchiveProduction}` à `ProductionsTable`.
- **`components/dashboard/ProductionsTable.jsx`** : accepte et **transmet** `onRequestUnarchiveProduction` à chaque `DashboardProductionRow` (maillon qui manquait — voir « Bug trouvé en staging »).
- **`components/dashboard/DashboardProductionRow.jsx`** : entrée de menu **« Désarchiver »** (icône `Unarchive`, vert) visible **uniquement** si `status === 'ARCHIVED'`. L'entrée « Archiver » reste réservée aux non-archivées. Handler `handleUnarchive → onRequestUnarchiveProduction(production)`.

## Bug trouvé en staging (et corrigé)
La preuve staging a révélé un `TypeError: u is not a function` au clic sur « Désarchiver » : `DashboardPage` passait bien le prop, mais le composant intermédiaire **`ProductionsTable` ne le relayait pas** jusqu'à la ligne (`onRequestUnarchiveProduction` = `undefined`). Corrigé + **test de non-régression** ajouté au niveau `ProductionsTable` (rend la table, clique « Désarchiver », vérifie l'appel du handler) — ce test échouerait sans le relais.

## Tests
- **pytest** : `serveur/src/tests/test_desarchiver_production_027.py` (3) — `ARCHIVED → DRAFT` (PATCH 200 + GET `status == DRAFT`) ; l'invariant « une seule ACTIVE » tient (l'ACTIVE existante reste seule, la désarchivée passe en DRAFT, pas ACTIVE) ; conservation des données (name/notes/assembly_mode). **Suite backend : 622 passed, 1 skipped.**
- **npm** : `DashboardProductionRow.desarchiver.test.jsx` (5, `it.each` sur DRAFT/ACTIVE/COMPLETED) + `ProductionsTable.desarchiver.test.jsx` (1, relais du prop). **Suite frontend : 207 passed / 51 suites.**

## Preuve — staging (:8001), Productions
`docs/prompts/preuves/027/` :
- `027-01-menu-desarchiver.jpg` — menu ⋮ d'une production **archivée** : « Désarchiver » présent (vert), **pas** d'« Archiver ».
- `027-02-desarchive-brouillon.jpg` — **après clic** : la production repasse en **Brouillon** et remonte dans « Productions créées » (réintégration immédiate).
- `027-03-api-aller-retour-archiver-desarchiver.json` — aller-retour API : `ARCHIVED` → `PATCH {status:DRAFT}` → `GET status == DRAFT` (critère d'acceptation).

*(La production de test créée pour la démo a été supprimée et la production active d'origine restaurée : staging laissé propre.)*

## Décision / périmètre
- Réutilisation du mécanisme de transition de statut existant (pas de flux séparé).
- Retour en `DRAFT` (jamais `ACTIVE` direct) — invariant d'unicité respecté.
- Hors périmètre : corbeille / suppression douce ; historique d'archivage.
