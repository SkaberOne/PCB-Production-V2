"""Helpers for harmonizing raw component values."""

import logging
import re
from typing import Optional, Tuple


logger = logging.getLogger(__name__)


def extract_numeric_and_unit(value: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract the numeric part and trailing unit from a component value.

    Examples:
        "10" -> ("10", None)
        "2.2k" -> ("2.2", "k")
        "100nf" -> ("100", "nf")
    """
    match = re.match(r"^([0-9.]+)(.*)$", value.strip())

    if match:
        numeric = match.group(1)
        unit = match.group(2).strip() if match.group(2) else None
        return numeric, unit

    return value, None


def harmonize_resistor_value(value_raw: str) -> str:
    """
    Harmonize resistor values.

    Rules:
    - numeric only -> add `R`
    - unit suffix -> uppercase it
    - valeur non numérique (NC, DNP, NP...) -> laissée intacte (ne PAS suffixer
      un `R` : sinon `NC` deviendrait `NCR`, `DNP` -> `DNPR`, ce qui casse le
      matching et pollue la base).
    """
    if not value_raw or not isinstance(value_raw, str):
        return value_raw

    value = value_raw.strip()

    # Pas de partie numérique en tête -> ce n'est pas une vraie valeur ohmique
    # (NC, DNP, etc.). On retourne tel quel.
    if not re.match(r"^[0-9.]", value):
        return value

    numeric, unit = extract_numeric_and_unit(value)

    if unit is None or unit == "":
        return f"{numeric}R"

    return f"{numeric}{unit.upper()}"


def harmonize_capacitor_value(value_raw: str) -> str:
    """
    Harmonize capacitor values.

    Rules:
    - `nf` -> `nF`, `uf` -> `uF`, `pf` -> `pF` (uppercase le F final)
    - préfixe nu sans F -> ajoute le F : `100n` -> `100nF`, `1u` -> `1uF`,
      `10p` -> `10pF`. Sans ça, une valeur Eagle écrite « 100n » ne matche
      aucun composant « 100nF » de la bibliothèque (donc aucun feeder).
    """
    if not value_raw or not isinstance(value_raw, str):
        return value_raw

    value = value_raw.strip()
    # 1) Unité avec f minuscule -> F majuscule (100nf -> 100nF).
    value = re.sub(
        r"([0-9.]+\s*[munp])f",
        lambda match: match.group(0)[:-1] + "F",
        value,
        flags=re.IGNORECASE,
    )
    # 2) Préfixe m/u/n/p non suivi d'une lettre/chiffre -> ajoute F (100n -> 100nF).
    #    Le lookahead évite de toucher un F déjà présent (100nF) ou la notation
    #    type « 4n7 » (chiffre après le préfixe).
    value = re.sub(
        r"([0-9.]+\s*[munp])(?![A-Za-z0-9])",
        lambda match: match.group(1) + "F",
        value,
        flags=re.IGNORECASE,
    )
    return value


def validate_harmonized_value(value: str, component_type: str) -> bool:
    """
    Validate a harmonized value against a simple type-specific pattern.
    """
    if not value or not isinstance(value, str):
        return False

    value = value.strip()

    if component_type == "R":
        return bool(re.match(r"^[0-9.]+[RKMrkm]$", value.upper()))

    if component_type == "C":
        return bool(re.match(r"^[0-9.]+\s*[munp]F$", value))

    if component_type == "L":
        return bool(re.match(r"^[0-9.]+\s*[munp]H$", value, re.IGNORECASE))

    return bool(re.match(r"^[0-9.]+\s*[A-Za-z]", value))


def harmonize_value(value_raw: str, component_type: str) -> str:
    """
    Dispatch harmonization according to the component type.
    """
    if not value_raw or not isinstance(value_raw, str):
        return value_raw

    value = value_raw.strip()

    if component_type == "R":
        return harmonize_resistor_value(value)

    if component_type == "C":
        return harmonize_capacitor_value(value)

    return value


def harmonize_bom_items(items: list) -> list:
    """
    Apply harmonization to a list of parsed BOM items.
    """
    harmonized_items = []

    for item in items:
        harmonized_item = item.copy()

        if "value_raw" in item and "component_type" in item:
            harmonized_item["value_harmonized"] = harmonize_value(
                item["value_raw"],
                item["component_type"],
            )

        harmonized_items.append(harmonized_item)

    return harmonized_items
