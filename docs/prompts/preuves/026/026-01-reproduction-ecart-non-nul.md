# Preuve 026 — Aperçu annonce ce qui SERA importé (staging :8001)

Reproduction de l'écart décrit par le prompt : « supprimer 2-3 cartes présentes
sur le partage, lancer l'aperçu → il doit annoncer un nombre non nul de révisions
à importer, égal à ce que fera l'import réel. »

Partage configuré : `\\rs\Elec\00 - Conception PCB\Articles sur plan` (lecture seule).

## Séquence exécutée (API `/api/bom/import-catalogue`, staging :8001)

| Étape | Appel | Résultat |
|---|---|---|
| 1. État nominal | `dry_run=true` | `a_importer = 0` (tout le partage déjà en base) |
| 2. Créer l'écart | `DELETE /bom/references/60` (KT200097, « Led 55mm », 1 révision, non liée) | `{"deleted":true,"id":60,"reference":"KT200097"}` |
| 3. Aperçu | `dry_run=true` | **`a_importer = 1`** → détail : `KT200097 / A / Led 55mm` (voir capture `026-02-apercu-tuile-a-importer.jpg`) |
| 4. Import réel | `dry_run=false` | **`revisions_imported = 1`** → **coïncide avec l'aperçu**. `components_created = 0` (composants déjà en bibliothèque → réutilisés, aucune perte de MPN) |
| 5. Idempotence | `dry_run=true` | `a_importer = 0` → KT200097 restauré, plus rien à importer |

Avant le correctif, l'étape 3 affichait `0 révision(s) importée(s)` (compteur
d'écriture, nul en aperçu) et **aucun** compteur « à importer » : l'opérateur
concluait à tort « rien à importer ». Après le correctif, l'aperçu annonce
`1 révision(s) à importer` — chiffre **égal** à l'import réel (étape 4).

## Aucune écriture en mode aperçu
Entre les étapes 2 et 4, KT200097 est resté absent de la base malgré les aperçus
répétés : l'aperçu ne crée ni révision, ni composant, ni fichier sur le partage.

## Cohérence aperçu ⇄ import réel (fichier CAO illisible)
Correctif clé : l'aperçu **parse réellement** chaque révision candidate (mêmes
`prepare_cao_import` + `import_bom` + validation que l'import réel), sans
persistance. Une révision n'est comptée « à importer » que si l'import réel
saurait l'importer.

Sur le partage réel, `KT180474 / Rev.C` a un fichier Eagle corrompu
(`not well-formed (invalid token): line 953, column 87`). Avant le correctif,
l'aperçu l'aurait classée « importable » (a_importer surévalué) alors que
l'import réel échoue. Après le correctif, aperçu **et** import réel la classent
identiquement `error` — voir `026-03-apercu-idempotent-et-coherence-cao.json`.
