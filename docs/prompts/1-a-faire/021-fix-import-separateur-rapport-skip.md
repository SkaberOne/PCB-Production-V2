# [021] fix(import catalogue 011): séparateur réf/nom robuste + rapport des dossiers ignorés

| Champ | Valeur |
|---|---|
| **ID** | 021 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/catalogue-separateur-skip` |
| **Priorité** | normale · **Dépend de** 011 (mergé) · **Parallèle** : oui (isolé sur la chaîne catalogue) |
| **Source** | Investigation staging (Eric : cartes manquantes/sans nom) · **Créé le** 2026-07-23 |

## 1. Objectif (le POURQUOI)
L'import en masse (011) **ignore silencieusement** les dossiers cartes dont le nom n'utilise pas exactement le séparateur ` - `. Sur le partage réel, **5 cartes KT** utilisent un **espace** (ou rien) au lieu de ` - ` et ne sont **jamais importées** — sans que l'utilisateur le voie clairement. Exemples confirmés : `KT190300 MPX 1.0`, `KT200026` (réf seule, pas de nom), `KT220348 opt_sensor_PMT9101`, `KT220863A Rotary_Supply_Control`, `KT260009A FLASH-100`.

But : **importer aussi** ces cartes (séparateur tolérant) **et** rendre visible ce qui est ignoré (rapport) pour qu'aucune carte ne disparaisse en silence.

> Note : les cartes « réf sans nom » déjà en base (ex. `AMPLI_GEN6`, `BISTABLE BOARD`, `Carrier Board D3000`) sont des entrées **legacy** (anciens imports .txt/CAO), **pas** un bug 011 — hors périmètre de ce prompt (édition manuelle du nom via la fiche, ou suppression via 020).

## 2. Spécification (le QUOI)
Fichier clé : **`serveur/src/services/catalogue_import_service.py`** — `parse_card_folder` (regex `_CARD_RE`) + `scan_catalogue` (liste `skipped`).

1. **Séparateur tolérant** : accepter comme séparateur réf/nom `-`, `_`, un ou plusieurs **espaces**, tiret long `–`/`—`, avec espaces optionnels autour. Regex proposée : `^(KT\d+[A-Za-z]?)\s*(?:[-_–—]|\s)\s*(.+)$` (à valider). La partie référence reste `KT\d+[A-Za-z]?`.
2. **Référence seule (sans nom)** : un dossier `KT200026` (aucun nom après la référence) doit être **importé** avec `name` vide (ou `name = référence` — à décider ; défaut proposé : `name` vide, pas de skip), **pas ignoré**.
3. **Rapport des ignorés visible** : `scan_catalogue` renvoie déjà `skipped` (dossiers non exploitables : `Archives`, `history`, sans `Rev.X`, sans CAO…). **Exposer ce rapport dans l'UI d'import catalogue** (`CatalogueImportPanel`) — liste claire « X dossiers ignorés (raison) » après dry-run **et** après import, pour que l'utilisateur voie ce qui n'a pas été pris et pourquoi. Distinguer « ignoré = pas une carte » (Archives…) de « ignoré = format non reconnu » (à corriger côté dossier ou côté regex).
4. **Idempotence préservée** : re-lancer n'importe que les révisions absentes (comportement 011 inchangé). Après ce fix, un nouveau dry-run/import doit **récupérer les 5 cartes** aujourd'hui manquantes.

**Critères d'acceptation :**
- [ ] Dossiers `KT… ` avec séparateur **espace / underscore / tiret long** → **importés** (réf + nom corrects).
- [ ] Dossier `KT<ref>` **sans nom** → importé avec nom vide (non ignoré).
- [ ] Les **5 cartes** listées (dont `KT190300 MPX 1.0`) apparaissent après un nouvel import.
- [ ] **Rapport des dossiers ignorés affiché** dans l'UI (dry-run + import), avec raison.
- [ ] Aucune régression sur les dossiers conformes `KT… - …` (les 73 déjà OK).
- [ ] Captures `docs/prompts/preuves/021/` (avant/après + rapport ignorés).

**Hors périmètre :** backfill des noms des cartes **legacy** existantes (édition manuelle / 020) ; parseur KiCad ; normalisation des révisions (018).

## 3. Architecture & décisions
- **Backend** : `catalogue_import_service.parse_card_folder` (regex) + `scan_catalogue` (ne plus « skip » un `KT…` sans nom : l'importer avec nom vide ; garder skip pour Archives/history/dossiers sans CAO). Tests unitaires sur `parse_card_folder` avec tous les séparateurs.
- **Frontend** : `client/src/frontend/src/components/import/CatalogueImportPanel.jsx` — afficher la section « Dossiers ignorés » du rapport (déjà renvoyée par l'API ; sinon l'ajouter au payload).
- **Lecture seule** sur le partage (aucune écriture dans `\\rs\Elec\...`).
- Décision (défaut) : `KT<ref>` sans nom → importé avec nom vide (l'utilisateur complètera). Si Eric préfère `name = référence` → ajuster (léger).

## 4. Plan
1. Élargir `_CARD_RE` (séparateurs) + gérer « réf seule » (nom vide) dans `parse_card_folder`/`scan_catalogue`.
2. S'assurer que `skipped`/rapport distingue « pas une carte » vs « format non reconnu » et est renvoyé au front.
3. Front : afficher le rapport des ignorés (dry-run + import).
4. Tests + staging (dry-run sur le vrai partage → les 5 cartes apparaissent, rapport visible) + captures.

## 5. Tests
- `pytest` : `parse_card_folder` sur `KT190300 MPX 1.0`, `KT200026`, `KT220348 opt_sensor_PMT9101`, `KT180241 - Carrier Board XAAR 5601 - 117FC` (nom avec tiret, non régressé), `Archives` (toujours ignoré) → résultats attendus ; scan renvoie le rapport ignorés.
- `npm test` : le panneau d'import affiche la liste des dossiers ignorés.
- **Staging (:8001)** : dry-run sur `\\rs\Elec\00 - Conception PCB\Articles sur plan` → les 5 cartes manquantes apparaissent en « à importer », rapport des ignorés visible. Captures `docs/prompts/preuves/021/`.

## 6. DoD
Critères §2 · `pytest` + `npm test` verts · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Package `src` · imports relatifs · **lecture seule** sur `\\rs\Elec\...` · idempotence 011 préservée · composant React < 300 lignes · pas de front sans preuve. Branche courte depuis `dev`, PR vers `dev`, CI verte.

## 8. RÉSULTAT — à remplir par l'orchestrateur
