# BOM Format

Format de référence attendu par le parseur texte.

## Colonnes

```text
Reference Value Footprint X Y Rotation Type [DNP]
```

## Règles

- `Reference` : désignateur (`R1`, `C10`, `IC3`, etc.)
- `Value` : valeur brute, peut contenir des espaces
- `Footprint` : empreinte Eagle source
- `X`, `Y` : coordonnées numériques
- `Rotation` : angle entier ou flottant convertible en entier
- `Type` : `T`, `TOP`, `B` ou `BOT`
- `DNP` : marqueur optionnel en fin de ligne

## Encodages acceptés

- UTF-8
- Latin-1

## Exemples valides

```text
R1 10R 0805 10.0 20.0 0 TOP
C12 100nF 0603 11.2 19.8 90 BOT
IC3 REGULATOR SOT223 24.0 15.5 180 TOP DNP
```

## Comportement du parseur

- l'en-tête est toléré
- les lignes vides sont ignorées
- les valeurs contenant `xxx` génèrent un warning
- une face inconnue génère un warning mais n'empêche pas la lecture
