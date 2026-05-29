# Architecture Actuelle

## Blocs techniques

- `src/backend`
  - routes FastAPI
  - services metier
  - models SQLAlchemy
  - migrations Alembic
- `src/frontend`
  - pages React
  - composants MUI
  - contexte de session BOM
  - utilitaires de projection metier
- `src/desktop`
  - shell Electron
  - preload minimal
  - packaging desktop

## Pages

- `Dashboard`: productions et entree principale
- `Import BOM`: import, pre-traitement, rattachement a une production
- `Fichier BOM`: bibliotheque des revisions stockees
- `BOM`: revue detaillee et edition inline
- `Commande Composant`: synthese des besoins composants
- `Machine PnP`: machines, carts, fixed feeders, ordre BOM
- `Parametre`: bibliotheque composants et imports/exports associes

## Flux principal

1. import BOM via backend
2. parser -> harmoniser -> valider -> stocker
3. ouvrir la session de revision
4. sauvegarder la revision harmonisee
5. rattacher les revisions a une production
6. exploiter la production dans Commande et Machine PnP

## Etat frontend

- un contexte central `BomSessionContext` scope les etats par production
- les utilitaires portent une bonne partie de la logique metier cote client
- plusieurs pages restent tres volumineuses et meritent un decoupage

## Etat backend

- les routes `bom.py` et `marketplace.py` portent encore trop de logique
- les services couvrent deja beaucoup de cas metier
- le local est surtout verifie en SQLite
