# [027] feat(production): réactiver / désarchiver une production depuis l'UI

| Champ | Valeur |
|---|---|
| **ID** | 027 |
| **Type** | feat |
| **Branche cible (PR)** | `dev` |
| **Branche de travail** | `feat/reactiver-desarchiver-production` |
| **Priorité** | haute |
| **Créé le** | 2026-07-24 |
| **Dépend de** | aucune |
| **Peut tourner en parallèle** | oui |

---

## 1. Objectif (le POURQUOI)

L'archivage d'une production est aujourd'hui un **aller sans retour** dans l'UI : le menu ⋮ d'une production archivée n'offre que Renommer / Mode d'assemblage / Dupliquer / Supprimer, et ni « Ouvrir » ni un clic sur la ligne ne la réactivent (statut reste `ARCHIVED`). L'opérateur ne peut pas récupérer une production archivée par erreur. Détecté au run agent opérateur du 2026-07-24 (scénario PROD-05).

## 2. Spécification (le QUOI)

Une production **archivée** doit pouvoir être **désarchivée / réactivée** depuis l'UI, revenant à l'état `DRAFT` (brouillon) et réapparaissant dans la liste des productions actives.

**Critères d'acceptation :**
- [ ] Le menu ⋮ d'une production **archivée** propose une action **« Désarchiver »** (ou « Réactiver »).
- [ ] Cliquer dessus repasse la production en `DRAFT`, toast de confirmation, réintégration immédiate dans « Productions créées ».
- [ ] L'action n'apparaît **que** pour les productions archivées (pas pour draft/active/completed).
- [ ] Vérif API : `GET /marketplace/productions/{id}` renvoie `status = DRAFT` après désarchivage.
- [ ] Aucune perte de données (BOM/liens conservés).

**Hors périmètre :** corbeille/suppression douce ; historique d'archivage.

## 3. Architecture & décisions (le COMMENT — haut niveau)

**Fichiers concernés (au mieux) :**
- Backend : endpoint de changement de statut des productions (`serveur/src/routes/…` marketplace productions). Si un PATCH statut existe déjà (utilisé par archiver), autoriser la transition `ARCHIVED → DRAFT`. Sinon, ajouter l'action de désarchivage.
- Frontend : menu contextuel de production (composant dashboard « Productions créées » / MachineProduction) — ajouter l'entrée « Désarchiver » conditionnée à `status === 'ARCHIVED'`, appeler l'endpoint puis rafraîchir la liste.

Décision : réutiliser le même mécanisme que « Archiver » (transition de statut) plutôt qu'un flux séparé.

## 4. Tests

- Backend : test de la transition `ARCHIVED → DRAFT` (autorisée) ; vérifier qu'on ne casse pas l'invariant « une seule ACTIVE ».
- Frontend : l'entrée « Désarchiver » n'apparaît que sur une prod archivée ; après clic, la prod réapparaît en brouillon.

## 5. DoD

- [ ] `pytest serveur/src/tests/` + `npm test` verts.
- [ ] Aller-retour archiver → désarchiver vérifié sur staging :8001 (UI + API).
- [ ] CI verte, PR vers `dev`.

## 6. Contraintes

- Ne pas réactiver directement en `ACTIVE` (passer par `DRAFT`) pour ne pas court-circuiter l'invariant d'unicité de la production active.
