# RÉSULTAT — [026] fix(import-catalogue) : l'aperçu (dry-run) annonce ce qui sera importé

- **Statut** : ✅ terminé
- **Branche** : `fix/import-catalogue-apercu-a-importer` (depuis `dev` à jour)
- **PR** : [#103](https://github.com/SkaberOne/PCB-Production-V2/pull/103) vers `dev` — CI verte (backend + frontend + e2e), mergée `--no-ff` (`3fb8d4e`)

## Problème

En mode Aperçu (dry-run), l'écran affichait `0 révision(s) importée(s)` / `0 composant(s) créé(s)` (compteurs d'**écriture**, nuls par nature en aperçu) et ne montrait que la liste des dossiers ignorés. L'opérateur en concluait « rien à importer », alors que l'import réel lancé juste après créait bien des révisions.

## Ce qui a été fait

### Backend
- **Schéma** `CatalogueImportResponse` (`schemas/bom.py`) : nouveaux champs `a_importer: int` (défaut 0) et `a_importer_details: List[dict]` — ce qui **serait** importé, distinct des compteurs d'écriture `revisions_imported` / `components_created`.
- **Route** `routes/bom_catalogue_import.py` : `a_importer` = nombre de révisions à statut `importable` ; `a_importer_details` = `[{reference, revision, name}]`.
- **Cohérence aperçu ⇄ import réel** (le point clé) : le dry-run **parse désormais réellement** chaque révision candidate. Extraction d'un helper mutualisé `_parse_revision_faces(files, footprint_lookup)` (mêmes `prepare_cao_import` + `import_bom` + `validate_bom_data` que l'import réel, **sans persistance**). Une révision n'est comptée « à importer » **que si l'import réel saura l'importer** ; un fichier CAO illisible passe en `error` — **même verdict, même message** dans les deux modes. `_import_card_revision` réutilise ce helper (parse puis persiste).
- **Lecture seule stricte** : aucune écriture DB ni partage en aperçu (seuls des fichiers temporaires locaux servent au parse). `footprint_lookup` est désormais calculé aussi en aperçu (lecture DB) pour un parse fidèle.

### Front — `components/import/CatalogueImportPanel.jsx`
- En mode aperçu : tuile dédiée **`data-testid=catalogue-a-importer`** → « **N révision(s) à importer** » (verte si N>0, grise si 0). Les compteurs d'écriture `importée(s)` / `créé(s)` ne s'affichent **qu'en import réel**. Le rapport des dossiers ignorés reste inchangé ; la liste (réf + révision) des révisions à importer figure déjà dans le tableau (statut « Importable »).

## Tests
- **pytest** : `serveur/src/tests/test_catalogue_import.py` (+2) —
  - `test_import_catalogue_dry_run_annonce_a_importer` : 2 révisions Eagle absentes → `a_importer == 2` == nb de lignes `importable` ; détails corrects ; **aucune écriture** ; import réel → `revisions_imported == a_importer` ; nouvel aperçu → `a_importer == 0` (idempotence).
  - `test_import_catalogue_dry_run_exclut_cao_illisible` : un `.brd`/`.sch` corrompu → `error` (pas « à importer ») à l'aperçu **comme** à l'import réel ; `a_importer == 1` (seule la carte valide) == `revisions_imported`. **Suite backend : 618 passed, 1 skipped.**
- **npm** : `components/import/__tests__/CatalogueImportPanel.test.jsx` (+2) — tuile « à importer » affiche la bonne valeur en aperçu ; annonce `0` quand rien à importer. **Suite frontend : 202 passed / 50 suites.**

## Preuve — staging (:8001), Base de données → Import catalogue
`docs/prompts/preuves/026/` :
- `026-01-reproduction-ecart-non-nul.md` — séquence API : suppression de `KT200097` (non liée, sur le partage) → aperçu **`a_importer = 1`** → import réel **`revisions_imported = 1`** (coïncidence) → aperçu **`a_importer = 0`** (idempotence, carte restaurée ; `components_created = 0` → composants réutilisés, aucune perte de MPN).
- `026-02-apercu-tuile-a-importer.jpg` — tuile **« 1 révision(s) à importer »** (KT200097) + rapport des 49 dossiers ignorés préservé.
- `026-03-apercu-idempotent-et-coherence-cao.json` — état nominal `a_importer = 0` + cohérence CAO : `KT180474 / Rev.C` (fichier Eagle réellement corrompu sur le partage) classée `error` (`not well-formed…`) — avant le correctif l'aperçu l'aurait comptée « importable » à tort.

## Décision / périmètre
- Tuile « à importer » **visible uniquement en dry-run** (les compteurs d'écriture restent pour l'import réel).
- Compromis assumé : l'aperçu parse réellement les révisions **candidates** (celles absentes de la base). Coût léger (lecture + parse des seules révisions manquantes, jamais des « déjà en base ») en échange d'une **coïncidence exacte** aperçu/import réel, exigée par le prompt.
- Hors périmètre : refonte du parseur, cartes KiCad (toujours listées « à venir »).
