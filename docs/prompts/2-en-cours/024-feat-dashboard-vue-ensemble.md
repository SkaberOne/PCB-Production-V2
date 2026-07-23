# [024] feat(dashboard): remplacer les « gros cases » par une vue d'ensemble globale (4 cases + bandeau)

| Champ | Valeur |
|---|---|
| **ID** | 024 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/dashboard-vue-ensemble` |
| **Priorité** | normale · **Dépend de** aucune · **Parallèle** : non avec un prompt touchant `DashboardPage`/`StatCard` |
| **Source** | Retour Eric (maquette validée) · **Créé le** 2026-07-23 |

## 1. Objectif (le POURQUOI)
Les 4 « gros cases » actuelles du dashboard sont toutes liées à la **production chargée en session** (`Production chargée`, `Productions créées`, `Points à vérifier`, `Empreintes PnP`) — 2 sur 4 affichent `--` tant qu'aucune production n'est chargée. Maintenant qu'on a le catalogue cartes, le stock (qté/valeur/qualité), les commandes internes **et** clients et les machines, Eric veut une **vraie vue d'ensemble opérationnelle globale** (indépendante de la session), **épurée**, chaque case cliquable vers son écran. Design **validé sur maquette** (dark, thème emerald existant).

## 2. Spécification (le QUOI)
Écran : **`client/src/frontend/src/pages/DashboardPage.jsx`** + composants `components/dashboard/DashboardStatCards.jsx` / `StatCard.jsx`. Réutiliser `StatCard` (même anatomie : icône teintée, label, grande valeur, hint, `Voir →`, hover bordure accent). Thème inchangé (`theme.js` dark, `colors`).

### A. Rangée 1 — 4 grosses cases (global, cliquable)
1. **Cartes au catalogue** — valeur = nb `BomReference` ; hint = « N révisions ». Couleur `green`. Clic → Base de données / Cartes.
2. **Cartes en stock** — valeur = somme `qty_in_stock` (« cartes ») ; hint = « N références · valeur X € » (si aucun prix : « valeur — € (prix à renseigner) »). Couleur `blue`. Clic → Stock cartes.
3. **Alertes stock bas** — valeur = nb de lignes stock avec `min_stock > 0 AND qty_in_stock < min_stock`. Couleur **`green` si 0** (état OK), **`red` (ou `amber`) si > 0**. Hint = « aucune sous le minimum » / « N à réapprovisionner ». Clic → Stock cartes (idéalement filtré « sous le minimum »).
4. **Productions en cours** — valeur = nb de productions **non terminées** (statut ≠ `COMPLETED`) ; hint = « X active(s) · Y brouillon(s) ». Couleur `green`. Clic → tableau Productions (déjà en dessous ; scroll/ancre acceptable).

### B. Bandeau fin — 3 mini-stats (2e niveau, épuré)
Sous la rangée 1, un **bandeau de 3 petites cartes** (plus compact que les grosses — icône + valeur + label sur une ligne), pour rester épuré :
5. **Commandes clients à préparer** — nb `ClientOrder` non livrées (statut ≠ `DELIVERED`, ex. `OPEN`/`READY`). Couleur `amber`. Clic → Commandes.
6. **Cartes à débugger** — somme `cards_to_debug` du stock. Couleur `red`. Clic → Stock cartes.
7. **Modèles machines** — nb `MachineModel`. Couleur neutre (`textSecondary`). Clic → Machines.

*(Créer un petit composant `DashboardMiniStat` si besoin ; garder `StatCard` pour la rangée 1.)*

### C. Déplacer les 2 cases session
`Points à vérifier` et `Empreintes PnP` (utiles seulement quand une production est chargée, alimentées par `/reports/bom-stats?production_id=`) ne sont **plus** en tête : les afficher **près de la production active** (panneau `ProductionSummaryCards` à droite, ou juste au-dessus quand `activeProduction` est présent). Ne pas perdre l'info ni le clic existant.

**Critères d'acceptation :**
- [ ] Rangée 1 = 4 grosses cases **globales** (catalogue, stock, alertes stock bas, productions en cours), valeurs réelles, cliquables vers le bon écran.
- [ ] Case « Alertes stock bas » **verte si 0**, **rouge/amber si > 0**.
- [ ] Bandeau fin = 3 mini-stats (commandes clients à préparer, à débugger, machines).
- [ ] `Points à vérifier` / `Empreintes PnP` déplacées près de la production active (plus en tête), sans perte de fonction.
- [ ] Dark/épuré conservé (thème existant, `StatCard` réutilisé) ; responsive (4→2→1 colonnes).
- [ ] Captures `docs/prompts/preuves/024/` (dashboard complet + état 0 alerte et, si possible, état > 0).

**Hors périmètre :** graphiques/temporel ; refonte de la table Productions ; calcul de valeur stock si aucun prix (afficher « — € »).

## 3. Architecture & décisions
- **Backend — nouvel endpoint léger** `GET /reports/dashboard-overview` (auth `X-API-Key`, package `src`, imports relatifs) renvoyant un agrégat **en une réponse**, requêtes `COUNT`/`SUM` (pas de N+1) :
  ```json
  {
    "catalogue": { "references": 86, "revisions": 251 },
    "stock": { "cartes_en_stock": 22, "references_distinctes": 3, "valeur": 0.0, "a_prix": false },
    "stock_bas": 0,
    "productions_en_cours": { "total": 3, "active": 1, "draft": 2 },
    "commandes_clients_a_preparer": { "total": 2, "open": 1, "ready": 1 },
    "cartes_a_debugger": 1,
    "machines": 0
  }
  ```
  Champs indicatifs — adapter aux modèles réels (`BomReference`, `BomRevision`, `BoardStock.{qty_in_stock,min_stock,unit_price_override,cards_to_debug}`, `Production.status`, `ClientOrder.status`, `MachineModel`). Valeur stock = `SUM(qty_in_stock * unit_price_override)` sur les lignes où le prix existe ; `a_prix=false` si aucun prix (front affiche « — € »).
- **Front** : `DashboardPage.jsx` charge l'agrégat (`apiClient.get('/reports/dashboard-overview')`) au montage + au refresh ; construit `statCards` (rangée 1) + `miniStats` (bandeau). Découper si > 300 lignes (`DashboardMiniStat`). Naviguer via `useNavigate` vers les routes existantes (vérifier les chemins réels : Base de données/Cartes, Stock cartes, Commandes, Machines).
- **Schéma** : ajouter le schéma de réponse dans `serveur/src/schemas/…` (léger, lecture seule). Aucune migration.

## 4. Plan
1. Cartographier les modèles/champs + routes front (chemins des écrans cibles).
2. Endpoint `dashboard-overview` (agrégats COUNT/SUM) + schéma + test pytest.
3. Front : charger l'agrégat, rangée 1 (StatCard) + bandeau (mini-stats), couleur conditionnelle alerte, navigation.
4. Déplacer `Points à vérifier`/`Empreintes PnP` près de la prod active.
5. Tests npm + staging + captures.

## 5. Tests
- `pytest` : `dashboard-overview` renvoie les bons agrégats (jeu de données : refs/revs, stock avec/ sans prix, une ligne sous min → `stock_bas`=1, productions mixtes → total non-COMPLETED, commandes non livrées, `cards_to_debug`) ; réponse stable si tables vides (zéros, pas d'erreur).
- `npm test` : rangée 1 rend 4 cases avec les valeurs de l'agrégat ; « Alertes stock bas » verte à 0 / rouge à >0 ; bandeau 3 mini-stats ; clic navigue vers le bon chemin ; `Points à vérifier`/`Empreintes PnP` rendus près de la prod active.
- **Staging (:8001)** : dashboard affiche 86 / 22 / 0 / 3 + bandeau 2 · 1 · 0 (données actuelles). Captures `docs/prompts/preuves/024/`.

## 6. DoD
Critères §2 · `pytest` + `npm test` verts · migration N/A · staging + captures · CI verte (dont E2E) · PR vers `dev` · RESULTAT.md.

## 7. Contraintes
Package `src` · imports relatifs · `utcnow()` · endpoint **lecture seule** (agrégats) · composant React **< 300 lignes** (découper `DashboardMiniStat`) · réutiliser `StatCard` + thème existant (dark/épuré) · pas de front sans preuve · lecture seule sur `\\rs\Elec\...`. Branche courte depuis `dev`, PR vers `dev`, CI verte. Bloquant → `echanges/ouverts/`.

## 8. RÉSULTAT — à remplir par l'orchestrateur
