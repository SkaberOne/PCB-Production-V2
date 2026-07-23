# [014] fix(sécurité): durcissement backend (fuite d'erreurs, path traversal, uploads, TLS)

| Champ | Valeur |
|---|---|
| **ID** | 014 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/securite-backend` |
| **Priorité** | **haute** · **Dépend de** aucune · **Parallèle** : non avec 013 si conflit sur routes (sinon oui) |
| **Source** | Audit 2026-07-22 (R5–R8 + mineurs) · **Créé le** 2026-07-22 |

## 1. Objectif
Durcir le backend contre les faiblesses confirmées, surtout exploitables en **mode ouvert** (API_KEY non définie par défaut). LAN de confiance, mais l'ensemble doit être propre avant élargissement d'usage.

## 2. Spécification

1. **Fuite `str(e)` dans les 500** — `serveur/src/routes/marketplace_machines.py:67` + ~65 handlers (`marketplace_inventory.py:41,76`, `bom_files.py:343`, `marketplace_order_import.py:43`, etc.). → Ne plus interpoler `str(e)` dans le `detail`. Logger `logger.exception(...)` côté serveur et renvoyer un message générique stable. **Préférer** supprimer ces `try/except Exception` attrape-tout et laisser remonter au handler global `_unhandled_exception_handler` d'`app.py` (qui fait déjà ce travail) ; ajouter `except HTTPException: raise` là où un catch reste nécessaire.
2. **Path traversal** — `serveur/src/services/bom_file_service.py:35` — `sanitize_segment` ne neutralise pas `..`. → Après nettoyage, si le segment ∈ (`''`,`'.'`,`'..'`) → `'UNDEFINED'`. **Et** vérifier que le chemin résolu (`Path.resolve()`) reste descendant de `storage_root` avant toute écriture/suppression/déplacement.
3. **Énumération répertoires via `root_path`** — `serveur/src/routes/bom_catalogue_import.py:126` — → Ignorer `root_path` venant du client et n'utiliser que la racine configurée (`StockService.get_projects_root_path`), OU valider un confinement strict (`Path.resolve()` + `is_relative_to` d'un dossier autorisé) avant tout `os.listdir`.
4. **Upload PDF non plafonné** — `serveur/src/routes/marketplace_order_import.py:39` — remplacer `data = await file.read()` par `data = await read_upload_capped(file)` (`..utils.uploads`).
5. **XML Eagle** — `serveur/src/services/cao/parser_eagle.py:107` — remplacer `import xml.etree.ElementTree as ET` par `import defusedxml.ElementTree as ET` (ajouter `defusedxml` à `serveur/requirements.txt`). Anti-DoS (expansion d'entités).
6. **TLS SQL** — `serveur/src/config.py:120` — `Encrypt=no` codé en dur. → Rendre `Encrypt` configurable via `.env` (défaut `yes`), garder `TrustServerCertificate=yes` si certificat auto-signé. (Ne pas casser la connexion staging/prod : tester la négociation ; si régression, **échange**.)
7. **CORS** — `serveur/src/app.py:42,110` — retirer `'null'` de la liste par défaut (ou `allow_credentials=False`), l'auth passant par `X-API-Key`.
8. **Fail-fast API_KEY** — `serveur/src/config.py:85` / `create_app` — si `api_env=='production'` et clé vide → lever une erreur explicite au démarrage (ou warning de sécurité très visible). Documenter API_KEY obligatoire hors dev.

## 3. Tests
- `pytest` : sanitize_segment rejette `..` ; import-catalogue ignore/valide root_path ; upload PDF > cap → 413 ; un 500 ne contient plus `str(e)` (message générique) ; fail-fast si production sans clé.
- Staging : imports CAO/PDF OK (non régressés) ; connexion DB OK avec Encrypt configurable. Captures `docs/prompts/preuves/014/` si UI touchée (sinon logs).

## 4. DoD
Critères §2 · `pytest` vert · migration N/A · CI verte · PR vers `dev` · RESULTAT.md. ⚠ Le point (6) TLS : si la négociation échoue en environnement réel → ouvrir un **échange** plutôt que forcer.

## 5. Contraintes
Package `src` · imports relatifs · ne pas exposer de secret · lecture seule sur `\\rs\Elec\...`. Branche courte depuis `dev`, PR vers `dev`.

## 6. RÉSULTAT — à remplir par l'orchestrateur
