# Catalogue de scénarios — Agent opérateur virtuel (tests d'usage en profondeur)

> **But** : simuler un opérateur de production réel qui utilise **toute** l'application via Chrome, pour détecter les petits bugs d'usage / régressions / cas de données avant qu'ils n'atteignent la prod. À lancer **après chaque grosse implémentation**, sur **staging uniquement**, avant de promouvoir `dev → prod`.

## 0. Règles générales (à respecter par l'agent)
- **Environnement** : staging `http://localhost:8001` **uniquement**. Clé API `pcbflow-staging`. **JAMAIS** la prod (`:8000`).
- **Base de données** : la copie STAGING isolée. L'agent a le droit de **tout manipuler** (créer, modifier, supprimer) — c'est le principe de l'opérateur virtuel — car les écritures restent sur la base de test.
- **Partage `\\rs\Elec\...`** : **lecture seule**. L'agent peut lancer des scans/dry-run d'import mais ne doit rien écrire sur le partage.
- **Personas** (varier les usages) :
  - **P1 — Opérateur atelier** : produit, teste/valide les cartes, gère le stock cartes, suit les productions.
  - **P2 — Ingé/méthodes** : importe des BOM et des dossiers cartes, corrige les références, gère empreintes/composants/PnP.
  - **P3 — Gestion commandes** : commandes composants (achats) et commandes clients (livraisons machines).
- **Vérification obligatoire à chaque étape** : capture d'écran + lecture de la page (texte/DOM) + si pertinent contre-vérification API/DB (ex. la carte est bien absente après suppression). Un scénario n'est « vert » que si l'attendu est **vérifié**, pas seulement « cliqué ».
- **Sévérités** : `bloquant` (flux impossible / perte de données / erreur 500) · `majeur` (fonction cassée ou résultat faux) · `mineur` (UX, libellé, affichage) · `cosmétique`.
- **Format d'un bug** : titre, écran, persona, étapes de repro, attendu vs obtenu, capture, sévérité, hypothèse de cause.

## Format d'un scénario
`ID` · **Persona** · **Préconditions** · **Étapes** · **Attendu** · **Pièges/variantes**. Les scénarios marqués 🪤 exploitent le **jeu de données piégé** (cf. §15).

---

## 1. Navigation & santé générale
- **NAV-01** · P1 · Ouvrir chaque route (`/dashboard`, `/import-bom`, `/bom`, `/base-donnees`, `/stock`, `/stock-cartes`, `/commande-composant`, `/commande-client`, `/machine-pnp`, `/prix-carte`, `/parametre`, `/parametre-erp`) → **aucune page blanche / ErrorBoundary**, la console navigateur ne montre **aucune erreur JS** rouge. Vérifier le titre et un élément clé par page.
- **NAV-02** · P1 · Redirections : `/` → `/dashboard` ; `/cartes` et `/fichier-bom` → `/base-donnees?tab=cartes` ; `/visualisation-bom` → `/bom`. Attendu : redirection correcte, onglet actif attendu.
- **NAV-03** · P2 · Rafraîchir (F5) chaque page profonde (avec query params) → l'état se recharge sans crash (HashRouter).
- **NAV-04** · P1 · Réseau lent/erreur : couper l'API le temps d'un appel (ou 500 simulé) → l'UI affiche une erreur lisible, pas un écran figé.

## 2. Dashboard (`/dashboard`)
- **DASH-01** · P1 · Les 4 grosses cases affichent des chiffres cohérents avec la base (Cartes catalogue, Cartes en stock + valeur, Alertes stock bas, Productions en cours). Comparer aux comptes réels (API `/reports/dashboard-overview`).
- **DASH-02** · P1 · Bandeau mini-stats : Commandes clients à préparer, Cartes à débugger, Modèles machines. Valeurs cohérentes.
- **DASH-03** · P1 · Chaque case/mini-stat **cliquable** → navigue vers le bon écran.
- **DASH-04** · P1 🪤 · Case « Alertes stock bas » : **verte à 0**, **rouge/amber si > 0** (le jeu piégé force une carte sous le minimum → doit être rouge et le compteur exact).
- **DASH-05** · P1 · Table Productions : recherche, tri (colonnes), rafraîchir (cooldown). Résultats corrects.
- **DASH-06** · P1 · Bloc « Production active » + suivi qualité (testées/validées/à débugger) cohérent avec la production ouverte ; « Points à vérifier / Empreintes PnP » présents près de la prod active.
- **DASH-07** · P1 · Panneaux « Suivi de production » et « Cartes à produire » se chargent et affichent des données.

## 3. Productions (dashboard + cycle de vie)
- **PROD-01** · P1 · Créer une production (nom, mode **SIMPLE**) → apparaît dans la table, devient active.
- **PROD-02** · P1 · Créer une production en **mode assemblage** (AssemblyModeDialog) → comportement dédié correct.
- **PROD-03** · P1 · Ouvrir une production → session hydratée (BOM/état). Renommer → nom mis à jour partout.
- **PROD-04** · P1 · Dupliquer une production → copie fidèle, nouvel enregistrement.
- **PROD-05** · P1 · Archiver puis réactiver une production → statut correct, réintégration OK.
- **PROD-06** · P1 · Supprimer une production → confirmation, suppression **sans orphelin** (vérifier command_items/plans liés nettoyés).
- **PROD-07** · P1 · Valider un **ordre de fabrication** (manufacturing_order_validated_at) → jalon posé, effets attendus.
- **PROD-08** · P1 🪤 · Ouvrir une production **liée à une machine** puis détacher (production↔machine) → cohérence.

## 4. Base de données → Cartes (`/base-donnees?tab=cartes`)
- **CARD-01** · P2 · Recherche par **référence** ET par **nom** (insensible casse/accents) → filtrage instantané correct.
- **CARD-02** · P2 · Cliquer une carte → pop-up (fiche) : nom, code KELENN, type, catégorie, révisions.
- **CARD-03** · P2 · Éditer **nom / code KELENN / type / catégorie** → enregistré, reflété dans la table.
- **CARD-04** · P2 🪤 · Éditer la **référence** d'une carte → enregistrée partout ; tenter une référence **déjà prise** → **refus 409** + message clair, pop-up conservé (jeu piégé fournit un doublon potentiel).
- **CARD-05** · P2 · Fiche carte à **plusieurs révisions** : liste groupée par REV, déroulant TOP/BOT, statut/date/Ouvrir/Supprimer par face (019).
- **CARD-06** · P1 · **Supprimer une carte** non liée → confirmation → disparaît, aucun orphelin.
- **CARD-07** · P1 🪤 · **Supprimer une carte liée** (à une commande interne/client/production/stock/assemblage) → **refus** avec message **nommant** précisément le bloqueur (023). Vérifier chaque type de lien.
- **CARD-08** · P1 · **Suppression multiple** (cases à cocher + « tout sélectionner » sur résultat filtré) → rapport « X supprimées / Y ignorées (liées à …) ».
- **CARD-09** · P2 🪤 · Carte **assemblage** : composition (sous-cartes + composants vrac), quantités ; modifier la composition.

## 5. Base de données → Import catalogue (`tab=import catalogue`)
- **IMPCAT-01** · P2 · **Dry-run** d'un scan sur le partage `\\rs\Elec\...` → liste « à importer » + **rapport des dossiers ignorés** (raison). Aucune écriture sur le partage.
- **IMPCAT-02** · P2 🪤 · Dossiers à **séparateur** espace/underscore/tiret long et **référence seule** (021) → bien détectés « à importer » (pas ignorés).
- **IMPCAT-03** · P2 · Lancer l'**import** → cartes créées avec réf + nom + révisions ; **idempotence** : relancer n'ajoute rien.
- **IMPCAT-04** · P2 · Un dossier « pas une carte » (Archives/history/sans Rev.X) → **ignoré** avec raison distincte de « format non reconnu ».

## 6. Base de données → Composants / Empreintes / Règles / Enrichissement MPN
- **COMP-01** · P2 · Composants : rechercher, créer, éditer, supprimer un composant ; champs (MPN, valeur, référence).
- **COMP-02** · P2 · Empreintes : catalogue d'empreintes, mapping empreinte↔composant.
- **COMP-03** · P2 · Règles de type de composant : créer/éditer une règle, vérifier son application.
- **COMP-04** · P2 · Enrichissement MPN : lancer un enrichissement, voir le résultat (données complétées), gérer les échecs.

## 7. Import BOM (`/import-bom`) + Revue BOM (`/bom`)
- **BOM-01** · P2 · Importer un fichier BOM (Excel/CSV) → mapping colonnes → prévisualisation → validation. Vérifier le comptage d'items.
- **BOM-02** · P2 🪤 · Fichier BOM **malformé** (colonnes manquantes, lignes vides, accents) → message d'erreur clair, pas de crash.
- **BOM-03** · P2 · Revue BOM éditable (`/bom?revision=`) : éditer un item (quantité, MPN, empreinte), sauvegarder, rouvrir → persistant.
- **BOM-04** · P2 · Empreintes/PnP dans la revue : attribution d'empreinte, « points à vérifier », empreintes PnP → compteurs cohérents avec le dashboard.
- **BOM-05** · P2 · Supprimer une révision/face depuis la fiche carte → snapshot fichier nettoyé.

## 8. Stock cartes (`/stock-cartes`)
- **BSTK-01** · P1 · **Vue groupée par carte** (022) : une ligne par carte au replié (total stock + valeur agrégés), déroulant = détail par révision. Vérifier l'agrégation.
- **BSTK-02** · P1 · **Recherche** réf + nom (insensible casse/accents), le regroupement s'applique au filtré.
- **BSTK-03** · P1 · Éditer les quantités **testées / validées / à débugger** et le **min** d'une révision → barre SUIVI + valeur mises à jour ; le dashboard « à débugger » suit.
- **BSTK-04** · P1 🪤 · Révisions à libellés hétérogènes (`REV_A` / `A` / `—`) → affichage normalisé (018), pas de doublon incohérent.
- **BSTK-05** · P1 🪤 · Prix/carte renseigné vs absent → **valeur stock** calculée quand prix, « — € » sinon.

## 9. Stock composants (`/stock`)
- **STK-01** · P1 · Liste du stock composants ; recherche ; niveaux.
- **STK-02** · P1 · Mouvement de stock (entrée/sortie/ajustement) → quantité mise à jour, mouvement journalisé.
- **STK-03** · P1 · Paramètres de stock (seuils/settings) → pris en compte (alertes).
- **STK-04** · P1 🪤 · Composant sous le seuil → alerte cohérente.

## 10. Machine PnP (`/machine-pnp`)
- **PNP-01** · P2 · Onglet **Séquence** : ordre de placement, réordonnancement, sauvegarde.
- **PNP-02** · P2 · Onglet **Feeders** : CRUD feeders, feeders fixes, association composant↔feeder.
- **PNP-03** · P2 · Onglet **Chariots** : CRUD chariots, slots/pins, affectations.
- **PNP-04** · P2 · **Chargement machine** (MachineLoadPanel) : charger une prod sur une machine, vérifier feeders/placements requis.
- **PNP-05** · P2 · Placements manuels : ajouter/éditer un placement manuel.
- **PNP-06** · P2 🪤 · Feature flag `machinePnpPlan` ON vs OFF (legacy) → les deux rendus fonctionnent sans crash.

## 11. Commande composant / achats (`/commande-composant`)
- **CMD-01** · P3 · Créer une commande (interne) à partir d'une production/BOM → lignes générées (quantités par référence).
- **CMD-02** · P3 · **Offres fournisseurs** : saisir/comparer des offres, choisir un fournisseur.
- **CMD-03** · P3 · **Réceptions** : réceptionner tout/partiel → quantités reçues, statut mis à jour (StockStatusChip).
- **CMD-04** · P3 · Détails de ligne (CommandLineDetail) : éditer, cohérence avec la réception.
- **CMD-05** · P3 🪤 · **Import de commande** (PDF) : matching par **code KELENN** (part_number) → lignes rapprochées ; cas non-matché signalé.

## 12. Commande client / livraisons (`/commande-client`)
- **CLI-01** · P3 · Créer une commande client type **CLIENT** (cartes) → lignes, quantités, préparation.
- **CLI-02** · P3 · Créer une commande client type **MACHINE** (modèle machine + nb) → cartes tirées via la nomenclature machine.
- **CLI-03** · P3 · **Préparer** (quantity_prepared) puis **Livrer** (DELIVERED, delivered_at) → statuts et dates corrects.
- **CLI-04** · P3 🪤 · Commande **livrée** liée à une carte → la carte ne se supprime pas sans message clair (lien commande client) (cf. CARD-07).
- **CLI-05** · P3 · Import de commande client (order_import) si applicable.

## 13. Prix carte / Costing (`/prix-carte`)
- **COST-01** · P3 · Paramètres de coût (CostParameter) : éditer, sauvegarder.
- **COST-02** · P3 · Costing d'une production : calcul du coût (composants + main d'œuvre) → total cohérent.
- **COST-03** · P3 · Costing de **référence** (is_reference) → prix/carte propagé au stock (valeur stock) et au dashboard.
- **COST-04** · P3 🪤 · Production sans prix composant → coût partiel signalé, pas de division par zéro.

## 14. Paramètres (`/parametre`) & Défauts ERP (`/parametre-erp`)
- **SET-01** · P2 · Paramètres poste (WorkstationSetting) : modifier, persistant.
- **SET-02** · P2 🪤 · **Chemin du dossier projets configurable** (pas en dur) : changer le chemin → l'import catalogue le prend en compte (rester lecture seule).
- **SET-03** · P2 · Feature flags (ex. `machinePnpPlan`) : bascule → effet immédiat sur l'écran concerné.
- **ERP-01** · P3 · Défauts ERP : éditer les valeurs par défaut → utilisées dans commandes/costing.

## 15. Cas transverses & jeu de données piégé 🪤
Ces scénarios exploitent le **jeu piégé** (cf. le seed) — des données volontairement « vicieuses » reproduisant les bugs déjà rencontrés :
- **TRAP-01** · Carte **legacy sans nom** (ex. `AMPLI_GEN6_*`) : affichage lisible, éditable, supprimable selon liens.
- **TRAP-02** · **Lignes orphelines** (COMMAND_ITEMS / CLIENT_ORDER_LINES dont le parent a été supprimé) → **ne bloquent plus** la suppression de carte (023).
- **TRAP-03** · Carte à **beaucoup de révisions** (A→G, TOP/BOT) → fiche + stock cartes restent lisibles/performants.
- **TRAP-04** · **Accents & casse** dans recherches (référence/nom) → résultats corrects.
- **TRAP-05** · **Gros volume** (centaines de cartes/lignes) → pas de lag bloquant, pagination/filtre OK.
- **TRAP-06** · **Concurrence / présence** (marketplace_presence, events) : deux sessions → pas d'écrasement silencieux.
- **TRAP-07** · **Valeurs limites** : quantités 0 / négatives refusées, champs vides, très longues chaînes.
- **TRAP-08** · **Idempotence** des imports (catalogue 011, BOM) : relancer ne duplique pas.
- **TRAP-09** · **Suppression en cascade** (production, carte) : aucun orphelin en base (vérif SQL post-suppression).

---

## Boucle d'amélioration
1. L'agent exécute le catalogue sur staging → **rapport** (pass/fail + bugs).
2. Chaque bug confirmé → **prompt de correction** auto-rédigé dans `docs/prompts/1-a-faire/` (numéroté, template standard).
3. Après correction, le bug devient un **test E2E scripté bloquant** (Playwright) : trouvé une fois, verrouillé pour toujours.
4. Le catalogue s'enrichit à chaque nouveau bug/fonctionnalité.
