# Plan De Developpement - Etat Reel

## Deja fait

- shell Electron fonctionnel
- backend FastAPI riche en endpoints BOM et marketplace
- stockage BOM en base et snapshots texte
- pages Dashboard, Import BOM, Fichier BOM, BOM, Commande, Machine PnP, Parametre
- workspace de session BOM scope par production
- tests backend nombreux
- tests frontend utilitaires et contexte

## En cours de consolidation

- reduction de la taille des fichiers les plus massifs
- hausse de la couverture frontend sur les pages reelles
- clarification du pipeline desktop
- clarification de la doc et du perimetre produit

## Prochaines priorites

1. decouper les gros fichiers backend/frontend
2. ajouter des tests d integration frontend sur les pages critiques
3. fiabiliser SQL Server cible et la strategie de migration
4. formaliser le packaging/release desktop
5. nettoyer la dette UX sur le module Machine PnP
