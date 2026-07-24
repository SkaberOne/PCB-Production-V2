# [028] fix(ui): message d'erreur backend générique + rafraîchir « Productions en cours » après renommage

| Champ | Valeur |
|---|---|
| **ID** | 028 · **Type** fix · **Branche cible** `dev` · **Branche** `fix/ui-mineurs-erreur-refresh` |
| **Priorité** | basse · **Dépend de** aucune · **Parallèle** : oui |
| **Source** | Run agent opérateur 2026-07-24 (bugs #3 et #4) · **Créé le** 2026-07-24 |

## 1. Objectif (le POURQUOI)
Deux anomalies **mineures** détectées au run de test d'usage, sans gravité mais visibles :
- **#3** : quand un appel API échoue, le message affiché parle du **« port 8000 »** (codé en dur). En **staging** l'API est sur `:8001` (même origine) → message **faux et trompeur**.
- **#4** : après avoir **renommé** la production active, le panneau latéral **« Productions en cours »** (`ProductionSummaryCards`) garde l'**ancien nom** jusqu'à un clic manuel sur « Actualiser ».

## 2. Spécification (le QUOI)

### A. Message d'erreur backend générique (#3)
- Le handler d'erreur réseau (intercepteur axios / affichage global) ne doit **plus** mentionner « port 8000 » en dur. Deux options acceptables :
  - message **générique** : « Backend non disponible — vérifiez que le serveur API est démarré. » ; **ou**
  - dériver l'info de l'**URL API réellement configurée** (`REACT_APP_API_URL`, défaut `http://localhost:8000/api`) au lieu d'un port littéral.
- Fichiers probables : `client/src/frontend/src/api/client.js` (base URL + intercepteur d'erreur) et/ou le composant qui affiche le toast/bandeau « Backend non disponible ».

### B. Rafraîchir « Productions en cours » après mutation (#4)
- Après un **renommage** de production (et idéalement aussi archiver/désarchiver/dupliquer/supprimer), le panneau `ProductionSummaryCards` doit se **re-fetch** automatiquement (données `/reports/productions-summary` ou équivalent), sans action manuelle.
- Approche : passer au composant un **signal de rafraîchissement** (ex. une clé/version incrémentée à chaque mutation de production dans `DashboardPage`, ou un `refreshToken` dans les props) déclenchant le refetch ; ou remonter le `onSaved`/`onRenamed` pour invalider la source du panneau.
- Fichiers probables : `client/src/frontend/src/pages/DashboardPage.jsx` (orchestration des actions production) + `components/dashboard/ProductionSummaryCards.jsx`.

**Critères d'acceptation :**
- [ ] Aucun message d'erreur ne mentionne « port 8000 » en dur ; en staging (:8001) le message est correct/générique.
- [ ] Après renommage d'une production, le panneau « Productions en cours » affiche le **nouveau nom** sans action manuelle.
- [ ] Aucune régression sur le bouton « Actualiser » existant du panneau ni sur les autres actions production.

**Hors périmètre :** refonte du panneau ; gestion offline avancée.

## 3. Architecture & décisions
- **#3** : centraliser le message dans le handler axios ; ne pas coder de port en dur. Réutiliser la base URL configurée si on veut être précis.
- **#4** : privilégier un `refreshKey` (state dans `DashboardPage`, incrémenté après chaque action production réussie) passé à `ProductionSummaryCards` qui refetch sur changement de la clé — simple et robuste. Pas de sur-ingénierie (pas besoin d'un state manager global).

## 4. Tests
- `npm test` : (#4) après un renommage simulé, le panneau refetch (mock d'appel appelé une 2ᵉ fois / nouveau nom affiché) ; (#3) le message d'erreur ne contient pas « 8000 ».
- Vérif manuelle **staging (:8001)** : couper l'API → message correct ; renommer la prod active → panneau à jour. Captures `docs/prompts/preuves/028/`.

## 5. DoD
Critères §2 · `npm test` (+`pytest` si back touché — a priori non) verts · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 6. Contraintes
Composant React < 300 lignes · pas de front sans preuve · ne pas coder de port/URL en dur (utiliser la conf). Branche courte depuis `dev`, PR vers `dev`, CI verte.

## 7. RÉSULTAT — à remplir par l'orchestrateur
