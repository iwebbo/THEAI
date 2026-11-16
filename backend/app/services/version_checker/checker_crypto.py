"""Chiffrement au repos des secrets (token, mot de passe) des cibles.

Fernet (AES-128-CBC + HMAC-SHA256, bibliothèque `cryptography` déjà utilisée par THEAI).
Clé : VERSION_CHECKER_ENCRYPTION_KEY, à défaut SECRET_KEY, dérivée par HKDF-SHA256.
ATTENTION : changer la clé rend les secrets existants illisibles (ils doivent être ressaisis)."""
from __future__ import annotations

import base64
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .checker_config import load_settings

PREFIX = "v1:"


class SecretStorageError(Exception):
    """Aucune clé de chiffrement configurée : on refuse de stocker un secret en clair."""


class SecretUnreadable(Exception):
    """Secret chiffré avec une autre clé (clé modifiée) ou corrompu."""


def _fernet(key_material: Optional[str] = None) -> Fernet:
    material = key_material if key_material is not None else load_settings().encryption_key
    if not material:
        raise SecretStorageError(
            "Aucune clé de chiffrement : définir VERSION_CHECKER_ENCRYPTION_KEY (ou SECRET_KEY) "
            "pour enregistrer un token ou un mot de passe.")
    derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                   info=b"theai-version-checker-v1").derive(material.encode("utf-8"))
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_secret(value: str) -> str:
    return PREFIX + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(stored: str) -> str:
    if not stored.startswith(PREFIX):
        raise SecretUnreadable("format de secret inconnu")
    try:
        return _fernet().decrypt(stored[len(PREFIX):].encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise SecretUnreadable("secret illisible (clé de chiffrement modifiée ?)") from exc
    except SecretStorageError:
        raise SecretUnreadable("clé de chiffrement absente : secret illisible")
