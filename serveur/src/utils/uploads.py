"""Helpers pour les imports de fichiers — limite de taille (écart D9).

Remplace les ``await file.read()`` non bornés (qui chargeaient tout le fichier
en RAM) par une lecture par blocs avec plafond, levant HTTP 413 au-delà.
"""

from typing import Optional

from fastapi import HTTPException, UploadFile, status

from ..config import settings

_CHUNK = 1024 * 1024  # 1 Mo


async def read_upload_capped(file: UploadFile, max_bytes: Optional[int] = None) -> bytes:
    """Lit un ``UploadFile`` en mémoire avec un plafond de taille.

    Lit par blocs et s'arrête dès le dépassement (pas de chargement complet
    avant contrôle). Lève ``413 Request Entity Too Large`` si le fichier excède
    ``settings.max_upload_mb``.
    """
    if max_bytes is None:
        max_bytes = settings.max_upload_mb * 1024 * 1024

    chunks = []
    total = 0
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Fichier trop volumineux (limite : {settings.max_upload_mb} Mo).",
            )
        chunks.append(chunk)
    return b"".join(chunks)
