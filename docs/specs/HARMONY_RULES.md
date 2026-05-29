# Harmony Rules

## Entree attendue

Le parser BOM attend un export texte type Eagle:

- reference
- valeur brute
- footprint Eagle
- X
- Y
- rotation
- side
- optionnellement `DNP`

## Ce qui est harmonise

- normalisation des valeurs de composants
- deduction du type de composant depuis la reference
- normalisation des footprints Eagle pour la recherche
- application des mappings `Eagle -> PnP`

## Priorite des footprints

1. mapping explicite stocke
2. inference depuis la bibliotheque composants
3. revue manuelle si rien n est resolu

## Regles de revue

- un item DNP ne force pas un mapping PnP
- la revue peut sauver de nouveaux mappings
- la revue peut pousser les footprints valides vers la bibliotheque composants
- les revisions harmonisees sont aussi exportees en snapshot texte
