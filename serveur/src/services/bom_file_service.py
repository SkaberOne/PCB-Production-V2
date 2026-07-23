"""Filesystem helpers for persisted harmonized BOM text files."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Optional

from ..config import settings


class BomFileService:
    """Persist harmonized BOM snapshots on disk using a reference/revision tree."""

    INVALID_PATH_CHARS = re.compile(r'[<>:"/\\|?*]+')

    def __init__(self, storage_root: Optional[str] = None):
        self.storage_root = Path(storage_root or settings.harmonized_bom_folder)
        self.storage_root.mkdir(parents=True, exist_ok=True)

    @classmethod
    def sanitize_segment(cls, value: Optional[str]) -> str:
        """Normalize a path segment while preserving readability.

        Neutralise aussi les segments de traversée (``''``, ``'.'``, ``'..'``)
        qui permettraient de remonter hors de ``storage_root`` (path traversal).
        """
        cleaned = cls.INVALID_PATH_CHARS.sub("_", (value or "").strip())
        if cleaned in ("", ".", ".."):
            return "UNDEFINED"
        return cleaned

    def _assert_within_root(self, path: "Path") -> "Path":
        """Vérifie que ``path`` reste descendant de ``storage_root`` (anti-traversée).

        Défense en profondeur : même si ``sanitize_segment`` neutralise déjà ``..``,
        on refuse toute écriture/suppression/déplacement dont le chemin résolu
        sortirait de la racine de stockage.
        """
        root = self.storage_root.resolve()
        resolved = path.resolve()
        if resolved != root and root not in resolved.parents:
            raise ValueError("Chemin hors du dépôt BOM (traversée refusée).")
        return path

    def get_reference_dir(self, reference: str) -> Path:
        return self.storage_root / self.sanitize_segment(reference)

    def get_revision_dir(self, reference: str, revision: str) -> Path:
        return self.get_reference_dir(reference) / self.sanitize_segment(revision)

    def get_file_path(self, reference: str, revision: str, side: str) -> Path:
        file_name = f"{self.sanitize_segment(reference)}_{self.sanitize_segment(side).upper()}.txt"
        return self.get_revision_dir(reference, revision) / file_name

    @staticmethod
    def _clean_numeric(value) -> str:
        if value is None:
            return ""

        if isinstance(value, float):
            text = f"{value:.6f}".rstrip("0").rstrip(".")
            return text or "0"

        return str(value)

    def build_harmonized_content(self, items: Iterable, default_side: Optional[str] = None) -> str:
        """Serialize BOM items to the text format accepted by the existing parser."""
        normalized_lines = []

        def item_reference(item):
            if hasattr(item, "reference_item"):
                return item.reference_item or ""
            return item.get("reference") or item.get("reference_item") or ""

        sorted_items = sorted(items, key=lambda entry: item_reference(entry))

        for item in sorted_items:
            if hasattr(item, "reference_item"):
                reference = item.reference_item or ""
                value = item.value_harmonized or item.value_raw or ""
                footprint = item.footprint_pnp or item.footprint_eagle or ""
                x_value = item.x
                y_value = item.y
                rotation = item.rotation
                side = item.placement_side or default_side or ""
                dnp = bool(item.dnp)
            else:
                reference = item.get("reference") or item.get("reference_item") or ""
                value = item.get("value_harmonized") or item.get("value_raw") or ""
                footprint = item.get("footprint_pnp") or item.get("footprint_eagle") or ""
                x_value = item.get("x")
                y_value = item.get("y")
                rotation = item.get("rotation")
                side = item.get("placement_side") or item.get("type") or default_side or ""
                dnp = bool(item.get("dnp"))

            line_parts = [
                reference,
                value,
                footprint,
                self._clean_numeric(x_value),
                self._clean_numeric(y_value),
                self._clean_numeric(rotation),
                str(side).upper(),
            ]
            if dnp:
                line_parts.append("DNP")

            normalized_lines.append(" ".join(line_parts).rstrip())

        return "\n".join(normalized_lines)

    def save_revision_snapshot(self, reference: str, revision: str, side: str, items: Iterable) -> Path:
        """Write the harmonized BOM snapshot to disk and return its path."""
        target_path = self.get_file_path(reference, revision, side)
        self._assert_within_root(target_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(
            self.build_harmonized_content(items, default_side=side),
            encoding="utf-8",
        )
        return target_path

    def delete_revision_snapshot(self, reference: str, revision: str, side: str) -> None:
        """Delete the stored text snapshot for a revision if it exists."""
        target_path = self.get_file_path(reference, revision, side)
        self._assert_within_root(target_path)
        if target_path.exists():
            try:
                target_path.unlink()
            except FileNotFoundError:
                pass
            except PermissionError as e:
                raise PermissionError(f"Permission denied when deleting {target_path}: {e}")
            except Exception as e:
                raise IOError(f"Failed to delete {target_path}: {e}")

        self.cleanup_empty_dirs(reference, revision)

    def rename_reference_tree(self, old_reference: str, new_reference: str) -> None:
        """Rename a full reference folder when the PCB reference changes."""
        old_dir = self.get_reference_dir(old_reference)
        new_dir = self.get_reference_dir(new_reference)
        self._assert_within_root(old_dir)
        self._assert_within_root(new_dir)

        if old_dir == new_dir or not old_dir.exists():
            return

        new_dir.parent.mkdir(parents=True, exist_ok=True)
        old_dir.rename(new_dir)

    def rename_revision_tree(self, reference: str, old_revision: str, new_revision: str) -> None:
        """Rename a revision subfolder while preserving the reference folder."""
        old_dir = self.get_revision_dir(reference, old_revision)
        new_dir = self.get_revision_dir(reference, new_revision)
        self._assert_within_root(old_dir)
        self._assert_within_root(new_dir)

        if old_dir == new_dir or not old_dir.exists():
            return

        new_dir.parent.mkdir(parents=True, exist_ok=True)
        old_dir.rename(new_dir)

    def cleanup_empty_dirs(self, reference: str, revision: Optional[str] = None) -> None:
        """Remove empty revision/reference folders left after deletes."""
        if revision:
            revision_dir = self.get_revision_dir(reference, revision)
            if revision_dir.exists() and not any(revision_dir.iterdir()):
                revision_dir.rmdir()

        reference_dir = self.get_reference_dir(reference)
        if reference_dir.exists() and not any(reference_dir.iterdir()):
            reference_dir.rmdir()
