# Audit Application - 2026-03-26

## Resume

Application FastAPI + React + Electron deja exploitable sur le flux BOM principal, avec un socle metier solide et une dette de structure en nette baisse apres cette passe de refactorisation.

Etat revalide:

- backend: `149` tests OK
- frontend: `35` tests OK
- frontend build: OK
- desktop build `--dir`: OK
- frontend coverage mesuree: environ `14%` des lignes

## Corrections faites pendant cette intervention

- operation de suppression BOM rendue tolerante aux erreurs de nettoyage snapshot disque
- operations BOM ajustees pour ne plus faire echouer une mutation deja committee a cause d un snapshot disque
- update de commande rendue validee et atomique
- reporting top components corrige pour agreger par composant logique
- listage des productions redevenu en lecture seule
- hydratation frontend des selections BOM rendue parallele
- correction du choix de `result` cote frontend quand la premiere revision selectionnee est introuvable
- documentation active reecrite et compactee
- scripts dev renforces avec un fichier d etat des shells lances

## Refactorisation structurelle finale

Hotspots reduits pendant cette passe:

- `src/backend/routes/bom.py`
  - transforme en assembleur mince, avec decoupage vers `src/backend/routes/bom_components.py`, `src/backend/routes/bom_files.py` et `src/backend/routes/bom_revisions.py`
- `src/backend/routes/bom_revisions.py`
  - reduit a un assembleur de revisions, avec decoupage vers `src/backend/routes/bom_revision_imports.py`, `src/backend/routes/bom_revision_queries.py` et `src/backend/routes/bom_revision_mutations.py`
- `src/backend/routes/marketplace.py`
  - transforme en assembleur mince, avec schemas dans `src/backend/schemas/marketplace.py` et endpoints deplaces vers `marketplace_commands.py`, `marketplace_productions.py`, `marketplace_machines.py` et `marketplace_inventory.py`
- `src/backend/routes/marketplace_commands.py`
  - reduit a un assembleur de commande, avec decoupage vers `src/backend/routes/marketplace_command_core.py` et `src/backend/routes/marketplace_command_plans.py`
- `src/backend/services/assignment_service.py`
  - reduit a un orchestrateur, avec helpers purs dans `src/backend/services/assignment_helpers.py` et decoupage metier vers `src/backend/services/assignment_fixed_feeders.py` et `src/backend/services/assignment_planning.py`
- `src/frontend/src/components/BomImport.jsx`
  - preview et statuts de revue deplaces dans `src/frontend/src/components/import/BomImportPreviewCard.jsx`, `src/frontend/src/components/import/BomImportOverviewPanel.jsx` et `src/frontend/src/utils/bomImportPreview.js`
- `src/frontend/src/pages/MachinePnpPage.jsx`
  - logique de presentation et vue slot deplacees dans `src/frontend/src/utils/machinePnp.js`, `src/frontend/src/components/machine/MachinePnpSlotStrip.jsx` et `src/frontend/src/components/machine/MachinePnpDialogs.jsx`

## Ce qui est bien fait

- backend deja bien teste sur le flux SQLite local
- separation models / services / routes deja presente
- frontend avec un contexte BOM utile et plusieurs utilitaires testes
- Electron gere un fallback propre si le renderer n est pas disponible
- le produit couvre deja les grands modules attendus: BOM, production, commande, machine, desktop

## Ce qui reste fragile ou incomplet

- certains fichiers restent encore trop denses:
  - `src/backend/services/assignment_fixed_feeders.py`
  - `src/backend/services/assignment_planning.py`
  - `src/backend/routes/bom_revision_mutations.py`
  - `src/frontend/src/components/BomImport.jsx`
  - `src/frontend/src/pages/MachinePnpPage.jsx`
- la couverture frontend reste trop faible sur les pages reelles
- il n y a pas encore de client API frontend centralise
- la validation automatique cible surtout SQLite, pas encore SQL Server
- le projet n est pas initialise comme depot Git dans ce workspace

## Ce qui a deja ete construit

- import BOM texte et parser tolerant
- harmonisation valeurs / footprints
- sauvegarde et relecture des revisions
- bibliotheque BOM stockee
- productions et rattachement de revisions
- commande composants et export ERP
- module machine PnP / feeders / carts / fixed feeders
- shell desktop Windows via Electron

## Ce qu il reste a faire

1. poursuivre le decoupage des derniers gros modules backend et frontend
2. monter la couverture frontend sur les pages `ImportBomPage`, `BomViewerPage`, `CommandPage`, `MachinePnpPage`
3. fiabiliser la cible SQL Server avec tests et procedure de migration claire
4. formaliser le packaging desktop et la release
5. clarifier la strategie Electron si des IPC metier doivent etre exposes plus tard

## Conclusion

Le produit n est pas encore fini, mais il est deja bien au-dela du prototype. Le coeur BOM est present, le socle de production est la, et l application est maintenant plus lisible et plus simple a faire evoluer. Le prochain gain de qualite viendra surtout de la poursuite du decoupage, de l augmentation des tests frontend et de l industrialisation du deploiement.
