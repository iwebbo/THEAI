import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

ENROLL_TTL_HOURS = int(os.getenv("AGENT_ENROLL_TTL_HOURS", "24"))
DEFAULT_INTERVAL = int(os.getenv("AGENT_DEFAULT_INTERVAL", "30"))
METRICS_RETENTION_DAYS = int(os.getenv("AGENT_METRICS_RETENTION_DAYS", "30"))


def utcnow() -> datetime:
    return datetime.utcnow()


def iso(dt: Optional[datetime]) -> Optional[str]:
    """Datetime UTC naïve -> ISO 8601 avec 'Z' (lisible correctement par le navigateur)."""
    return dt.isoformat() + "Z" if dt else None


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_enrollment_token() -> str:
    return "theai_enr_" + secrets.token_urlsafe(24)


def new_api_key() -> str:
    return "theai_ak_" + secrets.token_urlsafe(32)


def enrollment_expiry() -> datetime:
    return utcnow() + timedelta(hours=ENROLL_TTL_HOURS)


def is_fresh(last_seen: Optional[datetime], interval_seconds: int) -> bool:
    """En ligne = dernier heartbeat de moins de 2 intervalles (+ marge réseau de 5 s)."""
    if last_seen is None:
        return False
    return (utcnow() - last_seen).total_seconds() <= 2 * max(interval_seconds, 1) + 5


def osv_ecosystem(family: str, os_id: str, version_id: str, pretty: str) -> Optional[str]:
    """
    Écosystème OSV correspondant à la distribution, ou None si la corrélation n'est pas fiable.
    Volontairement limité aux distributions dont OSV indexe le paquet SOURCE avec les correctifs
    (rétroportages inclus) : Debian, Ubuntu, Alpine. Les dérivés (Mint, Raspbian...) sont exclus
    pour ne pas produire de faux positifs.
    """
    if (family or "").lower() != "linux":
        return None
    os_id = (os_id or "").lower().strip()
    version_id = (version_id or "").strip()

    if os_id == "debian":
        major = version_id.split(".")[0]
        return f"Debian:{major}" if major.isdigit() else None

    if os_id == "ubuntu":
        parts = version_id.split(".")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            base = f"{parts[0]}.{parts[1]}"
            return f"Ubuntu:{base}:LTS" if "LTS" in (pretty or "").upper() else f"Ubuntu:{base}"
        return None

    if os_id == "alpine":
        parts = version_id.split(".")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            return f"Alpine:v{parts[0]}.{parts[1]}"
        return None

    return None
