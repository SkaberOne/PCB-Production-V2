"""Helpers for canonical component feeder type codes."""

import re
from typing import Optional


SUPPORTED_COMPONENT_FEEDER_TYPES = (
    "CL8-4",
    "CL12",
    "CL16",
    "CL24",
    "CL32",
    "CL44",
    "CL56",
)

COMPONENT_FEEDER_TYPE_TO_SIZE_MM = {
    "CL8-4": 8,
    "CL12": 12,
    "CL16": 16,
    "CL24": 24,
    "CL32": 32,
    "CL44": 44,
    "CL56": 56,
}

SIZE_MM_TO_COMPONENT_FEEDER_TYPE = {
    size_mm: feeder_type
    for feeder_type, size_mm in COMPONENT_FEEDER_TYPE_TO_SIZE_MM.items()
}

FEEDER_TYPE_ALIAS_MAP = {
    "8": "CL8-4",
    "8MM": "CL8-4",
    "CL8": "CL8-4",
    "CL8-4": "CL8-4",
    "12": "CL12",
    "12MM": "CL12",
    "CL12": "CL12",
    "16": "CL16",
    "16MM": "CL16",
    "CL16": "CL16",
    "24": "CL24",
    "24MM": "CL24",
    "CL24": "CL24",
    "32": "CL32",
    "32MM": "CL32",
    "CL32": "CL32",
    "44": "CL44",
    "44MM": "CL44",
    "CL44": "CL44",
    "56": "CL56",
    "56MM": "CL56",
    "CL56": "CL56",
}

FEEDER_SIZE_PATTERN = re.compile(r"(\d+)")


def _normalize_lookup_token(value: Optional[str]) -> Optional[str]:
    text = (value or "").strip().upper()
    if not text:
        return None
    return re.sub(r"\s+", "", text)


def normalize_component_feeder_type(value: Optional[str]) -> Optional[str]:
    """Normalize feeder labels like 8mm / 12 mm to the canonical CL* codes."""
    cleaned = (value or "").strip()
    if not cleaned:
        return None

    lookup_token = _normalize_lookup_token(cleaned)
    canonical_value = FEEDER_TYPE_ALIAS_MAP.get(lookup_token)
    if canonical_value:
        return canonical_value

    return cleaned.upper() if cleaned.upper().startswith("CL") else cleaned


def feeder_type_from_size_mm(size_mm: Optional[int]) -> Optional[str]:
    """Convert a feeder width in millimeters to the preferred CL* label."""
    if size_mm is None:
        return None

    try:
        normalized_size = int(size_mm)
    except (TypeError, ValueError):
        return None

    return SIZE_MM_TO_COMPONENT_FEEDER_TYPE.get(normalized_size, f"CL{normalized_size}")


def extract_component_feeder_size_mm(feeder_type: Optional[str]) -> Optional[int]:
    """Extract the feeder width from a canonical or legacy feeder label."""
    normalized_value = normalize_component_feeder_type(feeder_type)
    if normalized_value in COMPONENT_FEEDER_TYPE_TO_SIZE_MM:
        return COMPONENT_FEEDER_TYPE_TO_SIZE_MM[normalized_value]

    lookup_token = _normalize_lookup_token(feeder_type)
    match = FEEDER_SIZE_PATTERN.search(lookup_token or "")
    return int(match.group(1)) if match else None
