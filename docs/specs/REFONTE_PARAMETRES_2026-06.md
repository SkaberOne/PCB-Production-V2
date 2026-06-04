# Refonte Paramètres + scission Bibliothèque — Analyse design

> Spec produite le 2026-06-03 · branche conseillée : `refonte-design-2026-06`
> Cible : `client/src/frontend/src/pages/SettingsPage.jsx` (2646 lignes) + nav `App.jsx` / `AppShell.jsx`
> Méthode : critique design (plugin Design) ancrée sur le code source réel.

---

## 1. État des lieux (ce que la page contient vraiment)

La page `/parametre` est un **`<Stack>` vertical unique** qui empile, sans navigation interne :

1. `PageHeader` « Administration et référentiels ».
2. **4 bandeaux d'alerte** distincts empilés (editor, library, machineFootprint, typeRule) — jusqu'à 4 `Alert` simultanés en haut de page.
3. **Card « Catalogue composants »** — le plus gros bloc : table composants (recherche, tri, pagination serveur), éditeur de fiche (Value, MPN, Type, MachineFootprint, Tape width, Pitch, Type feeder, Package + accordéon Code fournisseur / Footprint Eagle / Description / Notes), et un sous-bloc d'import du **catalogue MachineFootprint** (.txt/.csv).
4. **Card « Règles de type par Référence »** — table de règles d'harmonisation + éditeur + historique/undo local + système d'aperçu (diff ajout/maj/suppression).
5. **`MpnEnrichmentPanel`** — enrichissement des fiches composants via API fournisseurs.
6. **Grid de 4 cartes** (« Base de données », « Règles d'harmonisation », « Machines PnP », « Chemins import / export ») dont le bouton **« Ouvrir la section » est `disabled`** : navigation morte qui ne mène nulle part.

### Constats annexes
- `ErpDefaultsPage` existe (`/parametre-erp`, ADR 0004) mais **n'est pas dans le menu** : page orpheline accessible seulement par URL directe. C'est pourtant un réglage applicatif typique.
- Le titre « Administration **et référentiels** » avoue le problème : la page mélange deux natures différentes — *régler l'app* et *gérer des données métier*.

---

## 2. Critique design

### Impression générale
La page ne dit pas en 2 secondes « ici je règle l'application ». Elle ressemble à un **écran d'administration de base de données** : deux énormes tableaux scrollables dominent, et les vrais réglages (chemins, API, machines) sont soit absents, soit réduits à 4 cartes inertes en bas. Le diagnostic « brouillon » est exact : c'est un problème d'**architecture de l'information**, pas seulement d'esthétique.

### Usabilité
| Constat | Sévérité | Recommandation |
|---|---|---|
| 4 cartes « Ouvrir la section » désactivées : promesse de navigation jamais tenue | 🔴 Critique | Supprimer. Une UI morte érode la confiance et fait croire à un bug. |
| Tout est sur une seule page scrollée (~2650 lignes) sans onglets ni ancres | 🔴 Critique | Découper en onglets / pages. Le guide projet impose déjà de scinder tout composant > 300 lignes. |
| Jusqu'à 4 `Alert` empilés en tête de page repoussent le contenu vers le bas | 🟡 Moyen | Un seul système de notification (snackbar ou zone d'alerte contextuelle par section). |
| Gestion de données métier (composants, empreintes, règles) logée dans « Paramètres » | 🔴 Critique | Migrer ces référentiels vers la section **Bibliothèque** (voir §3). |
| `ErpDefaultsPage` injoignable depuis le menu | 🟡 Moyen | La rattacher aux Paramètres (onglet « Défauts ERP »). |

### Hiérarchie visuelle
- **Ce qui attire l'œil en premier** : les grandes tables composants/règles — donc de la **donnée**, alors qu'une page Paramètres devrait mettre en avant des **réglages**.
- **Flux de lecture** : long scroll linéaire sans repère. Pas de carte mentale possible (« où se règle l'API ? »).
- **Emphase** : inversée. Les référentiels (consultés ponctuellement) écrasent les réglages (le vrai objet de la page).

### Cohérence
| Élément | Problème | Recommandation |
|---|---|---|
| Surfaces | Mélange `#18181b`/`#1f2937` en dur et `var(--border)` / `colors.surfaceCard` selon les cartes | Tout passer par les tokens du thème (`colors.*`). |
| Pattern de section | Cards empilées vs cartes-liens désactivées vs accordéon | Un seul pattern : onglets + cartes de réglage homogènes. |
| Densité | Tables ultra-compactes (`compactCellSx`) à côté de cartes très aérées | Harmoniser la densité par type de contenu. |

### Accessibilité (palette émeraude/zinc à conserver)
- **Contraste** : texte `#a1a1aa`/`#52525b` sur `#18181b` — le gris `#52525b` (labels de groupe) est **sous AA** pour du petit texte. À remonter vers `#71717a`+.
- **Cibles tactiles** : nombreux `IconButton size="small"` dans les tables (monter/descendre règle) proches du seuil 44×44 px.
- **Titres** : viser **un seul `h1` par page** après découpage (actuellement plusieurs `h6` font office de titres de section sans hiérarchie réelle).
- **Boutons désactivés** : « Ouvrir la section » désactivé sans explication = piège lecteur d'écran.

### Ce qui fonctionne déjà
- Palette émeraude/zinc cohérente et lisible globalement.
- Table composants robuste (tri/recherche/pagination serveur) — bonne brique, **mauvais emplacement**.
- Système historique/undo/aperçu des règles : fonctionnellement riche, mérite sa propre page dédiée.
- `MpnEnrichmentPanel` déjà isolé en composant autonome → migration facile.

---

## 3. Réorganisation proposée

Principe directeur : **Paramètres = régler l'application. Bibliothèque = gérer les données/référentiels.**
Distinction clé sur la base de données : Paramètres garde la *connexion/persistance* (SQLite/SQL Server) ; la Bibliothèque reçoit le *contenu* (composants, empreintes, règles).

### 3.1 Section BIBLIOTHÈQUE (référentiels métier)
| Page | Contenu (migré depuis Paramètres) |
|---|---|
| BOM enregistrées | *(inchangé)* |
| **Référentiels (nouveau)** — page à onglets | **Composants** (table + éditeur de fiche) · **Empreintes machine** (catalogue MachineFootprint + import) · **Règles de type / Harmonisation** (table + historique/undo/aperçu) · **Enrichissement MPN** (`MpnEnrichmentPanel`) |

> L'enrichissement MPN agit *sur* le catalogue composants → il suit le catalogue dans la Bibliothèque. Ses **identifiants d'API** restent en Paramètres (voir 3.2). À confirmer (cf. §4).

### 3.2 Section PARAMÈTRES (réglages application)
Page unique à **onglets**, épurée :
| Onglet | Contenu |
|---|---|
| Général | Connexion base de données (SQLite/SQL Server), persistance, infos version |
| API fournisseurs | Clés Mouser / DigiKey, quotas, test de connexion *(feature cadrée 2026-06-03)* |
| Défauts ERP | Récupère `ErpDefaultsPage` (page orpheline) |
| Chemins import / export | Répertoires des flux locaux |
| Machines PnP | Réglages machine *(ou lien vers la page Machine PnP existante)* |

### 3.3 Nettoyage
- Supprimer la Grid des 4 cartes-liens désactivées.
- Unifier la notification (un seul mécanisme).
- Remplacer les couleurs en dur par les tokens `colors.*`.
- Remonter `#52525b` → `#71717a` pour repasser AA.

---

## 4. Points à trancher avant implémentation
1. **`MpnEnrichmentPanel`** : migrer en Bibliothèque avec le catalogue (recommandé) ou le garder en Paramètres comme prévu dans le chat précédent ? *(Le plan précédent le voulait dans Paramètres › Base de données — cette refonte le déplace.)*
2. **Page Référentiels** : un seul écran à onglets, ou plusieurs entrées de menu distinctes dans Bibliothèque (Composants / Empreintes / Règles) ?
3. **Machines PnP** : réglages dans Paramètres, ou tout renvoyer vers la page Machine PnP du workflow ?

---

## 5. Recommandations prioritaires
1. **Scinder données et réglages** — migrer Composants + Empreintes + Règles + MPN vers une page « Référentiels » en Bibliothèque. C'est le geste qui résout 80 % du « brouillon ».
2. **Transformer Paramètres en page à onglets** (Général / API fournisseurs / Défauts ERP / Chemins / Machines), et y rapatrier la page ERP orpheline.
3. **Supprimer l'UI morte** (4 cartes désactivées) et **unifier les alertes**, puis passer aux tokens de thème + corriger les contrastes sous-AA.
