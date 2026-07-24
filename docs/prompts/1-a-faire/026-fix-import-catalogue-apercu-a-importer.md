# [026] fix(import-catalogue): l'aperçu (dry-run) doit annoncer ce qui sera importé

| Champ | Valeur |
|---|---|
| **ID** | 026 |
| **Type** | fix |
| **Branche cible (PR)** | `dev` |
| **Branche de travail** | `fix/import-catalogue-apercu-a-importer` |
| **Priorité** | haute |
| **Créé le** | 2026-07-24 |
| **Dépend de** | aucune |
| **Peut tourner en parallèle** | oui |

---

## 1. Objectif (le POURQUOI)

L'aperçu (dry-run) de l'import catalogue est censé permettre à l'opérateur de **prévisualiser ce qui sera écrit** avant de lancer l'import. Aujourd'hui il affiche toujours `0 révision(s) importée(s)` / `0 composant(s) créé(s)` (compteurs d'écriture, nuls en mode aperçu) et n'affiche **que** la liste des dossiers ignorés. Résultat : un opérateur conclut « rien à importer » alors que l'import réel juste après crée des révisions et des composants. Détecté au run agent opérateur du 2026-07-24.

## 2. Spécification (le QUOI)

En mode **Aperçu (dry-run)**, l'écran doit présenter, en plus du rapport des dossiers ignorés, **ce qui serait importé** : nombre de cartes/révisions à créer, nombre de composants à créer, idéalement la liste (réf + révision) des révisions « à importer ». Ces chiffres doivent **coïncider** avec ceux de l'import réel lancé immédiatement après (même état de base et de partage).

**Critères d'acceptation :**
- [ ] Reproduire l'écart : supprimer 2-3 cartes présentes sur le partage, lancer l'aperçu → il doit annoncer un nombre **non nul** de révisions « à importer », égal à ce que fera l'import réel.
- [ ] L'aperçu conserve « rien écrit » (aucune écriture DB, aucune écriture sur le partage — lecture seule).
- [ ] Le rapport des dossiers ignorés (avec raisons distinctes) reste inchangé.
- [ ] Après un import réel, un nouvel aperçu annonce `0 à importer` (idempotence), et un second import réel reste à 0.

**Hors périmètre :** refonte du parseur d'import ; gestion des cartes KiCad (déjà « à venir »).

## 3. Architecture & décisions (le COMMENT — haut niveau)

**Fichiers concernés (au mieux) :**
- Service d'import catalogue côté serveur (`serveur/src/services/…` — la fonction de scan/import qui produit le rapport). Le mode dry-run doit renvoyer un champ dédié `a_importer` (compte + éventuellement détail), distinct des compteurs `importees`/`crees`.
- Route associée (`serveur/src/routes/…` import catalogue), pour véhiculer le nouveau champ dans la réponse dry-run.
- Composant UI Import catalogue (`client/src/frontend/src/components/…` onglet « Import catalogue » de Base de données) : afficher une tuile/section « à importer » alimentée par ce champ en mode aperçu.

Décision : ne pas réutiliser les tuiles « importées/créés » pour l'aperçu ; ajouter une tuile explicite « à importer » (révisions + composants) visible seulement en dry-run.

## 4. Tests

- Backend : test unitaire du service d'import en mode dry-run vérifiant que `a_importer` = nombre réel de révisions manquantes (cas : base amputée de N révisions présentes sur un partage fixture).
- Frontend : la tuile « à importer » s'affiche avec la bonne valeur en aperçu et `0` après import.

## 5. DoD

- [ ] `pytest serveur/src/tests/` verts + `npm test` (frontend) verts.
- [ ] Aperçu et import réel cohérents (vérif manuelle sur staging :8001).
- [ ] Pas d'écriture en mode aperçu (DB + partage).
- [ ] CI verte, PR vers `dev`.

## 6. Contraintes

- Partage `\\rs\Elec\…` en **lecture seule**. Aucune écriture en mode aperçu.
- Respecter l'idempotence existante (seules les révisions absentes sont importées).
