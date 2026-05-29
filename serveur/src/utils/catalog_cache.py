"""In-process TTL cache for read-heavy, rarely-mutated catalog tables.

Cached catalogs
---------------
component_type_rules  — sorted ComponentTypeRuleSnapshot list used by every
                        BOM-item type resolution in _serialize_bom_item().
                        Without the cache, a 200-item BOM triggers 200+
                        DB round-trips just to fetch the same rule rows.

footprint_mappings    — {normalized_eagle: footprint_pnp} dict built once per
                        review/save cycle from the FootprintMapping table.

Each cache entry lives for CATALOG_TTL_SECONDS (default 60 s) and can be
invalidated explicitly after any write to the underlying table.

Thread-safety
-------------
Both get/set/invalidate operations are protected by a threading.Lock so the
cache is safe for the multi-threaded Uvicorn worker model.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CATALOG_TTL_SECONDS: float = 60.0


# ---------------------------------------------------------------------------
# Rule snapshot — a plain-Python immutable copy of ComponentTypeRule fields.
# Cached instead of the SQLAlchemy ORM object to avoid session-binding issues.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ComponentTypeRuleSnapshot:
    """Immutable snapshot of a ComponentTypeRule row, safe to cache across sessions."""

    id: int
    reference_prefix: str
    mapped_type: Optional[str]
    requires_confirmation: bool
    priority: int
    enabled: bool
    description: Optional[str] = None


# ---------------------------------------------------------------------------
# Generic single-value TTL cache
# ---------------------------------------------------------------------------

class _TtlCache:
    """Thread-safe, single-slot TTL cache."""

    def __init__(self, ttl: float = CATALOG_TTL_SECONDS) -> None:
        self._ttl = ttl
        self._value: Any = None
        self._expires_at: float = 0.0
        self._lock = threading.Lock()

    def get(self) -> Any:
        """Return the cached value if still fresh, else None."""
        with self._lock:
            if time.monotonic() < self._expires_at:
                return self._value
            return None

    def set(self, value: Any) -> None:
        """Store a value and reset the TTL countdown."""
        with self._lock:
            self._value = value
            self._expires_at = time.monotonic() + self._ttl

    def invalidate(self) -> None:
        """Expire the cached value immediately."""
        with self._lock:
            self._expires_at = 0.0

    @property
    def is_warm(self) -> bool:
        """True if the cache holds a fresh value."""
        with self._lock:
            return time.monotonic() < self._expires_at


# ---------------------------------------------------------------------------
# Module-level singletons — one per catalog
# ---------------------------------------------------------------------------

#: Sorted list of ComponentTypeRuleSnapshot objects.
component_type_rules_cache: _TtlCache = _TtlCache()

#: Dict mapping normalized_eagle_footprint → footprint_pnp string.
footprint_mapping_cache: _TtlCache = _TtlCache()


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------

def invalidate_component_type_rules() -> None:
    """Expire the ComponentTypeRule cache. Call after any write to that table."""
    component_type_rules_cache.invalidate()


def invalidate_footprint_mappings() -> None:
    """Expire the FootprintMapping cache. Call after any write to that table."""
    footprint_mapping_cache.invalidate()


def invalidate_all() -> None:
    """Expire all catalog caches at once."""
    component_type_rules_cache.invalidate()
    footprint_mapping_cache.invalidate()
