# RÉSULTAT — [014] fix(sécurité) : durcissement backend

- **Statut** : ✅ terminé
- **Branche** : `fix/securite-backend` (depuis `dev` à jour)
- **PR** : [#92](https://github.com/SkaberOne/PCB-Production-V2/pull/92) vers `dev`
- **Type** : backend uniquement — **aucun changement front**

## Ce qui a été fait (8 points de l'audit R5–R8 + mineurs)

1. **Fuite d'erreurs dans les 500** — suppression de `str(e)`/`str(exc)` dans les `detail` des réponses 500 sur **36+ handlers** répartis sur 8 fichiers de routes (`marketplace_inventory`, `marketplace_machines`, `marketplace_productions`, `marketplace_command_core`, `marketplace_command_plans`, `bom_files`, `bom_revision_imports`, `bom_components`, `marketplace_erp_defaults`, `marketplace_production_command`, `marketplace_supplier_offers`, `marketplace_order_import`). Chaque handler logue `logger.exception(...)` côté serveur et renvoie un message générique stable *« Erreur interne du serveur. »*. Ajout de `except HTTPException: raise` avant le `except Exception` pour **ne plus convertir les 4xx en 500** (bug latent des catch-all). Le handler global `_unhandled_exception_handler` d'`app.py` reste le filet final.
2. **Path traversal** (`bom_file_service.py`) — `sanitize_segment` neutralise désormais les segments `''`, `'.'`, `'..'` → `'UNDEFINED'`. Nouveau `_assert_within_root()` (résolution `Path.resolve()` + confinement sous `storage_root`) appelé avant toute écriture/suppression/renommage (`save_revision_snapshot`, `delete_revision_snapshot`, `rename_reference_tree`, `rename_revision_tree`).
3. **Énumération de répertoires via `root_path`** (`bom_catalogue_import.py`) — l'override `root_path` du client est **confiné strictement** sous la racine des projets configurée (`StockService.get_projects_root_path`) : `403` si hors racine, `422` si aucune racine configurée. Bloque l'énumération d'un dossier arbitraire du serveur.
4. **Upload PDF non plafonné** (`marketplace_order_import.py`) — `await file.read()` remplacé par `await read_upload_capped(file)` → `413` au-delà de `max_upload_mb`.
5. **XML Eagle** (`cao/parser_eagle.py`) — `xml.etree.ElementTree` remplacé par `defusedxml.ElementTree` (anti-DoS expansion d'entités). `defusedxml>=0.7` ajouté à `requirements.txt` **et** `requirements_flexible.txt` (utilisé par la CI).
6. **TLS SQL** (`config.py`) — `Encrypt` codé en dur (`no`) rendu **configurable** via `SQL_ENCRYPT` (défaut `yes`), `TrustServerCertificate=yes` conservé. ⚠ **Aucune régression staging/prod** : ces environnements utilisent un `DATABASE_URL` **override** complet (Encrypt=no y est déjà fixé dans le `.env`/`.bat`), donc le builder d'URL modifié n'est **pas** emprunté par eux — pas d'échange nécessaire.
7. **CORS** (`app.py`) — `allow_credentials=False` (l'auth passe par l'en-tête `X-API-Key`, aucun cookie — vérifié par recherche `set_cookie`/`withCredentials`). Neutralise le risque d'une origine `"null"` (Electron `file://`) créditée, tout en gardant `"null"` pour l'app packagée.
8. **Fail-fast API_KEY** (`app.py`) — `create_app()` refuse de démarrer si `api_env == "production"` et `API_KEY` vide (l'API `/api/*` resterait sinon ouverte sans authentification).

## Tests

- **pytest ciblé** — `serveur/src/tests/test_securite_014.py` (9 tests ; capture `docs/prompts/preuves/014/pytest_securite_014.txt`) : sanitize `..`/`.`/`''` ; `_assert_within_root` refuse la sortie ; import-catalogue `403` hors racine + `422` sans racine ; upload > cap `413` ; **500 générique sans fuite** (une exception au message secret ne se retrouve pas dans la réponse) ; `parser_eagle` utilise defusedxml ; fail-fast production sans clé (+ OK avec clé).
- Tests **011** (`test_catalogue_import.py`) adaptés au confinement (racine configurée dans le test).
- **Suite complète** : `582 passed, 1 skipped`.

## Preuves — `docs/prompts/preuves/014/`

- `pytest_securite_014.txt` — sortie `-v` des 9 tests (PASSED).
- `staging_verif.txt` — staging :8001 redémarré sur la branche : `GET /api/health` 200 ; `GET /api/marketplace/carts` et `/machines` 200 (connexion DB OK) → l'app démarre avec CORS/fail-fast/handlers modifiés et la base répond.

## Réserve

- 014 est **backend pur** : aucune UI modifiée, donc pas de capture d'écran front. La non-régression des imports CAO/PDF est couverte par la suite pytest (`test_cao_import_*`, `test_bom_import`, `test_catalogue_import`) et le boot staging.
