# [025] feat(cartes): éditer la référence d'une carte depuis le pop-up (fiche carte)

| Champ | Valeur |
|---|---|
| **ID** | 025 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/editer-reference-carte` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : non avec un prompt touchant `CardDetailDialog`/`update_card` (ex. 020/023) |
| **Source** | Retour Eric (Base de données / Cartes) · **Créé le** 2026-07-23 |

## 1. Objectif (le POURQUOI)
Dans **Base de données → Cartes**, le pop-up qui s'ouvre au clic sur une carte (`CardDetailDialog`) permet déjà d'éditer le **nom**, le **code KELENN** (`part_number`), le **type** et la **catégorie** — mais **pas la référence** (le champ `reference`, affiché en titre du pop-up, ex. `KT240576`). Eric veut pouvoir **corriger/modifier la référence** d'une carte directement là (fautes de frappe, harmonisation, carte legacy mal nommée).

## 2. Spécification (le QUOI)

### A. Backend — étendre la mise à jour de carte
Endpoint existant : **`PUT /marketplace/cards/{bom_reference_id}`** → `update_card(request: CardUpdate)` (service `..._service.update_card`).
- **Schéma `CardUpdate`** : ajouter `reference: Optional[str]` (`min_length=1`, `max_length=100`).
- **Service `update_card`** : si `reference` est fourni et **diffère** de l'actuelle (après `strip()`) :
  1. **Valider** non vide.
  2. **Unicité** : refuser si une **autre** `BomReference` porte déjà cette référence (`BomReference.reference == new, BomReference.id != ref.id`) → **409** avec message clair (« Référence déjà utilisée par une autre carte »). Réutiliser le patron du contrôle `part_number` déjà présent.
  3. Mémoriser `old_reference`, puis `ref.reference = new`.
  4. Après commit, **déplacer les snapshots fichiers** : `bom_file_service.rename_reference_tree(old_reference, new_reference)` (déjà garde-fou `_assert_within_root` — écrit **uniquement** dans le stockage interne des snapshots, **jamais** sur le partage `\\rs\Elec\...`).
  5. Attraper une éventuelle `IntegrityError` (contrainte `unique` SQL) → **409** propre (pas de 500).
- **Route** : mapper le conflit → `HTTPException(409, detail=...)`.
- **Note liens** : `BoardStock`, commandes, assemblages lient la carte par **id numérique** (`bom_reference_id`) → **aucune casse** à la clé. Rien d'autre à cascader.

### B. Frontend — champ référence éditable dans le pop-up
Fichier : **`client/src/frontend/src/components/library/CardDetailDialog.jsx`**.
- Rendre la **référence éditable** : soit un `TextField` **« Référence »** dans le bloc métadonnées (à côté du nom / code KELENN), soit un mode édition (crayon) sur le titre. **Défaut proposé** : `TextField` « Référence » (helper : « Référence catalogue unique, ex. KT240576 »), pré-rempli avec `card.reference`, envoyé dans le **même** `PUT /marketplace/cards/{id}` que les autres métadonnées (ajouter `reference` au payload existant).
- **Gestion 409** : si la référence est déjà prise, afficher un message clair (`setError` / Alert) sans fermer le pop-up ; ne pas perdre les autres champs saisis.
- **Rafraîchir** le catalogue après succès (`onSaved` / `onReload`) pour refléter la nouvelle référence (titre, table, stock).
- Composant déjà volumineux → **découper si > 300 lignes** (extraire le bloc métadonnées si besoin).

**Critères d'acceptation :**
- [ ] Le pop-up permet d'**éditer la référence** d'une carte et de l'enregistrer.
- [ ] **Unicité** respectée : référence déjà utilisée → **refus 409** + message clair, pop-up conservé.
- [ ] Snapshots fichiers **déplacés** vers la nouvelle référence (`rename_reference_tree`), **aucune écriture** sur `\\rs\Elec\...`.
- [ ] Après renommage : titre du pop-up, ligne de catalogue et écran Stock cartes reflètent la nouvelle référence (liens par id intacts).
- [ ] `name` / `part_number` / `card_type` / `category` **inchangés** si non modifiés.
- [ ] Captures `docs/prompts/preuves/025/` (édition OK + cas 409 doublon).

**Hors périmètre :** renommer le dossier source sur le partage (lecture seule) ; l'idempotence de l'import catalogue (011) matche les dossiers par référence — après renommage, un futur import **peut recréer** l'ancienne carte (le dossier partage garde son nom) : **comportement attendu**, à documenter, pas à corriger ici.

## 3. Architecture & décisions
- **Backend** : `CardUpdate` (+`reference`), `update_card` (validation + unicité + `rename_reference_tree` + gestion `IntegrityError`), route 409. Package `src`, imports relatifs, `utcnow()`.
- **Frontend** : `CardDetailDialog.jsx` — champ Référence + payload + gestion 409 + refresh. Réutiliser le style des champs existants (dark/épuré).
- **Décision (défaut)** : édition **inline** dans le formulaire métadonnées (pas de dialog séparé). Ajustable si Eric préfère un mode crayon.

## 4. Plan
1. Cartographier `CardUpdate` / `update_card` / `CardDetailDialog` (déjà fait dans ce prompt).
2. Backend : schéma + service (unicité + rename snapshots + IntegrityError) + route 409 + test pytest.
3. Front : champ Référence éditable + payload + 409 + refresh.
4. Tests npm + staging + captures.

## 5. Tests
- `pytest` : renommer une carte vers une référence libre → OK (`reference` mise à jour, `rename_reference_tree` appelé) ; vers une référence **déjà prise** → **409** ; référence vide → 422/refus ; `name`/`part_number` préservés si non fournis ; liens `BoardStock`/commande par id intacts après renommage.
- `npm test` : champ Référence éditable ; `PUT /marketplace/cards/{id}` inclut `reference` ; 409 affiché sans fermer le pop-up.
- **Staging (:8001)** : ouvrir une carte, modifier sa référence → enregistrée et visible partout ; tenter une référence existante → refus expliqué. Captures `docs/prompts/preuves/025/`.

## 6. DoD
Critères §2 · `pytest` + `npm test` verts · migration N/A · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Package `src` · imports relatifs · `utcnow()` · **unicité de la référence (409 si doublon)** · **lecture seule sur `\\rs\Elec\...`** (ne renommer que les snapshots internes) · composant React < 300 lignes (découper) · pas de front sans preuve. Branche courte depuis `dev`, PR vers `dev`, CI verte. Bloquant → `echanges/ouverts/`.

## 8. RÉSULTAT — à remplir par l'orchestrateur
