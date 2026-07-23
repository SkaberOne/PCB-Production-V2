# [018] fix(data): normaliser l'affichage des révisions de cartes (REV_A / A / F / —)

| Champ | Valeur |
|---|---|
| **ID** | 018 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/normalisation-revisions` |
| **Priorité** | basse · **Dépend de** aucune · **Parallèle** : oui |
| **Source** | Audit 2026-07-22 (usage — Stock cartes) · **Créé le** 2026-07-22 |

## 1. Objectif
Uniformiser l'affichage des révisions de cartes. Aujourd'hui, selon la source d'import, on voit `REV_A`, `A`, `F`, ou `—` pour la même notion, et des doublons de référence avec révision vide (`—`) — sur l'écran **Stock cartes** notamment.

## 2. Spécification
1. **Cartographier** d'où viennent les libellés : import CAO/txt (`REV_A`…), import catalogue 011 (dossier `Rev.X` → `A`…), saisie manuelle, legacy. Identifier le champ stocké (`BomRevision.revision` ?) et son format réel.
2. **Décider une forme canonique** d'affichage (proposition : afficher toujours `Rev. X` normalisé, en dérivant de la valeur stockée ; ne PAS casser les clés existantes). Si un doute sur casser des correspondances (matching par (référence, révision)) → **échange**.
3. **Normaliser à l'affichage** (helper front commun) au minimum : `REV_A` / `rev A` / `A` → même rendu ; `—`/vide → libellé explicite (« sans révision »). Idéalement normaliser aussi à l'écriture lors des imports (sans rompre l'idempotence du 011 ni les données existantes).
4. **Doublons `—`** : comprendre pourquoi des lignes stock existent sans révision (stock non rattaché à une révision) et décider affichage/regroupement.

## 3. Spécification technique
- Front : écran `client/src/frontend/src/pages/BoardStockPage.jsx` (colonne Révision) + tout affichage de révision cartes ; util commun de normalisation.
- Back (si normalisation à l'écriture) : chaînes d'import (`bom_catalogue_import`, imports CAO/txt) — attention à l'idempotence et au matching existant.

## 4. Tests
- `npm test` : helper de normalisation (`REV_A`→`A`, `—`→libellé) ; rendu cohérent.
- `pytest` (si écriture touchée) : import n'introduit plus de variantes ; idempotence préservée.
- Staging : Stock cartes affiche des révisions homogènes. Captures `docs/prompts/preuves/018/`.

## 5. DoD
Critères §2 · tests verts · staging + captures · CI verte · PR vers `dev` · RESULTAT.md. Si la normalisation à l'écriture risque de casser le matching → se limiter à l'affichage + **échange**.

## 6. Contraintes
Composant React < 300 lignes · pas de front sans preuve · ne pas rompre l'idempotence du 011. Branche courte depuis `dev`, PR vers `dev`.

## 7. RÉSULTAT — à remplir par l'orchestrateur
