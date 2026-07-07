# Audit — Travail multi‑postes sur productions différentes

- **Date** : 2026-07-07
- **Contexte** : déploiement WEB LAN (backend unique sur `192.168.5.44:8000`, UI servie à plusieurs postes via navigateur, clé API partagée `pcbflow-lan-2026`).
- **Question posée** : que se passe‑t‑il quand plusieurs postes travaillent en même temps, et comment permettre à plusieurs postes de travailler sur des **productions différentes** ?
- **Portée** : audit de la problématique de concurrence. **Aucune implémentation** — document de réflexion.

---

## 1. Résumé exécutif

Bonne nouvelle : l'architecture est **déjà en grande partie adaptée** au travail multi‑postes sur productions différentes. Les données sensibles sont cloisonnées par `production_id`, la « production active » est propre à chaque navigateur (aucun état partagé), et le stock — volontairement global (une bobine physique est unique) — est **déjà réparti entre productions par un mécanisme de réservation** (ADR 0011).

Le scénario que tu vises (**poste A sur prod 1, poste B sur prod 2**) fonctionne donc sans se marcher dessus dans la majorité des cas. Les risques résiduels ne sont pas des blocages mais des **angles morts** : pas de synchronisation temps réel (chacun voit un instantané jusqu'au rafraîchissement), pas de verrou en cas d'édition simultanée de la **même** entité, et **aucune traçabilité par poste** (tout le monde est « la même personne » côté serveur).

Verdict par scénario :

| Scénario | État actuel |
|---|---|
| Postes sur **productions différentes** | ✅ Globalement sûr (isolation par `production_id` + réservation de stock) |
| Postes sur la **même** production | ⚠️ Risque de « dernier qui écrit gagne » (pas de verrou ni de version) |
| Vue partagée (stock, dispo) | ⚠️ Lectures potentiellement périmées (pas de temps réel) |
| Qui a fait quoi | ⚠️ Non traçable (clé API unique, pas d'identité poste) |

---

## 2. Ce qui est déjà en place (constats factuels)

### 2.1 Aucune identité utilisateur / poste côté serveur
Une seule clé partagée `X-API-Key` (`serveur/src/auth.py:46-67`). Aucune colonne `user_id` / `workstation` / `created_by` dans les modèles, aucun cookie ni header d'identification de poste (`client/.../api/client.js:78-88` n'injecte que la clé). **Conséquence** : deux navigateurs sont indistinguables pour le backend.

### 2.2 « Production active » = contexte local du navigateur
Stockée uniquement en `localStorage`, par navigateur, et scellée par production :
- `ACTIVE_PRODUCTION_STORAGE_KEY = 'pcb-production:active-production'`
- BOM/import/workspace courants préfixés par `productionId` (`context/BomSessionContext.jsx:18-22, 315-346`).

Aucune notion de « production active globale » côté serveur : `Production` n'a pas de flag `is_active` (`serveur/src/models/production.py`), et `marketplace_productions.py` n'expose que du CRUD. **Conséquence** : chaque poste choisit sa production indépendamment, sans impacter les autres. ✅

### 2.3 Données cloisonnées par `production_id` (isolées entre productions)
- Révisions BOM liées à la production (`ProductionBomRevision`)
- Chiffrage (`ProductionCostInput`, `ProductionCosting` — indexés `production_id`)
- Commandes et plans (`Command.production_id`, `ProductionPlan` → `Command`)
- Épinglage machine (`PnpSlotPin` : clé `(production_id, machine_id)`)
- Placements manuels (`PnpManualPlacement` : `(production_id, machine_id, component_id)`)

Deux productions différentes ne partagent donc **aucune** de ces données. ✅

### 2.4 Stock : global **par conception**, mais réparti entre productions
`ComponentStock`, `StockMovement`, `ComponentMachineLoad` n'ont **pas** de `production_id` : ils reflètent le **stock physique réel**, qui est unique (une bobine ne se dédouble pas). C'est un choix correct.

Ce stock global est déjà **conscient du multi‑production** via le service de réservation (`production_stock_service.py`, ADR 0011) :
- `_reserved_by_others()` = Σ des besoins restants des **autres** productions non clôturées (lignes 169‑198) ;
- `disponible = solde − réservé_par_les_autres − engagé` (ligne 225), et `can_produce` en découle.

Autrement dit, si le poste A engage des composants pour la prod 1, le poste B sur la prod 2 voit le **disponible réduit** — ce qui est le comportement souhaité, pas un bug. ✅ (avec la réserve du §3.1 sur la fraîcheur).

### 2.5 Caches serveur sûrs
`catalog_cache.py` (règles de type, mappings d'empreintes) : TTL 60 s, protégés par `Lock`, invalidés après écriture, en lecture seule. Pas d'état mutable global problématique. ✅

---

## 3. Risques résiduels (à discuter)

### 3.1 Lectures périmées — pas de synchronisation temps réel — **Sévérité : moyenne**
L'UI charge un instantané et ne se met pas à jour toute seule quand un autre poste modifie la base. Exemple : le poste A déclare/consomme du stock ; le poste B garde à l'écran l'ancien « disponible » jusqu'à ce qu'il clique « Rafraîchir ». La base reste juste, mais la décision peut être prise sur une vue datée. Pas de WebSocket / polling aujourd'hui.

### 3.2 Édition simultanée de la **même** entité — « dernier qui écrit gagne » — **Sévérité : moyenne à haute**
Aucune concurrence optimiste (pas de champ `version` ni de contrôle `updated_at` au moment de l'écriture). Si deux postes éditent en même temps la même production (mêmes épinglages, mêmes seuils, ou une correction du même composant en stock), la seconde écriture écrase la première **sans avertissement**. SQL Server garantit l'intégrité transactionnelle (pas de corruption), mais pas l'absence de **perte de mise à jour logique**.

### 3.3 Corrections de stock concurrentes — **Sévérité : moyenne**
Le stock étant global, deux « corrections d'inventaire » simultanées sur le même composant depuis deux postes se résolvent en dernier‑écrit‑gagne. Les *mouvements* (append‑only) restent tracés, mais le solde recompté peut surprendre.

### 3.4 Absence de traçabilité par poste — **Sévérité : moyenne**
`StockMovement` et les autres écritures ne portent aucun identifiant de poste/opérateur. Impossible de répondre à « qui a déclaré ce stock / modifié cette production ? ». Gênant en atelier multi‑opérateurs.

### 3.5 Pas de garde‑fou « une production ouverte sur deux postes » — **Sévérité : à décider**
Rien n'empêche (ni ne signale) que deux postes ouvrent la **même** production simultanément. Ce n'est pas forcément un mal (deux opérateurs sur la même série), mais combiné au §3.2 ça peut créer des surprises.

---

## 4. Axes de réflexion (options, non implémentées)

Classées du plus léger au plus lourd. Elles sont combinables.

**Option 0 — Discipline organisationnelle (coût nul).**
Convention « 1 poste = 1 production à la fois », sans changement technique. Suffisant si l'équipe est petite et disciplinée. Ne couvre pas les erreurs humaines.

**Option 1 — Identité de poste (léger).**
Chaque navigateur se voit attribuer un nom de poste (saisi une fois, mémorisé en `localStorage`) envoyé dans un header et journalisé sur les écritures (surtout `StockMovement`). Apporte la **traçabilité** (§3.4) sans rien verrouiller. Base utile pour les options suivantes.

**Option 2 — Rafraîchissement / signalement d'activité (léger à moyen).**
Polling léger ou bandeau « X a modifié cette production, rafraîchir ? » pour atténuer les lectures périmées (§3.1). Moins intrusif que du temps réel complet.

**Option 3 — Verrou souple d'édition (moyen).**
Marquer une production (ou une machine PnP) comme « ouverte en édition par poste X depuis HH:MM ». Les autres postes voient l'info et passent en lecture seule ou reçoivent un avertissement. Couvre §3.2 et §3.5. Nécessite l'Option 1.

**Option 4 — Concurrence optimiste (moyen).**
Ajouter un `version`/`updated_at` vérifié à l'écriture ; en cas de conflit, refuser et proposer un rechargement (« la donnée a changé entre‑temps »). Couvre proprement §3.2 et §3.3 sans bloquer personne a priori.

**Option 5 — Temps réel (lourd).**
WebSockets/SSE pour pousser les changements (stock, dispo, épinglages) à tous les postes. Confort maximal, coût et complexité les plus élevés (probablement surdimensionné pour l'usage atelier).

---

## 5. Questions ouvertes (pour cadrer la suite)

1. Combien de postes simultanés, et est‑ce que **deux postes** travailleront réellement sur la **même** production en même temps, ou toujours sur des productions distinctes ?
2. La **traçabilité par opérateur/poste** est‑elle un besoin (qualité, atelier) ou un « nice to have » ?
3. En cas d'édition concurrente, préfères‑tu **bloquer** (verrou) ou **avertir et laisser choisir** (concurrence optimiste) ?
4. Le confort « la vue se met à jour toute seule » est‑il attendu, ou un bouton « Rafraîchir » suffit‑il ?
5. Périmètre du verrou éventuel : la production entière, ou seulement la machine PnP / l'écran en cours d'édition ?

---

## 6. Recommandation de priorisation (à valider ensemble)

1. **Court terme, faible coût** : Option 1 (identité de poste + journalisation) — débloque la traçabilité et sert de socle. + Option 2 (signalement/rafraîchissement) pour les lectures périmées.
2. **Moyen terme, si édition concurrente réelle** : Option 4 (concurrence optimiste) sur les entités éditables sensibles (production, stock), plus robuste et moins frustrante qu'un verrou dur.
3. **Optionnel** : Option 3 (verrou souple) si l'équipe préfère un cadre explicite « une prod = un éditeur ».
4. **À éviter pour l'instant** : Option 5 (temps réel complet), coût/bénéfice défavorable à cette échelle.

> Aucune de ces pistes n'est engagée. Prochaine étape suggérée : répondre aux questions du §5 pour choisir une ou deux options à spécifier (via un ADR) avant tout code.

---

## Annexe — Fichiers de référence

| Sujet | Fichier | Lignes |
|---|---|---|
| Auth (clé partagée, pas d'identité) | `serveur/src/auth.py` | 46‑67 |
| Production active (localStorage) | `client/src/frontend/src/context/BomSessionContext.jsx` | 18‑22, 315‑346 |
| Modèle Production (pas de `is_active`) | `serveur/src/models/production.py` | 22‑53 |
| Stock global (pas de `production_id`) | `serveur/src/models/stock.py` | 59‑137 |
| Réservation multi‑production | `serveur/src/services/production_stock_service.py` | 169‑255 |
| ADR clôture/réservation stock | `docs/adr/0011-cloture-production-reservation-stock.md` | — |
| Caches catalogues (thread‑safe) | `serveur/src/utils/catalog_cache.py` | 66, 98, 101 |
