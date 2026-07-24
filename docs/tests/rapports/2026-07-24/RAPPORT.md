# Rapport — Agent opérateur virtuel (run à froid, sans piège)

| Champ | Valeur |
|---|---|
| **Date du run** | 2026-07-24 |
| **Cible** | Staging `http://localhost:8001` **uniquement** (prod `:8000` jamais ouverte) |
| **Commit testé** | `dev @ 1eff85c` — *docs(tests): catalogue de scenarios…* · build front `main.5cdf5c9b.js` |
| **Périmètre** | Tous les scénarios **NON‑🪤** du catalogue (`docs/tests/CATALOGUE-SCENARIOS.md`) |
| **État du seed piégé** | **Absent** (run à froid) → scénarios 🪤 ignorés, comme demandé |
| **Méthode** | Pilotage navigateur (Google Chrome), capture + lecture DOM + lecture console + contre‑vérification API en lecture (`X-API-Key: pcbflow-staging`) |
| **Données** | Snapshot réel du staging (86 cartes catalogue au départ, 22 cartes en stock, valeur 7008,42 €) |

> ⚠️ **Modifications laissées sur staging** (base isolée et jetable, écritures autorisées) : voir §4. Rien n'a été fait sur la prod ni sur le partage `\\rs\Elec\…` (scans en lecture seule uniquement).

---

## 1. Synthèse

- **57 scénarios non‑🪤 exécutés** : **48 PASS · 2 FAIL · 3 partiels · 3 bloqués/non testables · 1 observation**.
- **4 anomalies** confirmées : **2 majeures**, **2 mineures**. **Aucune bloquante.**
- L'application est **globalement stable et cohérente** : navigation, dashboard, productions, cartes, composants, BOM, stocks, machine PnP, commandes composant/client, costing et paramètres fonctionnent et les données recoupent l'API.

**Verdict : quasi‑prêt pour la prod.** Rien ne bloque un flux critique. Deux points méritent un correctif avant de promouvoir `dev → main` :
1. l'**aperçu (dry‑run) de l'import catalogue** est trompeur (n'annonce jamais ce qui sera importé) ;
2. **impossible de réactiver/désarchiver une production** depuis l'UI (l'archivage est un aller sans retour).

Les deux corrections sont pré‑rédigées : `docs/prompts/1-a-faire/026-…` et `027-…`.

---

## 2. Tableau récapitulatif par scénario

| ID | Domaine | Résultat | Sévérité si FAIL | Note |
|---|---|---|---|---|
| NAV-01 | Navigation/santé | ✅ PASS | | 12 routes, aucune page blanche, 0 erreur JS |
| NAV-02 | Redirections | ✅ PASS | | `/`→dashboard ; `/cartes`,`/fichier-bom`→base‑donnees?tab=cartes ; `/visualisation-bom`→bom |
| NAV-03 | F5 route profonde | ✅ PASS | | Reload `?tab=cartes` OK (HashRouter) |
| NAV-04 | Erreur réseau | ✅ PASS | mineur | Toast lisible, pas de gel — **mais** message « port 8000 » codé en dur (bug #3) |
| DASH-01 | 4 grandes cases | ✅ PASS | | Recoupe `/reports/dashboard-overview` exactement |
| DASH-02 | Mini‑stats | ✅ PASS | | 2 cmd clients / 1 à débugger / 0 machines |
| DASH-03 | Cases cliquables | ✅ PASS | | Toutes naviguent vers le bon écran |
| DASH-05 | Table productions | ✅ PASS | | Recherche + tri colonne + Actualiser (cooldown) |
| DASH-06 | Prod active + qualité | ✅ PASS | | Points à vérifier / Empreintes PnP présents |
| DASH-07 | Suivi / à produire | ✅ PASS | | Panneaux chargés avec données |
| PROD-01 | Créer prod SIMPLE | ✅ PASS | | Devient active (API: id=15 ACTIVE) |
| PROD-02 | Mode assemblage | ✅ PASS | | AssemblyModeDialog → MIXTE (vérifié API) |
| PROD-03 | Ouvrir/renommer | ✅ PASS | mineur | Nom MAJ partout — **sauf** panneau « Productions en cours » (bug #4) |
| PROD-04 | Dupliquer | ✅ PASS | | Copie fidèle, nouvel enregistrement (id=16) |
| PROD-05 | Archiver/réactiver | ❌ **FAIL** | **majeur** | Archive OK ; **réactivation impossible dans l'UI** (bug #2) |
| PROD-06 | Supprimer | ✅ PASS | | Confirmation + suppression sans orphelin (API 404) |
| PROD-07 | Valider ordre fab. | ✅ PASS | | Contrôle « Valider l'ordre » dans config Machine PnP ; prod01 « Ordre validé » |
| CARD-01 | Recherche réf+nom | ✅ PASS | | Insensible à la casse |
| CARD-02 | Fiche carte | ✅ PASS | | Nom, code KELENN, type, catégorie, révisions |
| CARD-03 | Édition | ✅ PASS | | Code KELENN enregistré, reflété table |
| CARD-05 | Multi‑révisions | ✅ PASS | | A→H groupées, TOP/BOT, Ouvrir/Supprimer par face |
| CARD-06 | Supprimer carte | ✅ PASS | | Confirmation + suppression (86→85, API) |
| CARD-08 | Suppression multiple | ✅ PASS | | Rapport « 2 supprimées / 0 ignorées » |
| IMPCAT-01 | Dry‑run scan | ❌ **FAIL** | **majeur** | Rapport ignorés OK & « rien écrit » OK, **mais aperçu n'annonce pas ce qui sera importé** (bug #1) |
| IMPCAT-03 | Import + idempotence | ✅ PASS | | Import réel = 10 rév + 8 comp ; 2ᵉ import = 0 (idempotent) |
| IMPCAT-04 | Dossier non‑carte | ✅ PASS | | Ignoré, raison distincte de « format non reconnu » |
| COMP-01 | CRUD composants | ✅ PASS | | Recherche + édition (toast « mis à jour ») |
| COMP-02 | Empreintes | ✅ PASS | | 75 distinctes / 107 entrées, mapping feeder |
| COMP-03 | Règles de type | ✅ PASS | | Création règle + historique/undo |
| COMP-04 | Enrichissement MPN | ✅ PASS | | Charge cache (25), offres fournisseurs, valider/ignorer |
| BOM-01 | Import BOM | ✅ PASS | | Harmonisation (46 lignes, 32 harmonisées) via BOM stockée — upload fichier brut non exercé* |
| BOM-03 | Revue éditable | ✅ PASS | | Note éditée → persistante après reload |
| BOM-04 | Empreintes/PnP revue | ✅ PASS | | FP PNP + compteurs « 0 à vérifier / 32 harmonisées » cohérents dashboard |
| BOM-05 | Suppr. révision/face | 🟡 partiel | | Contrôle « Supprimer » par face présent, non exécuté |
| BSTK-01 | Vue groupée | ✅ PASS | | Agrégation par carte vérifiée (19 = 7+5+7 ; 2522,44 €) |
| BSTK-02 | Recherche | ✅ PASS | | Réf + nom, regroupement conservé |
| BSTK-03 | Édition testées/… | ✅ PASS | | Barre SUIVI MAJ ; dashboard à débugger 1→3 |
| STK-01 | Liste stock | ✅ PASS | | Recherche, niveaux, statut |
| STK-02 | Mouvement stock | ✅ PASS | | Correction solde 38→40 persistée |
| STK-03 | Seuils | ✅ PASS | | Seuil 100 → statut « Bas » (alerte) |
| PNP-01 | Séquence | ✅ PASS | | Ordre + déplacer (config machine) |
| PNP-02 | Feeders | ✅ PASS | | 104 feeders fixes, calcul auto, association |
| PNP-03 | Chariots | ✅ PASS | | Capacité/slots (10/80, 75/80, 42/80) |
| PNP-04 | Chargement machine | ✅ PASS | | Affecter prod + placements requis (17/80) |
| PNP-05 | Placements manuels | ✅ PASS | | Table INST/slot, Fixe/Mobile/Libre |
| CMD-01 | Créer commande | ✅ PASS | | Lignes générées depuis BOM (besoins par réf) |
| CMD-02 | Offres fournisseurs | ✅ PASS | | Auto (moins cher) + liens Digi‑Key/Mouser/Farnell |
| CMD-03 | Réceptions | ✅ PASS | | Qté reçue → ligne passe au vert (besoin couvert) |
| CMD-04 | Détail de ligne | ✅ PASS | | « Compléter la ligne » (MPN, offre manuelle, qté) |
| CLI-01 | Commande CLIENT | ✅ PASS | | CMD‑0013 créée (cartes) |
| CLI-02 | Commande MACHINE | ⛔ bloqué | | Aucun modèle machine dans le catalogue |
| CLI-03 | Préparer/livrer | ✅ PASS | | Prête → livrée, historique 2→3 |
| CLI-05 | Import commande PDF | 🟡 partiel | | UI présente (glisser‑déposer), non exercée sans fichier* |
| COST-01 | Paramètres coût | ✅ PASS | | Params atelier éditables |
| COST-02 | Costing production | ✅ PASS | | 171 € HT → 205 € TTC ; taux 40→80 recalcule 295/355 |
| COST-03 | Costing référence | ✅ PASS | | Prix/carte propagé au stock (2242,99 € ×2 = 4485,98 €) |
| SET-01 | Paramètres poste | ✅ PASS | | Nom de poste enregistré |
| SET-03 | Feature flags | ⛔ non testable | | Aucun toggle de feature flag exposé dans l'UI (env/build) |
| ERP-01 | Défauts ERP | ✅ PASS | | Délai édité + enregistré (alimente les commandes) |

\* *Les uploads de fichiers bruts (BOM Excel/CSV, PDF commande) n'ont pas pu être exercés : l'agent pilote un navigateur distant et ne pouvait pas fournir de fichier local au champ d'upload. Le reste du flux (aperçu, harmonisation, mapping) a été vérifié via le chargement de BOM déjà enregistrées.*

---

## 3. Bugs (triés par sévérité)

### [majeur] #1 — L'aperçu (dry‑run) de l'import catalogue n'annonce pas ce qui sera importé
- **Écran** : Base de données › Import catalogue · **Persona** : P2 · **Scénario** : IMPCAT-01
- **Repro** :
  1. Sur staging, avoir des cartes du partage absentes de la base (ex. après suppression de quelques cartes, ou base en retard sur le partage).
  2. Cliquer **« Aperçu (dry‑run) »** → l'aperçu affiche `83 cartes scannées`, **`0 révision(s) importée(s)`**, **`0 composant(s) créé(s)`**, `Aperçu (rien écrit)` + la liste des 49 dossiers ignorés.
  3. Cliquer **« Importer »** juste après (aucune autre action entre‑temps) → l'import réel affiche **`10 révision(s) importée(s)`** et **`8 composant(s) créé(s)`** (catalogue 83 → 89 réf, 247 → 257 révisions).
- **Attendu** : le dry‑run présente la **liste « à importer »** (ou au moins un compteur non nul) de ce que l'import va écrire, cohérent avec l'import réel qui suit.
- **Obtenu** : le dry‑run affiche toujours `0 révision / 0 composant` (il réutilise le compteur « importées », nul puisqu'il n'écrit rien) ; il ne montre **que** les dossiers ignorés. Un opérateur qui s'y fie conclut « rien à importer » alors que l'import va bel et bien créer des cartes/composants.
- **Capture** : `preuves/IMPCAT-01-04_dry-run-ignores.jpg` + `preuves/IMPCAT-03_import-reel-10revisions.jpg`
- **Cause probable** : le dry‑run ne calcule/n'expose pas le nombre de révisions « à importer » ; côté UI, les tuiles réutilisent les compteurs de l'import réel (à 0 en mode aperçu). Zone : service d'import catalogue (`serveur/src/services/…` import catalogue) + composant Import catalogue (`client/.../components/import` ou `base-donnees`).

### [majeur] #2 — Impossible de réactiver / désarchiver une production depuis l'UI
- **Écran** : Dashboard › Productions créées (menu ⋮) · **Persona** : P1 · **Scénario** : PROD-05
- **Repro** :
  1. Menu ⋮ d'une production → **« Archiver »** → toast « archivée », la prod disparaît de la liste active. ✅
  2. La retrouver via la **recherche** (elle s'affiche avec le badge « Archivée »).
  3. Ouvrir son menu ⋮ → il ne contient que **Renommer / Mode d'assemblage / Dupliquer / Supprimer** — **aucune action « Désarchiver / Réactiver »**.
  4. Cliquer l'icône « Ouvrir » ou la ligne : aucun effet (statut reste `ARCHIVED`, vérifié API `GET /marketplace/productions/16`).
- **Attendu** : pouvoir réactiver/désarchiver une production archivée (retour en brouillon/active) — « réintégration OK ».
- **Obtenu** : l'archivage est un **aller sans retour** dans l'UI. Contournement : dupliquer l'archivée (mais on perd l'identité/historique).
- **Capture** : `preuves/PROD-03_renommer-ok.jpg` (contexte menu ⋮) — l'état archivé a été vérifié à l'écran et via API.
- **Cause probable** : action « désarchiver » absente du menu contextuel de production (`client/.../MachineProduction*`/dashboard productions) ; endpoint de changement de statut à exposer si manquant.

### [mineur] #3 — Message d'erreur backend codé en dur sur « port 8000 »
- **Écran** : Dashboard (et tout appel API échoué) · **Persona** : P1 · **Scénario** : NAV-04
- **Repro** : couper/faire échouer un appel API (`/reports/dashboard-overview`) → toast **« Backend non disponible — vérifiez que le serveur API est lancé sur le port 8000. »**
- **Attendu** : message générique, ou pointant le bon port. Sur **staging l'API est en `:8001`** (même origine), donc « port 8000 » est **faux et trompeur**.
- **Obtenu** : port `8000` en dur, incorrect en staging.
- **Capture** : `preuves/NAV-04_erreur-backend-toast.jpg`
- **Cause probable** : chaîne littérale « port 8000 » dans le handler d'erreur axios (`client/src/frontend/src/api/client.js` ou intercepteur global).

### [mineur] #4 — Le panneau « Productions en cours » ne se rafraîchit pas après un renommage
- **Écran** : Dashboard, panneau latéral « Productions en cours » · **Persona** : P1 · **Scénario** : PROD-03
- **Repro** :
  1. Renommer la production active (menu ⋮ → Renommer). Le nom est MAJ dans le bandeau, la table et le libellé « Production active ». ✅
  2. Le panneau **« Productions en cours »** (droite) conserve l'**ancien** nom.
  3. Cliquer **« Actualiser »** de ce panneau → le nom se met à jour.
- **Attendu** : « nom mis à jour partout » sans action manuelle.
- **Obtenu** : incohérence temporaire (ancien nom) jusqu'à un rafraîchissement manuel du panneau.
- **Capture** : `preuves/PROD-03_renommer-ok.jpg`
- **Cause probable** : le panneau consomme `/reports/productions-summary` sans invalidation/refetch après l'action renommer.

### Observation (pas un bug) — La suppression d'une carte est « annulée » par le prochain import catalogue
Supprimer une carte du catalogue puis relancer l'import catalogue **recrée** la carte si son dossier existe sur le partage (le partage = source de vérité). Comportement défendable, mais à connaître : une suppression manuelle n'est pas durable tant que le dossier reste sur `\\rs\Elec\…`.

---

## 4. Données de test laissées sur staging (base jetable)

- Production **`ZZTEST-AGENT RENOMME 24-07`** (id 15, mode MIXTE) — créée/renommée/dupliquée pendant PROD‑01→05 (la copie a été supprimée).
- Carte **KT180241** : `Code KELENN = ZZ-KELENN-TEST` (CARD‑03).
- Cartes catalogue supprimées puis **recréées par l'import** : `KT250441A`, `KT240634`, `KT250066` (elles sont réapparues, cf. observation §3). Catalogue final : **89 réf** (import a aussi ajouté ~3 cartes du partage absentes du snapshot).
- Composant **MAX3467CSA** : `Pitch = 4` (COMP‑01).
- Composant **0R009** (`PE2512FKE070R009L`) : `solde = 40`, `seuil = 100` → statut « Bas » (STK‑02/03).
- Carte **AMPLI_GEN6 Rev A** stock : `testées = 3`, `à débugger = 2` (BSTK‑03) → dashboard « à débugger » = 3.
- Commande client **CMD‑0013** (Client Demo, AMPLI_GEN6 REV_A) : créée, préparée, **livrée** (historique Client Demo 2→3).
- Costing **prod03** : `taux horaire = 80 €/h` (COST‑02).
- Défauts ERP : `Délai = STANDARD 5j (test agent)` (ERP‑01).
- Paramètre poste : `poste-agent-test` (SET‑01, mémorisé dans le navigateur).

> Ces écritures sont sans impact prod (base staging isolée). À réinitialiser via une recopie de `ECB_Production_STAGING` si un état propre est souhaité pour le prochain run.

---

## 5. Ce qui est solide vs ce qui reste à faire

**Solide (peut partir en prod tel quel)** : navigation & santé, dashboard (chiffres recoupés à l'API), cycle de vie production (création/renommage/duplication/suppression sans orphelin), cartes (recherche/fiche/édition/révisions/suppressions unitaire & multiple), composants/empreintes/règles/MPN, revue BOM éditable + harmonisation, stock cartes (vue groupée + QA), stock composants (mouvements + seuils), Machine PnP complète (séquence/feeders/chariots/chargement/placements), commande composant (lignes/offres/réceptions/détail), commande client (création/préparation/livraison), costing (recalcul cohérent + propagation), paramètres poste & défauts ERP.

**À corriger avant promo prod** :
- **#1 (majeur)** aperçu import catalogue trompeur → prompt `026`.
- **#2 (majeur)** réactivation de production impossible → prompt `027`.

**Mineurs (peuvent suivre)** : #3 (message « port 8000 »), #4 (refetch panneau après renommage).

**Non couverts ce run (à prévoir)** :
- Uploads de fichiers bruts (BOM Excel/CSV — BOM‑01 ; PDF commande — CLI‑05) : nécessitent un fichier de test accessible au navigateur.
- Commande MACHINE (CLI‑02) : nécessite de créer d'abord un modèle machine (catalogue vide).
- Suppression de révision/face (BOM‑05) : contrôle présent, non exécuté (destructif).
- Feature flags (SET‑03) : aucun toggle UI — clarifier si piloté par `.env`/build.
- Tous les scénarios **🪤** : à rejouer une fois le seed piégé en place.

---

## 6. Prompts de correction pré‑rédigés

- `docs/prompts/1-a-faire/026-fix-import-catalogue-apercu-a-importer.md` — bug #1
- `docs/prompts/1-a-faire/027-feat-reactiver-desarchiver-production.md` — bug #2

(Les mineurs #3 et #4 sont volontairement laissés hors prompt : correctifs triviaux, à regrouper dans un `fix` ultérieur si souhaité.)
