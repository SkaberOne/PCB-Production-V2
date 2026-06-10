# Audit complet — ECB / PCB Flow Production Manager
**Date : 2026-06-04** · Type : audit pré-déploiement (live + code) · Auditeur : Claude (Cowork)
Branche de travail courante du design : `refonte-design-2026-06` (palette émeraude/zinc)

---

## 1. Résumé exécutif

L'application est **globalement stable et utilisable**. Le workflow métier en 5 étapes (Production → Import BOM → Revue BOM → Commande → Machine PnP) est cohérent, le design émeraude/zinc est propre et lisible, les données réelles (10 BOM, 380 composants, 18 révisions, 2 machines, offres fournisseurs Mouser/DigiKey) circulent correctement, et aucune erreur JavaScript bloquante n'apparaît en console.

Mais **trois familles de problèmes** doivent être traitées avant un déploiement au travail :

1. **Performance — un gel du thread principal sur les pages « lourdes » (BOM).** En live, la page **Revue BOM s'est figée durablement (>100 s, rendu bloqué)** ; Import BOM a gelé ~20 s au premier chargement puis s'est rétablie ; Machine PnP a mis ~5 s. C'est le constat le plus impactant pour un usage réel. Cause probable : rendu synchrone massif du workspace (4 BOM / ~2 649 lignes) sans virtualisation, aggravé par des objets `bomWorkspace` recréés à chaque render (dépendances `useMemo`/`useEffect` instables).

2. **Déploiement non prêt.** L'exécutable Electron **ne lance pas le backend Python** (il charge seulement le build React), il **n'existe aucun système de mise à jour** (pas d'`electron-updater`), et la « prod » retombe en SQLite avec l'**authentification API désactivée**. C'est exactement le périmètre que vous voulez préparer (exe simple + bouton « Mise à jour »).

3. **Dette technique et incohérences de finition.** ~1 500 lignes de **code mort** sur la fonctionnalité Machine PnP (deux implémentations parallèles, une seule branchée), plusieurs fichiers > 1 000 lignes, un **design system non centralisé** (la palette est respectée *en valeur* mais réécrite en dur dans presque tous les fichiers au lieu des tokens `colors`), des **accents/anglais résiduels** dans l'UI, et quelques bugs UX concrets (double confirmation de suppression, sous-titre invisible, « tout sélectionner » qui ignore le filtre…).

**Verdict :** bonne base, proche de « stable », mais pas encore « déployable ». Le chemin critique avant prod : (a) corriger le gel BOM, (b) câbler backend + auto-update dans Electron, (c) activer l'auth et trancher la base de données, (d) nettoyer le code mort Machine PnP avant d'y développer les fonctionnalités restantes.

---

## 2. Méthodologie

- **Audit live** dans Google Chrome (app réellement lancée sur `localhost:3000`, production active `prod01 DATE:06/2026` chargée) : navigation page par page, clics sur les boutons et onglets, lecture de la console et du réseau, captures d'écran.
- **Audit code** en parallèle via 5 analyses ciblées du code source React / FastAPI / Electron (Dashboard+layout, Import+Revue BOM, Commande+Bibliothèque, Machine PnP, Backend+sécurité+déploiement).
- **Croisement** systématique : chaque constat live est rapproché de sa cause dans le code.

Pages parcourues en live : Dashboard (Productions), Import BOM, Revue BOM, Commande, Machine PnP (onglets Séquence/Feeders/Chariots), BOM enregistrées, Base de données (4 onglets), Paramètres.

Échelle de sévérité : **CRITIQUE** (bloque ou corrompt / bloquant prod) · **MAJEUR** (dégrade fortement l'usage) · **MINEUR** (finition, confort, dette).

---

## 3. Performance — le point n°1 (section dédiée)

### 3.1 Ce qui a été observé en live

| Page | Comportement au montage (production active chargée) |
|---|---|
| Dashboard | Instantané, fluide |
| Import BOM | **Gel ~20 s au 1er accès** (screenshots impossibles, rendu bloqué), puis OK au 2e accès |
| **Revue BOM** | **Gel persistant > 100 s** — thread principal bloqué, aucun rendu ; récupération seulement en quittant la page |
| Commande | OK (chargée après les autres, probablement servie par le cache de session) |
| Machine PnP | ~5 s avant premier rendu |
| BOM enregistrées / Base de données / Paramètres | Instantané |

La console ne montre **aucune** erreur « Maximum update depth exceeded » : ce n'est donc pas une boucle `setState` React classique, mais un **rendu synchrone très coûteux** qui monopolise le thread principal (le navigateur lui-même reste vivant — il récupère dès qu'on change de page).

### 3.2 Causes probables (corroborées par le code)

- `CommandPage.jsx:137` — `useMemo(buildPlanningLines, [bomWorkspace])` dépend de **l'objet `bomWorkspace` entier** ; s'il est recréé à chaque render du contexte, toute la chaîne de memos en aval se recalcule. Idem `selectedEntries` (array recréé) en dépendance d'effets.
- `BomViewerPage.jsx:144-173` — prefetch parallèle des révisions au montage ; rendu de la table de revue sans virtualisation.
- `BomReviewTab.jsx` (699 lignes) — rend potentiellement les ~2 649 items d'un coup (pas de pagination/fenêtrage DOM).
- `BomSessionContext.jsx` (951 lignes) — `quantitiesByReference` et sous-objets recréés ; un `flush` au boot réécrit tout.

### 3.3 Correctifs recommandés (ordre d'effet)

1. **Stabiliser `bomWorkspace`** : exposer des sélecteurs/sous-champs mémoïsés depuis le contexte (ne pas dépendre de l'objet entier). Mémoïser `quantitiesByReference` avec `useMemo`.
2. **Virtualiser les grandes tables** (Revue BOM, Commande) avec `@tanstack/react-virtual` ou `react-window` — ne rendre que les lignes visibles.
3. **Mémoïser les lignes** (`React.memo` sur les rows, `useCallback` sur les handlers passés en props).
4. **Découper le travail** : `useDeferredValue`/`startTransition` pour la recherche/filtre ; calcul des lignes de planification hors render si possible.
5. Mesurer avant/après avec le React Profiler sur la production `prod01` (4 BOM) comme cas de référence.

> C'est le chantier à mener **en premier** : il conditionne la perception de stabilité par les utilisateurs en production.

---

## 4. Constats par page (live + code)

### 4.1 Dashboard / Productions
**État live :** fonctionnel. KPI corrects (Production chargée `prod01`, 1 production, 24 points à vérifier, 235 empreintes PnP), cartes « Voir → » cliquables, dialogue « Nouvelle production » avec nom auto-suggéré (`prod02 DATE:06/2026`), tableau des productions avec actions. `StatCard` est le **meilleur composant du projet** côté a11y (focus visible, rôle, clavier Enter/Espace, état vide géré) — à prendre comme référence.

| Sév. | Constat | Réf. |
|---|---|---|
| CRITIQUE | `fetch` bom-stats sans `AbortController` → race condition, une réponse lente écrase l'état après changement de production | `DashboardPage.jsx:464` |
| CRITIQUE | `navigate()`/`setState` après `await` sans garde de montage (warnings « state update on unmounted ») | `DashboardPage.jsx:595,628` |
| MAJEUR | Handlers create/rename/delete recréés à chaque render (pas de `useCallback`) + soumission possible par Enter pendant un chargement (double-submit) | `DashboardPage.jsx:575,666,724` |
| MAJEUR | Session activée **avant** rechargement ; pas de rollback si le GET suivant échoue (état partiel) | `DashboardPage.jsx:588` |
| MAJEUR | `setTimeout` du cooldown « Actualiser » non nettoyé au démontage | `DashboardPage.jsx:479` |
| MINEUR | Alert de feedback non « dismissible », pas d'auto-dismiss pour les succès | `DashboardPage.jsx:751` |
| MINEUR | Comparaison `status === 'ACTIVE'` sans normalisation alors que le reste fait `toUpperCase()` | `DashboardPage.jsx:286` |

### 4.2 Import BOM
**État live :** fonctionnel (sélecteur production active, arbre « BOM enregistrées » par référence, recherche). **Gel ~20 s observé au premier accès** (cf. §3).

| Sév. | Constat | Réf. |
|---|---|---|
| CRITIQUE | Import de lot (pool de concurrence 3) **sans `AbortController`** → `setState` après démontage, état perdu si on quitte pendant l'import | `BomImport.jsx:572` |
| CRITIQUE | Double-clic suppression : pas de garde sur la clé courante → deux suppressions concurrentes se débloquent mutuellement | `BomImport.jsx:679` |
| MAJEUR | `<input type="file">` non réinitialisé → **recharger le même fichier ne déclenche pas `onChange`** (bug classique) | `BomImportWorkspaceCard.jsx:219` |
| MAJEUR | Switch de production sans avertir si un import non sauvegardé est en cours (`hasImportedBom` calculé mais jamais utilisé) | `ImportBomPage.jsx:296` |
| MAJEUR | Validation upload laxiste : pas de contrôle de taille ni de fichier vide (un `.txt` de 0 octet passe) | `BomImport.jsx:187` |
| MINEUR | `BomImport.jsx` traîne à la racine de `components/` (devrait être dans `components/import/`) ; fichier de **1 369 lignes** | `ImportBomPage.jsx:40` |
| MINEUR | Accents manquants dans la prévisualisation : « Portee », « Prets », « Conserves », « Trouve », « affiche(s) » | `BomImportPreviewCard.jsx` |

### 4.3 Revue BOM
**État live : GEL PERSISTANT (cf. §3) — constat critique.** Page non auditable visuellement en l'état.

| Sév. | Constat | Réf. |
|---|---|---|
| CRITIQUE | Performance : rendu synchrone bloquant (voir §3) | `BomViewerPage.jsx`, `BomReviewTab.jsx` |
| CRITIQUE | Re-prefetch des révisions peut **écraser une révision éditée non sauvegardée** (la garde ne couvre pas un re-prefetch après changement de sélection) | `BomViewerPage.jsx:144-173` |
| MAJEUR | Changement de footprint **groupé** non annulable : `handleFootprintChange` modifie plusieurs items mais ne pousse aucun `undo` (Ctrl+Z incohérent) | `BomViewerPage.jsx:337` |
| MAJEUR | `BomStockDialog` : l'alerte « enregistrées immédiatement » est **trompeuse** — seul `pitch_mm` est PATCHé ; diamètres/marge/sachet/tube ne sont jamais envoyés au serveur | `BomStockDialog.jsx:133` |
| MAJEUR | `value || 25` / `|| ''` masque la valeur **0 légitime** (sachet/tube/marge) → bug `||` vs `??` | `BomStockDialog.jsx:252` |
| MINEUR | Référence de ticket `(#13)` visible dans un tooltip utilisateur | `BomReviewTab.jsx:488` |
| MINEUR | Édition inline persistée au `onBlur` seulement → saisie perdue si on clique un bouton sans blur préalable | `BomImportPreviewCard.jsx:85` |

### 4.4 Commande
**État live :** **page riche et fonctionnelle.** En-tête avec « Exporter ERP / Actualiser / Réinitialiser », cartes (Sélection BOM, Mode d'agrégation « Valeur + empreinte + type », Nom de commande, « ✓ Stock validé »), table « Composants à commander » avec besoin/stock/à commander/qté reçue + fournisseurs réels (Digi-Key, Mouser) et stock disponible.

| Sév. | Constat | Réf. |
|---|---|---|
| CRITIQUE | Risque de **POST `/command/sync` répétés** via deps instables (`bomWorkspace`, `selectedEntries`) — lié au point performance | `CommandPage.jsx:137,291,506` |
| MAJEUR | `persistTimers` (debounce qté reçue) **jamais nettoyés** au démontage → écriture fantôme après navigation | `ProcurementTable.jsx:58` |
| MAJEUR | ~150 lignes de **code mort** (table/tri/pagination zombies remplacés par `ProcurementTable`) + `totalRequiredQuantity`/`totalOrderQuantity`/`overridesCount` calculés mais **jamais affichés** | `CommandPage.jsx:180-231` |
| MAJEUR | `CommandLineRow.jsx` et `SupplierOffersPanel.jsx` probablement **orphelins** (non importés) → à supprimer ou refactorer | — |
| MINEUR | Donnée : sur une ligne, Composant=`0603` / Valeur=`LTST-C190KRKT` semblent **inversés** (qualité d'harmonisation à vérifier) | live |
| MINEUR | Liens fournisseurs identifiés **par la couleur seule** (pas de soulignement) → a11y | `ProcurementTable.jsx:220` |

### 4.5 Machine PnP — *zone à développer (priorité métier)*
**État live :** fonctionnel après ~5 s. 3 onglets : **Séquence** (machines PNP-01/PNP-02, affectation production active), **Feeders** (table « FEEDERS FIXES (74) » en **lecture seule**), **Chariots** (« CHARIOTS FEEDERS (3) » avec **CRUD complet** : Nouveau chariot / éditer / supprimer).

> **Découverte structurelle majeure :** il existe **deux implémentations parallèles** de Machine PnP, **une seule est branchée**. La version active (`MachinePnpPage.jsx`, 1 179 l.) ne fait que lister/afficher. **~1 500 lignes de code mort** (`hooks/useMachineConfig.js`, `useWorkspaceData.js`, `useFixedFeeders.js`, `useBomCategories.js`, `components/machine/MachinePnpSlotStrip.jsx`, `MachinePnpTables.jsx`, `MachinePnpDialogs.jsx`) portent **toute la couche fonctionnelle « plan d'implantation »** (slot-strip visuel, assignation feeders, validation d'ordre de fabrication, réordonnancement de séquence, dialogue de config machine) qui **n'est pas accessible dans l'app**.

**Décision à trancher AVANT de développer ici :** supprimer ce code mort, ou le réintégrer (s'il porte les fonctionnalités que vous voulez). Les deux ne peuvent pas coexister sans risque de « réparer la mauvaise version ». C'est probablement aussi l'origine du **bug historique de boucle infinie** (sync quantités dans `useMachineConfig.js:262`).

Fonctionnalités **manquantes** dans la page active (à développer) :
- Plan d'implantation feeders / slot-strip visuel.
- CRUD des feeders fixes (aujourd'hui lecture seule).
- Réordonnancement de la séquence BOM (`sequence_order` figé).
- Validation/dévalidation d'un ordre de fabrication.
- **Détachement** d'une production d'une machine (affectation à sens unique aujourd'hui).

| Sév. | Constat | Réf. |
|---|---|---|
| CRITIQUE (à décider) | ~1 500 l. de code mort dupliquant la fonctionnalité ; boucle de sync latente si rebranchée | `useMachineConfig.js:262` |
| MAJEUR | Aucun fetch n'a d'`AbortController` (Feeders/Chariots/summary) → races | `MachinePnpPage.jsx:713,859,1033` |
| MAJEUR | « Actualiser » repasse `machinesLoading=true` → **démonte tout le panneau** (spinner plein écran, perte de contexte/scroll) | `MachinePnpPage.jsx:1139` |
| MAJEUR | `KindChip` ne gère que `COMMON`/`CATEGORY` → un chariot `CUSTOM` est **mal étiqueté « Catégorie »** | `MachinePnpPage.jsx:96` |
| MINEUR | Suppression machine/chariot sans **indication d'impact** (productions/plans liés) | `MachinePnpPage.jsx:196` |
| MINEUR | Listes tronquées en dur (feeders `limit=500`, chariots `200`, machines `100`) sans avertissement | `MachinePnpPage.jsx:728` |
| MINEUR (live) | Chariot `COMPOSANT_COMMUN` : 80/80 utilisées mais 74 composants (affichage à clarifier) | live |
| MINEUR | Fichier **1 179 lignes** non refactoré (plan de découpage fourni en annexe) | `MachinePnpPage.jsx` |

### 4.6 BOM enregistrées
**État live :** fonctionnel. Arbre par catégorie (7 BOM : Ampli 2, Carrier Board 2, Sans catégorie 3), recherche, « + Catégorie », panneau de détail (révisions REV_E BOT/TOP, statut ACTIVE, « Ouvrir », supprimer), état vide propre.

| Sév. | Constat | Réf. |
|---|---|---|
| MAJEUR | **Double confirmation de suppression** : `BomLibraryDetail` ouvre son propre `ConfirmDialog` puis `BomFilesPage` en ouvre un **second** → l'utilisateur confirme deux fois | `BomFilesPage.jsx:451` + `BomLibraryDetail.jsx:65` |
| MAJEUR | « Tout sélectionner » sélectionne **tous** les items, pas les items **filtrés** par la recherche (coche 200 lignes invisibles) | `BomLibraryCard.jsx:291` |
| MINEUR | En-tête « 1 révision · 2 fichiers » vs arbre qui affiche « 2 » → comptage révisions/fichiers ambigu entre les vues | live |
| MINEUR | Lien brut `href="#/import-bom"` au lieu de `useNavigate` ; fetch initial sans `AbortController` | `BomFilesPage.jsx:103,290` |

### 4.7 Base de données (4 onglets)
**État live :** les 4 onglets fonctionnent. **Empreintes** (catalogue MachineFootprint, table 107 entrées), **Composants** (catalogue 380, éditeur latéral), **Règles de type** (33 règles, import/export JSON, avertissement utile « 6 priorité(s) partagée(s) détectée(s) »), **Enrichissement MPN** (Charger cache / Rechercher en ligne par lot / Tout valider).

| Sév. | Constat | Réf. |
|---|---|---|
| CRITIQUE (dette) | `ReglesTypePanel.jsx` = **1 650 lignes** (5,5× la limite de 300) ; `ComposantsPanel.jsx` = **839 lignes** | — |
| MAJEUR | **Impossible de sauver** un composant sans `reference` : `saveComponent` l'exige mais **l'éditeur n'expose aucun champ Référence** (confirmé en live) → cul-de-sac | `ComposantsPanel.jsx:368` |
| MAJEUR | Pré-remplissage du formulaire par effet → **écrase les saisies en cours** si un reload background tombe pendant l'édition | `ComposantsPanel.jsx:270` |
| MAJEUR | Export TXT de l'aperçu **sans `catch`** (incohérent avec les autres handlers) ; historique d'undo à indices fragiles sur action destructive | `ReglesTypePanel.jsx:932,900` |
| MINEUR (live) | Badge « 75 empreinte(s) » contredit « 107 entrée(s) » affiché dans la même carte | live |
| MINEUR (live) | Accent manquant « 380 composant(s) affiches » ; UI/export mélangent FR/EN | `ComposantsPanel.jsx` |
| MINEUR | Bordure `#1f2937` (Base de données, Settings, panels) ≠ `colors.border = #27272a` (reste de l'app) → incohérence visuelle subtile | `BaseDeDonneesPage.jsx:25` |

### 4.8 Paramètres
**État live :** propre et bien organisé. Intégrations API fournisseurs (Mouser « Configuré », DigiKey « Configuré », secrets masqués + mention « jamais réaffichés » = bonne pratique), Valeurs ERP par défaut (« Ouvrir les défauts ERP → »), Chemins import/export (lecture seule, `serveur/.env`), accès Base de données.

| Sév. | Constat | Réf. |
|---|---|---|
| MAJEUR | `ErpDefaultsPage` passe `subtitle` à `PageHeader` qui n'accepte que `description` → **le sous-titre ne s'affiche jamais** | `ErpDefaultsPage.jsx:70` |
| MINEUR | Pas de détection « modifié non enregistré » (dirty state) → perte de saisie possible en quittant ; Alert d'erreur non effaçable | `ErpDefaultsPage.jsx` |

---

## 5. Constats transversaux

### 5.1 Design system — la palette n'est pas centralisée
`theme.js` expose un objet `colors` (émeraude `#10b981`, surfaces zinc `#18181b`/`#27272a`, textes `#f4f4f5`/`#a1a1aa`/`#52525b`). **Problème : presque aucun fichier ne l'utilise.** La quasi-totalité des composants **réécrit ces hex en dur** (des centaines d'occurrences). Trois systèmes coexistent même par endroits : hex en dur, `colors.*`, et `var(--border)` CSS. La palette est donc respectée *en valeur* mais pas *via les tokens* → **toute évolution de charte sera laborieuse et risquée**. Seuls `StatCard.jsx`, `BomImportOverviewPanel.jsx` et partiellement `CommandPage`/`ErpDefaultsPage` utilisent `colors`.
**Recommandation :** centraliser via le thème MUI + objet `colors` unique, bannir les hex en dur (règle ESLint), unifier la bordure (`#1f2937` → `#27272a`).

### 5.2 Accessibilité (a11y)
- **Contraste** : `#52525b`/`#71717a` sur fonds `#18181b`/`#09090b` pour des textes secondaires porteurs de sens → **sous le seuil WCAG AA 4.5:1**. Présent sur Dashboard, AppShell, Machine PnP, panels. Texte `#0a0a0a` sur chip gris `#71717a` (`MpnEnrichmentPanel`).
- **Stepper du workflow** (`AppShell.jsx`) : étapes sans `aria-current="step"` ni label décrivant l'état (terminée/active/à venir) ; le `✓` et les numéros sont purement visuels.
- **Liens fournisseurs** identifiés par la couleur seule (pas de soulignement).
- **ErrorBoundary** : pas de gestion de focus, « Réessayer » sans `resetKeys` → boucle de crash possible sur erreur déterministe.
- **Bons points** : `StatCard`, l'arbre de `BomFilesPage` et `MachineCard` gèrent correctement rôle/`tabIndex`/clavier/`aria`.

### 5.3 i18n / finition FR
Accents manquants et anglais résiduel concentrés sur : `BomImportPreviewCard` (Portee, Prets, Conserves…), `ComposantsPanel` (affiches, selection, Edition…), `ReglesTypePanel` (UI + export .txt en anglais), JSDoc `SupplierOffersPanel`. Probable souci d'encodage à l'écriture. Une passe de relecture FR globale est recommandée (et un lint d'encodage UTF-8).

### 5.4 Pattern technique systémique : `AbortController` absent
La plupart des `fetch`/`useEffect` de chargement **n'annulent pas** leurs requêtes au démontage (Dashboard, Import, Machine PnP, BomFiles, Composants, Empreintes, MPN…). Conséquences : warnings React, races « la réponse lente écrase l'état récent », écritures fantômes. `ImportBomPage.loadProductions`, `CommandPage` et `BomLibraryCard` le font **bien** (flag `cancelled`/`requestId`) → généraliser ce pattern.

### 5.5 Dette : fichiers > 300 lignes (règle CLAUDE.md)
`ReglesTypePanel` (1 650), `BomImport` (1 369), `MachinePnpPage` (1 179), `BomSessionContext` (951), `ComposantsPanel` (839), `BomViewerPage` (738), `BomReviewTab` (699), `DashboardPage` (~715). À découper progressivement (extraire dialogs, hooks, helpers purs vers `utils/`).

---

## 6. Backend, sécurité & robustesse

Points **positifs** : ORM SQLAlchemy paramétré (pas d'injection SQL), `contextIsolation:true` + `nodeIntegration:false` côté Electron, secrets fournisseurs gitignorés + masqués en UI, transactions/rollback corrects, pagination présente sur les listes principales, `requirements.txt` épinglé.

| Sév. | Constat | Réf. |
|---|---|---|
| CRITIQUE | **Auth API désactivée par défaut** (si `API_KEY` vide → tout ouvert) et **`DEMARRER_SERVEUR.bat` force `set API_KEY=`** ; combiné à `API_HOST=0.0.0.0`, l'API est exposée sans auth sur le réseau | `auth.py:40`, `DEMARRER_SERVEUR.bat:8`, `config.py:71` |
| CRITIQUE | « Prod » retombe en **SQLite** ; si SQL Server visé mais injoignable, `test_connection` n'élève pas l'erreur → l'app démarre avec une DB cassée et plante au 1er appel | `database.py:113`, `app.py:55` |
| MAJEUR | **Pas de gestionnaire d'exception global** : les 500 renvoient `str(exc)` au client (fuite d'info interne) | `app.py` (aucun `exception_handler`) |
| MAJEUR | **Aucune limite de taille d'upload** (`await file.read()` charge tout en RAM) → DoS trivial ; tempfiles d'import potentiellement non nettoyés | `bom_revision_imports.py:47` |
| MAJEUR | Comparaison de clé API non constant-time (`!=`) → timing attack ; utiliser `hmac.compare_digest` | `auth.py:45` |
| MAJEUR | **CORS large** (8 origines localhost injectées même en prod) + `allow_credentials=True` + méthodes/headers `*` | `app.py:72` |
| MAJEUR | Mot de passe SQL Server **non URL-encodé** dans la chaîne de connexion (casse si caractères spéciaux) | `config.py:97` |
| MINEUR | `/docs` et `/redoc` exposés sans condition (cartographie de l'API) ; à désactiver en prod | `app.py:67` |
| MINEUR | Electron : menu expose `toggleDevTools`/`reload` même en prod ; pas de `setWindowOpenHandler`/`will-navigate`/CSP ; `preload` expose des channels IPC génériques | `main.js:158`, `preload.js:9` |

---

## 7. Plan de déploiement & système de mise à jour (conception, sans implémentation)

> Objectif visé : un **exe simple à télécharger et lancer** (comme une application classique) + un moyen de **mise à jour facile** (bouton « Rechercher les mises à jour » et/ou auto-update au démarrage), pour que vous puissiez pousser des versions stables et des correctifs depuis votre côté.

### 7.1 Le verrou à lever d'abord
Aujourd'hui, l'exe Electron **n'embarque pas le backend** : il charge le build React et tape une URL backend **figée au build** (`REACT_APP_API_URL=http://localhost:8000/api`). Pour un déploiement « double-clic », il faut qu'**Electron démarre lui-même le backend Python** et attende qu'il réponde avant d'afficher l'UI.

### 7.2 Architecture cible recommandée (mono-poste Windows)
1. **Backend packagé avec PyInstaller** en `pcb-flow-server.exe` (onefile ou onedir), embarquant Python + FastAPI + dépendances. Plus de `pip install` chez l'utilisateur.
2. **Electron lance le backend en sous-processus** (`child_process.spawn`) au démarrage (`app.whenReady`), sur `127.0.0.1` avec un **port libre détecté dynamiquement** (passé au renderer via `preload`), puis **health-check `/api/health`** avant d'afficher la fenêtre. À la fermeture (`app.on('quit')`), tuer le process backend.
3. **Base de données** : trancher explicitement. Pour un poste isolé, SQLite packagé + dossier de données utilisateur (`app.getPath('userData')`) ; pour un usage partagé/multi-postes, SQL Server avec fail-fast si injoignable et mot de passe URL-encodé.
4. **Auth activée** : `API_KEY` obligatoire en prod, générée/stockée localement, comparée en constant-time. Retirer `set API_KEY=` du `.bat`.
5. **Empaquetage** avec `electron-builder` cible **NSIS** (installeur classique avec raccourcis bureau/menu démarrer — déjà configuré) **et/ou portable** (déjà présent).

### 7.3 Système de mise à jour
Approche standard 2026 confirmée : **`electron-updater` + `electron-builder` + GitHub Releases**.
- `electron-builder` publie automatiquement, à chaque release, les installeurs **et** un fichier de métadonnées `latest.yml`.
- Côté app : `autoUpdater.checkForUpdatesAndNotify()` au démarrage (auto) **et** un bouton **« Rechercher les mises à jour »** dans le menu « Aide » ou un écran Paramètres (manuel) ; afficher la progression de téléchargement puis proposer « Redémarrer pour installer ».
- **Hébergement des releases** : GitHub Releases (le plus simple), ou serveur HTTP générique / S3 si vous préférez du privé. Un **PAT GitHub** (scope `repo`) sert au publish depuis votre poste/CI.
- **Canaux** : possibilité d'un canal `beta` (`"version":"x.y.z-beta"` + `generateUpdatesFilesForAllChannels:true`) pour tester avant de promouvoir en `latest` stable.
- **Versionnage** : SemVer dans `client/src/desktop/package.json` (aujourd'hui `1.0.0`) ; chaque correctif = bump de version + nouvelle release.
- **Point d'attention** : l'auto-update remplace l'app Electron (frontend + binaire backend packagé). Si le backend tourne en sous-processus packagé, il est mis à jour **avec** l'app — c'est l'intérêt de tout empaqueter ensemble. Les **migrations de schéma** (Alembic) doivent être jouées au démarrage du backend après mise à jour (prévoir un `alembic upgrade head` au boot, idempotent).
- **Signature de code** (optionnel mais recommandé) : sans certificat, Windows SmartScreen affichera un avertissement au premier lancement. Un certificat de signature (OV/EV) le supprime ; à budgéter si distribution large.

### 7.4 Pipeline de build à séparer (dev ≠ prod)
- Retirer les flags **dev** du build prod (`DANGEROUSLY_DISABLE_HOST_CHECK=true` ne doit pas finir dans le bundle prod).
- Externaliser l'URL/port backend en **config runtime** (lue par Electron), pas au build React.
- Ne pas livrer les scripts dev (`auto_push.bat`, etc.) dans le package.
- Versionner un `client.env.example` (le `client.env` actuel est absent du repo → build non reproductible).

### 7.5 Séquence de mise en œuvre suggérée (plus tard)
1. PyInstaller backend → `pcb-flow-server.exe` + test manuel.
2. Electron : spawn backend + health-check + teardown + port dynamique.
3. Auth activée + DB tranchée + migrations au boot.
4. `electron-builder` publish GitHub + `electron-updater` (auto + bouton manuel).
5. Premier installeur signé (ou non) → test d'un cycle complet **install → usage → release patch → auto-update**.
6. `engineering:deploy-checklist` avant la toute première diffusion au travail.

---

## 8. Feuille de route priorisée

### P0 — Avant tout déploiement
1. **Corriger le gel des pages BOM** (stabiliser `bomWorkspace`, virtualiser les tables) — §3.
2. **Câbler le backend dans Electron** (spawn + health-check + teardown) — §7.2.
3. **Activer l'auth API** + `compare_digest` + retirer `set API_KEY=` + host `127.0.0.1` — §6.
4. **Trancher la base de données** (SQLite packagé *ou* SQL Server fail-fast, mot de passe encodé) — §6.
5. **Gestionnaire d'exception global** + plafond d'upload + nettoyage tempfile — §6.

### P1 — Stabilité & correctifs UX
6. `AbortController` généralisé (pattern §5.4).
7. Double confirmation de suppression (BOM enregistrées) ; « tout sélectionner » filtré ; `subtitle` ERP ; champ Référence dans l'éditeur composant ; `KindChip` CUSTOM ; timers debounce nettoyés (Commande).
8. **Trancher le code mort Machine PnP** (supprimer ou réintégrer) **avant** d'y développer les fonctionnalités restantes.
9. Mettre en place `electron-updater` + pipeline de release.

### P2 — Finition & dette
10. Centraliser le design system (`colors`/thème, bannir les hex en dur, unifier la bordure).
11. Passe a11y (contraste AA, `aria-current` du stepper, soulignement des liens, focus ErrorBoundary).
12. Passe i18n FR (accents, anglais résiduel, références `(#xx)` hors UI).
13. Découper les fichiers > 300 lignes (commencer par `ReglesTypePanel`, `BomImport`, `MachinePnpPage`).
14. Supprimer le code mort (`CommandPage` zombie, `CommandLineRow`/`SupplierOffersPanel` orphelins, hooks Machine PnP).

### Plus tard — Fonctionnalités Machine PnP (votre chantier)
Plan d'implantation feeders / slot-strip, CRUD feeders fixes, réordonnancement de séquence, validation d'ordre de fabrication, détachement production↔machine.

---

## 9. Points positifs à conserver
- Workflow métier clair et bien rythmé (stepper 5 étapes, sidebar groupée, indicateur de production active).
- Design émeraude/zinc cohérent et lisible ; états vides soignés (cartes + CTA).
- `StatCard` exemplaire en a11y → modèle de référence pour refactorer le reste.
- Données réelles fluides (BOM, composants, offres fournisseurs Mouser/DigiKey, stock).
- Sécurité de base correcte côté Electron (`contextIsolation`/`nodeIntegration:false`) et backend (ORM paramétré, secrets masqués/gitignorés, transactions).
- Feedbacks utiles (avertissement priorités partagées des règles de type, validation stock, badges « Configuré »).

---

## Annexe — Découpage proposé pour `MachinePnpPage.jsx`
```
pages/MachinePnpPage.jsx          → orchestrateur (tabs, états globaux, affectation) ~150 l.
components/machine/dialogs/        → CreateMachine, DeleteMachine, CreateCart, EditCart, DeleteCart
components/machine/                → MachineCard, BomRevisionTable, SequenceTab, FeederTab, ChariotTab
components/machine/chips/          → SideChip, StatusChip, KindChip (corriger CUSTOM)
hooks/useMachines.js               → loadMachines/loadSummary/assign (+ AbortController)
theme/machinePnp.tokens.js         → toutes les couleurs en dur → tokens
```
*Prérequis : décider du sort des ~1 500 lignes de code mort (supprimer vs réintégrer) avant de découper.*
