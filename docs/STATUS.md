# Etat Actuel et Audit

## Perimetre audite

- backend FastAPI
- frontend React
- shell Electron
- scripts de developpement
- documentation active

## Validations executees

Resultats verifies pendant cette passe:

- backend: `149` tests passants
- frontend: `14` suites / `35` tests passants
- build frontend: OK
- build desktop Electron (`--dir`): OK

Points encore visibles:

- le packaging desktop utilise encore l icone Electron par defaut

## Correctifs et refactors appliques

### Backend

- correction du flux BOM pour ne plus echouer apres une mutation deja committee a cause d un snapshot disque
- correction des routes marketplace pour ne plus transformer certains `404` en `500`
- correction de l update de commande avec validation et persistance atomique
- correction du reporting top components pour agreger par composant logique
- extraction des helpers BOM dans `src/backend/routes/bom_support.py`
- decoupage du routeur BOM en `bom_components.py`, `bom_files.py` et `bom_revisions.py`
- decoupage de `bom_revisions.py` en `bom_revision_imports.py`, `bom_revision_queries.py` et `bom_revision_mutations.py`
- extraction des schemas marketplace dans `src/backend/schemas/marketplace.py`
- decoupage du routeur marketplace en sous-routeurs par domaine
- decoupage de `marketplace_commands.py` en `marketplace_command_core.py` et `marketplace_command_plans.py`
- extraction des helpers assignment dans `src/backend/services/assignment_helpers.py`
- decoupage des fixed feeders et du planning machine dans `assignment_fixed_feeders.py` et `assignment_planning.py`

### Frontend

- hydratation des selections BOM rendue parallele
- correction du choix de `result` cote import quand la revision selectionnee est introuvable
- normalisation du statut stock legacy dans l UI
- extraction du preview import dans `src/frontend/src/components/import/BomImportPreviewCard.jsx`
- ajout des helpers preview dans `src/frontend/src/utils/bomImportPreview.js`
- extraction de la vue machine slot strip dans `src/frontend/src/components/machine/MachinePnpSlotStrip.jsx`
- extraction des dialogues annexes machine dans `src/frontend/src/components/machine/MachinePnpDialogs.jsx`

### Desktop et scripts

- version desktop non figee dans le shell Electron
- scripts `start-dev-stack.ps1` et `stop-dev-stack.ps1` fiabilises

### Documentation

- `README.md` simplifie et resserre
- `docs/INDEX.md` compactee
- guides actifs reecrits en version courte
- rapport d audit remis a jour

## Ce qui est bien fait

- le coeur produit est reel et couvre deja les flux BOM, production, commande et machine
- la base backend est serieuse avec une couverture de tests utile
- le decoupage par couches existe deja: models, services, routes, frontend, desktop
- l application desktop compile et reste utilisable comme shell Windows

## Ce qui est moins bien fait

- certains fichiers restent encore trop volumineux
- la couverture frontend reste trop faible sur les vraies pages metier
- il n y a pas encore de client API frontend vraiment centralise
- la validation automatique cible surtout SQLite, pas encore assez SQL Server
- le projet n est pas initialise comme depot Git dans ce workspace

## Dette technique principale

Hotspots encore denses:

- `src/backend/services/assignment_fixed_feeders.py`
- `src/backend/services/assignment_planning.py`
- `src/backend/routes/bom_revision_mutations.py`
- `src/frontend/src/components/BomImport.jsx`
- `src/frontend/src/pages/MachinePnpPage.jsx`

Effets:

- lecture plus lente
- maintenance plus risquee
- refactors transverses plus couteux qu ils ne devraient l etre

## Ce qui est fait fonctionnellement

Le projet permet deja de:

- importer des BOM texte
- parser et harmoniser des valeurs et footprints
- resoudre des composants et empreintes manquants
- stocker des revisions BOM harmonisees
- creer des productions et y rattacher des revisions BOM
- calculer un besoin composants avec validation stock
- generer une commande et exporter un fichier ERP
- gerer machines, feeders, chariots et feeders fixes
- visualiser des rapports synthetiques

## Ce qu il reste a faire

### Priorite haute

- poursuivre le decoupage des derniers gros modules
- documenter proprement le deploiement SQL Server
- ajouter lint et pipeline CI

### Priorite moyenne

- augmenter les tests frontend sur les parcours critiques
- mieux isoler la logique desktop de la logique web
- formaliser davantage les regles metier d harmonisation

### Priorite basse

- branding desktop final
- optimisation plus poussee du packaging
- eventuelle internationalisation

## Resume actuel

L application est deja utilisable sur ses flux principaux et elle est objectivement plus maintenable qu avant cette passe. La faiblesse principale n est plus l absence de fonctionnalites, mais la dette de structure restante sur quelques gros modules et le manque d industrialisation autour du frontend, de SQL Server et de la CI.
