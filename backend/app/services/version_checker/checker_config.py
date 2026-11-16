"""Réglages optionnels du version checker (variables d'environnement, aucune obligatoire)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name) or default)
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name) or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class CheckerSettings:
    encryption_key: Optional[str]  # VERSION_CHECKER_ENCRYPTION_KEY, à défaut SECRET_KEY
    github_token: Optional[str]  # VERSION_CHECKER_GITHUB_TOKEN : 60 -> 5000 requêtes/h
    local_timeout: float  # VERSION_CHECKER_TIMEOUT (10 s)
    upstream_timeout: float  # VERSION_CHECKER_UPSTREAM_TIMEOUT (15 s)
    cache_ttl: float  # VERSION_CHECKER_CACHE_TTL (3600 s)
    retention_days: int  # VERSION_CHECKER_RETENTION_DAYS (365 j)
    upstream_ca_file: Optional[str]  # VERSION_CHECKER_UPSTREAM_CA_FILE (proxy d'entreprise)
    proxmox_suite: Optional[str]  # VERSION_CHECKER_PROXMOX_SUITE (sinon déduite : 9 -> trixie)
    concurrency: int  # VERSION_CHECKER_CONCURRENCY (10)


def load_settings() -> CheckerSettings:
    return CheckerSettings(
        encryption_key=os.getenv("VERSION_CHECKER_ENCRYPTION_KEY") or os.getenv("SECRET_KEY") or None,
        github_token=os.getenv("VERSION_CHECKER_GITHUB_TOKEN") or None,
        local_timeout=_float("VERSION_CHECKER_TIMEOUT", 10.0),
        upstream_timeout=_float("VERSION_CHECKER_UPSTREAM_TIMEOUT", 15.0),
        cache_ttl=_float("VERSION_CHECKER_CACHE_TTL", 3600.0),
        retention_days=_int("VERSION_CHECKER_RETENTION_DAYS", 365),
        upstream_ca_file=os.getenv("VERSION_CHECKER_UPSTREAM_CA_FILE") or None,
        proxmox_suite=os.getenv("VERSION_CHECKER_PROXMOX_SUITE") or None,
        concurrency=max(1, _int("VERSION_CHECKER_CONCURRENCY", 10)),
    )
