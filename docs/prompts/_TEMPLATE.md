<!--
  TEMPLATE DE PROMPT — copier ce fichier dans 1-a-faire/ sous le nom NNN-type-slug.md
  Structure inspirée de SPARC : Spécifier → Pseudocode → Architecture → Raffiner → Valider.
  Objectif : un prompt AUTONOME, exécutable sans la conversation de planification.
  Supprimer les commentaires <!-- --> une fois rempli.
-->

# [NNN] type(portée): titre court de la feature

| Champ | Valeur |
|---|---|
| **ID** | NNN |
| **Type** | feat / fix / refactor / test / docs / chore |
| **Branche cible (PR)** | `dev` (branche d'intégration, déployée sur staging :8001) |
| **Branche de travail** | `type/slug` (créée depuis `dev` à jour) |
| **Priorité** | haute / normale / basse |
| **Créé le** | AAAA-MM-JJ |
| **Dépend de** | (autre prompt NNN, ou « aucune ») |
| **Peut tourner en parallèle** | oui / non (non si touche les mêmes fichiers qu'un autre prompt actif) |

---

## 1. Objectif (le POURQUOI)

<!-- 2-4 phrases : le besoin métier, le problème résolu. Pas de solution ici, juste le but. -->

## 2. Spécification (le QUOI)

<!-- Comportement attendu, du point de vue utilisateur. Concret et testable. -->

**Critères d'acceptation :**
- [ ] …
- [ ] …

**Hors périmètre :** <!-- ce qu'on ne fait PAS, pour éviter le scope creep -->

## 3. Architecture & décisions (le COMMENT — haut niveau)

**Fichiers concernés (au mieux de la connaissance actuelle) :**

| Zone | Fichier(s) | Action |
|---|---|---|
| Backend modèle | `serveur/src/models/…` | créer / modifier |
| Backend route | `serveur/src/routes/…` | créer / modifier |
| Backend service | `serveur/src/services/…` | … |
| Migration | `serveur/src/alembic/versions/…` | oui / non |
| Frontend | `client/src/frontend/src/…` | … |

**Décisions actées** (issues de la discussion de planification) :
- …

**ADR liée** : <!-- numéro d'ADR si décision structurante, sinon « aucune » -->

## 4. Plan d'implémentation (pseudocode / étapes ordonnées)

1. …
2. …
3. …

## 5. Tests

**Automatiques (obligatoires avant push) :**
- `pytest serveur/src/tests/ -v`
- `cd client/src/frontend && npm test`
- Tests à ajouter : <!-- nouveaux cas à couvrir -->

**Staging (validation appli qui tourne, :8001) :**
- [ ] … <!-- scénario manuel à vérifier dans l'appli déployée -->

## 6. Définition de « terminé » (Definition of Done)

- [ ] Tous les critères d'acceptation §2 remplis
- [ ] `pytest` + `npm test` verts en local
- [ ] Déployé sur staging, scénarios §5 vérifiés
- [ ] CI GitHub verte sur la branche
- [ ] PR ouverte vers `dev` (CI verte avant merge ; prod = PR `dev → main` ultérieure)
- [ ] `RESULTAT.md` rédigé

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** (jamais `src.backend`) · imports relatifs dans le package.
- Timestamps : `from ..database import utcnow` (pas `datetime.utcnow()`).
- Ne **jamais** commiter de parasites (`*.db`, `*.bak*`, `exports/`, `fix_*.py`…).
- Composant React > 300 lignes → découper.
- Workflow git : branche courte depuis `dev`, commits Conventional Commits, PR vers `dev`, CI verte.
- Navigateur de test : **Google Chrome uniquement**.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- L'exécutant produit un fichier séparé NNN-type-slug.RESULTAT.md.
     Voir la structure imposée dans ORCHESTRATEUR.md §5. -->
