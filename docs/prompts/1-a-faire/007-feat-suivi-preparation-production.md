# [007] feat(production): conditionnement affiché + suivi « préparé / installé » par composant

| Champ | Valeur |
|---|---|
| **ID** | 007 |
| **Type** | feat |
| **Branche cible (PR)** | `dev` |
| **Branche de travail** | `feat/suivi-preparation-prod` (créée depuis `dev` à jour) |
| **Priorité** | normale |
| **Créé le** | 2026-07-21 |
| **Dépend de** | aucune |
| **Peut tourner en parallèle** | non avec un prompt touchant `CommandPage` / Machine PnP / modèles stock |

---

## 1. Objectif (le POURQUOI)

Faciliter la **préparation physique** d'une production et sa **reprise** (par soi-même ou un collègue) :
1. Savoir **où piocher** un composant (bobine / sachet / tube) directement dans « Commande et stock » **et** au moment d'affecter la production sur la machine PnP.
2. **Cocher « préparé »** un composant quand il a été physiquement mis dans la boîte de préparation.
3. **Cocher « installé »** un composant quand il a été posé sur la PnP — pour reprendre le travail sans tout re-vérifier et voir où on en est.

## 2. Spécification (le QUOI)

**A. Conditionnement (affichage).** Dans « Commande et stock » et dans l'affectation/pop-up **Machine PnP**, afficher, par composant, la **répartition par forme** : `reel` (bobine), `bag` (sachet), `tube` — n'afficher que les formes ayant du stock (ex. « 🎞️ 2500 · sachet 300 »). **La donnée existe déjà** (`ComponentStock.qty_reel/qty_bag/qty_tube`).

**B. « Préparé » (Commande et stock).** Une **case à cocher** par composant, par production : marque que le composant a été **mis dans la boîte de préparation**. Persistée, avec **qui + quand**.

**C. « Installé » (pop-up Machine PnP).** Une **case à cocher** par composant à installer, par production : marque qu'il est **posé sur la PnP**. Persistée, avec **qui + quand**. Permet la reprise / le passage de relais.

**Critères d'acceptation :**
- [ ] « Commande et stock » : chaque composant montre sa **répartition par conditionnement** + une case **« Préparé »** cochable, persistante après reload.
- [ ] Pop-up **Machine PnP** : chaque composant à installer montre son **conditionnement** + une case **« Installé »** cochable, persistante après reload.
- [ ] Les états **« préparé » / « installé »** sont **par (production, composant)** et affichent **qui + quand** (tooltip ou colonne).
- [ ] Un collègue qui rouvre la production **voit l'état d'avancement** (ce qui est préparé / installé) sans re-vérifier.
- [ ] **Captures front** dans `docs/prompts/preuves/007/`.

**Hors périmètre :** décrément automatique de stock au « préparé » (c'est une annotation d'avancement, PAS un mouvement de stock — comme `ComponentMachineLoad`) ; suivi par machine (ce prompt = global production ; par-machine = évolution ultérieure si besoin).

## 3. Architecture & décisions

**Ce qui existe déjà (à réutiliser, pas réécrire) :**
- `serveur/src/models/stock.py` : `StockConditionnement` (`reel`/`bag`/`tube`), `ComponentStock.qty_reel/qty_bag/qty_tube`. → pour la partie A, il faut surtout **exposer** ces champs dans les réponses API des vues concernées et les **afficher**.
- Pattern « annotation d'état sans impact stock » : cf `ComponentMachineLoad` (set-to upsert) et `board_stock.quantity_prepared` (cartes).
- Identité de poste (`created_by` via header `X-Workstation`, ADR 0015) pour le « qui ».

**Nouveau (parties B & C) :**

| Zone | Élément | Action |
|---|---|---|
| Modèle | `serveur/src/models/production.py` (ou stock) : **`ProductionComponentProgress`** | **nouveau** : `production_id` (FK), `component_id` (FK), `is_prepared` (bool), `prepared_by`, `prepared_at`, `is_installed` (bool), `installed_by`, `installed_at`. UniqueConstraint `(production_id, component_id)`. |
| Migration | `serveur/src/alembic/versions/…` | table `PRODUCTION_COMPONENT_PROGRESS` (checkfirst ; **pas d'`index=True`** sur les colonnes ajoutées — casse le roundtrip alembic SQLite). |
| Service/Routes | production/marketplace | endpoints **toggle** : `PUT …/productions/{id}/component-progress/{component_id}` `{ prepared?: bool, installed?: bool }` (set-to, renseigne by/at via `X-Workstation`) + lecture de l'état dans les réponses des vues. |
| Frontend — Commande et stock | `client/src/frontend/src/pages/CommandPage.jsx` + `components/command/ProcurementTable.jsx` | colonne **conditionnement** + case **« Préparé »**. |
| Frontend — Machine PnP | `components/machine/MachinePnpWorkspace.jsx` / `MachinePnpTables.jsx` (le pop-up composants à installer) | colonne **conditionnement** + case **« Installé »**. |

**Décisions actées (défauts, Eric peut ajuster) :**
- Conditionnement = **détail par forme** (formes non nulles seulement).
- « préparé » / « installé » = **par (production, composant)**, global production, booléens (cases à cocher), avec qui + quand.
- **Aucun impact sur le solde de stock** (annotation d'avancement uniquement).

## 4. Plan d'implémentation

1. Modèle `ProductionComponentProgress` + migration (conventions alembic du projet).
2. Endpoints toggle prepared/installed (set-to, by/at via `X-Workstation`) + inclusion de l'état + du conditionnement (`qty_reel/bag/tube`) dans les réponses des vues Commande et Machine PnP.
3. Frontend Commande et stock : colonne conditionnement + case « Préparé » (optimiste + persistance).
4. Frontend Machine PnP (pop-up) : colonne conditionnement + case « Installé ».
5. Affichage qui + quand (tooltip) ; état visible à la réouverture.
6. Tests + staging + **captures**.

## 5. Tests

- `pytest` : modèle + endpoints toggle (set prepared/installed, by/at renseignés, idempotence, unicité (production, composant)) ; exposition du conditionnement.
- `npm test` : cases à cocher + colonnes conditionnement (Command + PnP).
- **Staging (:8001)** : cocher « préparé » sur un composant → persiste après reload ; cocher « installé » dans le pop-up PnP → persiste ; conditionnement affiché. **Captures** dans `docs/prompts/preuves/007/`.

## 6. Définition de « terminé »

- [ ] Critères §2 remplis
- [ ] `pytest` + `npm test` verts · migration testée (roundtrip)
- [ ] Déployé staging, scénarios vérifiés **+ captures** `docs/prompts/preuves/007/`
- [ ] CI GitHub verte · PR ouverte vers `dev`
- [ ] `RESULTAT.md` rédigé

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** · `utcnow()` · imports relatifs.
- Migration : **checkfirst**, **pas d'`index=True`** sur colonnes ajoutées (roundtrip SQLite), mot de passe/DB non concernés ici.
- Composant React > 300 lignes → découper.
- Pas de front livré sans **preuve visuelle** (captures staging).
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte, Chrome uniquement.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 007-feat-suivi-preparation-production.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
