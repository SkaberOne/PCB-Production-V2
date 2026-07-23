# [020] feat(cartes): supprimer une carte (unitaire + multiple) + recherche réf/nom

| Champ | Valeur |
|---|---|
| **ID** | 020 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/supprimer-carte` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : non avec un prompt touchant CardCatalogPage/CardDetailDialog (ex. 019 : séquencer après 019) |
| **Source** | Retours Eric (nettoyage doublons + recherche) · **Créé le** 2026-07-23 (maj) |

## 1. Objectif (le POURQUOI)
Après l'import en masse (011), il faut pouvoir **nettoyer** le catalogue Cartes : supprimer une carte (doublon), **en supprimer plusieurs d'un coup**, et **retrouver** rapidement une carte par référence ou nom. Aujourd'hui : aucun bouton supprimer une carte entière (juste par révision), aucune recherche.

## 2. Spécification (le QUOI)

Écran : **Base de données → onglet Cartes** (`CardCatalogPage` + `CardDetailDialog`).

### A. Suppression unitaire
- **Bouton « Supprimer la carte »** (rouge, discret) dans la fiche carte (`CardDetailDialog`).
- **Confirmation** via `components/common/ConfirmDialog.jsx` : « Supprimer la carte **{référence} — {nom}** et ses **N révisions** ? Action irréversible. ».
- **Backend** : `DELETE /bom/references/{bom_reference_id}` (auth `X-API-Key`) → service `delete_reference`.
- **Garde-fous (défaut prudent)** : **refuser** (409 + message clair) si la carte est **liée** à une **production**, du **stock cartes** (qté > 0), une **commande**, ou est **sous-carte** d'un assemblage (`assembly_items`). Sinon → suppression **transactionnelle** de `BomReference` + `BomRevision` + `BomItem` + snapshots fichiers (aucun orphelin — cf. leçon `delete_production`, penser à TOUTES les tables enfant, FK SQL Server).

### B. Suppression multiple (bulk)
- **Cases à cocher** par ligne du catalogue (`CardCatalogPage`) + case « tout sélectionner » (sur le résultat filtré).
- Action **« Supprimer la sélection (N) »** → **ConfirmDialog** listant le nombre.
- Traitement : supprimer chaque carte sélectionnée via l'endpoint (boucle client, ou endpoint bulk `DELETE /bom/references` `{ ids: [...] }`). **Les cartes liées sont refusées (409) et NON supprimées** ; à la fin, **rapport clair** : « X supprimées, Y ignorées (liées à …) ».

### C. Recherche
- **Barre de recherche** en tête du catalogue Cartes filtrant en temps réel par **référence** ET **nom** (insensible casse/accents). Filtre côté client sur la liste déjà chargée (simple) ; si la liste devient grosse, filtre serveur (à évaluer).

**Critères d'acceptation :**
- [ ] Bouton **Supprimer la carte** (unitaire) + ConfirmDialog + refus 409 si liée + catalogue rafraîchi.
- [ ] **Sélection multiple** + **Supprimer la sélection** + confirmation + **rapport** (supprimées / ignorées liées).
- [ ] **Barre de recherche** réf + nom, filtrage instantané ; « tout sélectionner » agit sur le résultat filtré.
- [ ] Aucun orphelin en base après suppression (test FK).
- [ ] Captures `docs/prompts/preuves/020/` (suppr. unitaire, bulk avec un cas refusé, recherche).

**Hors périmètre :** fusion/déduplication auto ; backfill des noms legacy (édition manuelle / 021 pour l'import).

## 3. Architecture & décisions
- **Backend** : route BOM + service `delete_reference` (+ éventuel bulk). Réutiliser `bom_file_service.delete_revision_snapshot`. Vérifier les liens via `board_stock`, productions/`bom_links`, commandes, `assembly_items`. **Test avec `PRAGMA foreign_keys=ON`** (SQLite) pour valider la cascade comme en prod.
- **Front** : `CardCatalogPage.jsx` (barre de recherche + colonne cases à cocher + action bulk + rapport) ; `CardDetailDialog.jsx` (bouton unitaire + ConfirmDialog + gestion 409). Découper si > 300 lignes.
- Décision (défaut) : refuser la suppression d'une carte liée plutôt que cascader dans des productions (assouplissable plus tard).

## 4. Plan
1. Cartographier liens d'une `BomReference` + endpoints/services BOM.
2. Service `delete_reference` (checks → 409 / suppression transactionnelle) + éventuel bulk.
3. Endpoint(s) `DELETE`.
4. Front : recherche + sélection multiple + boutons + ConfirmDialog + rapport + refresh.
5. Tests (pytest cascade/refus ; npm recherche/sélection/bulk) + staging + captures.

## 5. Tests
- `pytest` : suppression carte non liée (enfants supprimés, `PRAGMA foreign_keys=ON`) ; refus 409 si liée ; bulk (mix supprimables/refusées) → rapport ; idempotence (404 si déjà supprimée).
- `npm test` : barre de recherche filtre réf+nom ; sélection multiple + « tout sélectionner » sur filtré ; ConfirmDialog ; rapport.
- **Staging (:8001)** : rechercher, sélectionner plusieurs doublons, supprimer → disparaissent ; tenter une carte liée → refus expliqué. Captures `docs/prompts/preuves/020/`.

## 6. DoD
Critères §2 · `pytest` + `npm test` verts · migration N/A · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Package `src` · imports relatifs · `utcnow()` · **action destructive → confirmation + refus si liée** · composant React < 300 lignes (découper) · pas de front sans preuve · lecture seule sur `\\rs\Elec\...`. Branche courte depuis `dev`, PR vers `dev`, CI verte. Bloquant → `echanges/ouverts/`.

## 8. RÉSULTAT — à remplir par l'orchestrateur
