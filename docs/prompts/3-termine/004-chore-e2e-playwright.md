# [004] chore(test): tests E2E Playwright — valider le front sur l'application réelle

| Champ | Valeur |
|---|---|
| **ID** | 004 |
| **Type** | chore / test |
| **Branche cible (PR)** | `dev` |
| **Branche de travail** | `chore/e2e-playwright` (créée depuis `dev` à jour) |
| **Priorité** | normale |
| **Créé le** | 2026-07-21 |
| **Dépend de** | aucune |
| **Peut tourner en parallèle** | oui (dossier `e2e/` dédié) ; attention si un autre prompt modifie la config CI en même temps |

---

## 1. Objectif (le POURQUOI)

Les `npm test` actuels sont des tests **de composants** (Jest + jsdom) : ils ne pilotent **jamais**
l'application réelle. On veut un vrai **filet de sécurité front** : des tests **E2E Playwright** qui
ouvrent l'appli, cliquent, saisissent et vérifient les **parcours critiques** — reproductibles et,
si possible, rejoués en **CI**.

## 2. Spécification (le QUOI)

- Mettre en place **Playwright** (`@playwright/test`) dans un dossier **`e2e/`** dédié.
- `playwright.config` avec **`baseURL` paramétrable** (stack de test locale OU staging :8001).
- Un **script de démarrage d'une stack de test locale** (backend en config test + frontend servi)
  pour que les E2E tournent **sans dépendre du LAN**.
- Écrire les E2E des **parcours critiques initiaux** (commencer par 2-3, extensible) :
  1. **Import BOM** : uploader une BOM → arriver sur la Revue peuplée.
  2. **Cartes** : liste → ouvrir une carte (détail : révisions + catégorie) → éditer une métadonnée → persistance.
  3. **Revue BOM** : renommer une valeur → dialog de portée « tous » → la valeur change sur toutes les lignes.
- **Chromium est déjà présent** (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) — **ne pas** lancer
  `playwright install` / ne pas re-télécharger.

**Critères d'acceptation :**
- [ ] `e2e/` scaffolé + `playwright.config` (+ scripts npm `test:e2e`).
- [ ] Script qui démarre la stack de test locale et lance la suite E2E de bout en bout.
- [ ] Au moins **2 parcours critiques** verts en local.
- [ ] **CI** : si la stack peut démarrer dans le runner GitHub Actions → job E2E ajouté (`.github/workflows/`).
      **Sinon** → documenter la limite + faire lancer la suite E2E par l'orchestrateur dans son pipeline (§5).
- [ ] `pytest` + `npm test` **existants toujours verts** (aucune régression).

**Hors périmètre :** couverture E2E exhaustive (on démarre par les parcours critiques) ; refonte des tests de composants existants.

## 3. Architecture & décisions

**Contrainte clé (à ne pas ignorer) :** GitHub Actions (cloud) **ne peut PAS joindre le staging LAN**
(`:8001` sur LAPTOP-053). Donc l'E2E en CI doit **démarrer la stack DANS le runner** :
- **Backend** en config **test** (le `conftest` pytest utilise déjà **SQLite** — réutiliser cette config
  pour lancer un serveur de test, base éphémère seedée).
- **Frontend** : servir le **build** (ou `react-scripts start`) sur un port local ; `baseURL` = ce port.
- Si démarrer cette stack en CI s'avère trop lourd/instable → **NE PAS deviner** : ouvrir un **échange**
  (`docs/prompts/echanges/`) pour trancher entre (a) E2E en CI avec stack runner, (b) E2E hors-CI lancés
  par l'orchestrateur contre staging. Livrer d'abord l'infra + les tests qui tournent en **local**.

**Décisions :**
- Emplacement : dossier **`e2e/`** à la racine (ou `client/e2e/`), config `playwright.config.js`.
- **Sélecteurs stables** : ajouter des `data-testid` sur les éléments testés (au fil de l'eau) plutôt
  que des sélecteurs fragiles (texte/CSS).
- **Seed** de données : via l'API (avec la clé de test) ou une base SQLite pré-remplie dédiée aux E2E.

## 4. Plan d'implémentation

1. Scaffolder Playwright (`e2e/`, `playwright.config.js`, script npm `test:e2e`) — sans re-télécharger Chromium.
2. Script **stack de test locale** (backend SQLite test + frontend servi), réutilisable local **et** CI.
3. Écrire les 2-3 E2E critiques (§2), ajouter les `data-testid` nécessaires côté front.
4. Tenter le **job CI E2E** (stack dans le runner). Si blocage infra → **échange** (cf §3).
5. Documenter (STRUCTURE.md / README) : comment lancer les E2E en local.

## 5. Tests

- La **suite Playwright** verte en local (parcours critiques).
- `pytest` + `npm test` **inchangés / verts**.
- Staging : la suite E2E (contre la stack de test) passe ; captures/rapport Playwright joints au RESULTAT.

## 6. Définition de « terminé »

- [ ] Critères d'acceptation §2 remplis (E2E en CI en réserve si blocage infra tranché par échange)
- [ ] `pytest` + `npm test` + `test:e2e` verts en local
- [ ] CI verte sur la branche
- [ ] PR ouverte vers `dev`
- [ ] `RESULTAT.md` rédigé (+ rapport/captures Playwright)

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** · `utcnow()`.
- **Ne pas** lancer `playwright install` (Chromium déjà dispo : `PLAYWRIGHT_BROWSERS_PATH`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).
- Ne commiter aucun parasite (traces/vidéos Playwright volumineuses → gitignore ; garder le strict nécessaire).
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte.
- Navigateur : **Chromium/Chrome uniquement**.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 004-chore-e2e-playwright.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
