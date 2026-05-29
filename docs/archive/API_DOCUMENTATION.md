# API Documentation

Statut : resume legacy.

Ce fichier existe pour garder un point de repere humain, mais il ne doit plus etre considere comme la source de verite principale.

## Source de verite recommandee

1. Swagger runtime : `http://localhost:8000/docs`
2. [../specs/API_MARKETPLACE.md](../specs/API_MARKETPLACE.md)
3. Les schemas et routes reels dans `src/backend`

## Ce que contient encore ce fichier

- un rappel des grandes familles d'API du projet
- un historique leger des modules prevus
- un point d'entree si Swagger n'est pas encore lance

## Modules concernes

- BOM
- Marketplace / Commande composants
- PnP / production
- administration de donnees

## Important

Certaines routes mentionnees historiquement ici peuvent etre incompletes, avoir evolue, ou ne plus correspondre exactement au backend courant. Avant toute implementation ou integration, verifie toujours les routes reelles dans Swagger et dans le code.
