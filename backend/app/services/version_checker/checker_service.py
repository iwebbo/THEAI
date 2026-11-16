"""Service version checker : orchestration (config -> local -> amont -> comparaison -> base)."""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from models.version_checker import VersionCheck, VersionTarget

from .checker_common import (AHEAD, BEHIND, MAJOR_BEHIND, MINOR_BEHIND, PATCH_BEHIND, STATUS_NOT_CONFIGURED,
                             STATUS_OK, UNKNOWN, UP_TO_DATE, AppConfig, LocalVersion, UpstreamVersion, utcnow)
from .checker_compare import compare
from .checker_config import load_settings
from .checker_crypto import SecretUnreadable, decrypt_secret, encrypt_secret
from .checker_local import check_local
from .checker_registry import APP_TYPES, AppType, get_app_type
from .checker_upstream import UpstreamOptions, fetch_upstream, resolve_channel

logger = logging.getLogger("theai.version_checker")

BEHIND_STATUSES = (PATCH_BEHIND, MINOR_BEHIND, MAJOR_BEHIND, BEHIND)


class TargetError(ValueError):
    """Erreur de validation métier (→ HTTP 400/404/409 côté route)."""


# ----------------------------------------------------------------------------- cibles

def ensure_default_targets(db: Session) -> int:
    """Une cible « non configurée » par type du registre (et par type futur). Idempotent."""
    existing = {t for (t,) in db.query(VersionTarget.app_type).distinct()}
    created = 0
    for key, at in APP_TYPES.items():
        if key not in existing:
            db.add(VersionTarget(app_type=key, name=at.label, channel=None))
            created += 1
    if created:
        db.commit()
    return created


def _validate_channel(at: AppType, channel: Optional[str]) -> Optional[str]:
    if not channel:
        return None
    if not at.upstream.channels:
        raise TargetError(f"{at.key} ne gère pas de canal de version")
    try:
        return resolve_channel(at.upstream, channel)
    except ValueError as exc:
        raise TargetError(str(exc))


def create_target(db: Session, data: dict) -> VersionTarget:
    at = get_app_type(data["app_type"])
    if not at:
        raise TargetError(f"type d'application inconnu : {data['app_type']}")
    name = data.get("name") or at.label
    if db.query(VersionTarget).filter_by(app_type=at.key, name=name).first():
        raise TargetError(f"une cible « {name} » existe déjà pour {at.key}")
    t = VersionTarget(
        app_type=at.key, name=name, url=data.get("url"), username=data.get("username"),
        verify_tls=data.get("verify_tls", True), ca_file=data.get("ca_file"),
        channel=_validate_channel(at, data.get("channel")), enabled=data.get("enabled", True))
    if data.get("password"):
        t.password_enc = encrypt_secret(data["password"])
    if data.get("token"):
        t.token_enc = encrypt_secret(data["token"])
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def update_target(db: Session, t: VersionTarget, data: dict) -> VersionTarget:
    """`data` ne contient que les champs envoyés (model_dump(exclude_unset=True))."""
    at = get_app_type(t.app_type)
    if "name" in data and data["name"] and data["name"] != t.name:
        if db.query(VersionTarget).filter_by(app_type=t.app_type, name=data["name"]).first():
            raise TargetError(f"une cible « {data['name']} » existe déjà pour {t.app_type}")
        t.name = data["name"]
    for f in ("url", "username", "ca_file"):
        if f in data:
            setattr(t, f, data[f] or None)
    for f in ("verify_tls", "enabled"):
        if f in data and data[f] is not None:
            setattr(t, f, data[f])
    if "channel" in data:
        t.channel = _validate_channel(at, data["channel"]) if at else None
    for field, col in (("password", "password_enc"), ("token", "token_enc")):
        if field in data:
            setattr(t, col, encrypt_secret(data[field]) if data[field] else None)
    if "url" in data and not t.url:  # URL effacée -> état remis à zéro
        t.last_local_status = STATUS_NOT_CONFIGURED
        t.installed_version = t.latest_version = t.new_major = t.last_error = None
        t.update_status = UNKNOWN
    db.commit()
    db.refresh(t)
    return t


def delete_target(db: Session, t: VersionTarget) -> None:
    db.delete(t)
    db.commit()


def target_to_dict(t: VersionTarget) -> dict:
    at = get_app_type(t.app_type)
    return {
        "id": t.id, "app_type": t.app_type, "app_label": at.label if at else t.app_type, "name": t.name,
        "url": t.url, "configured": bool(t.url), "username": t.username,
        "has_password": bool(t.password_enc), "has_token": bool(t.token_enc),
        "verify_tls": t.verify_tls, "ca_file": t.ca_file, "channel": t.channel, "enabled": t.enabled,
        "last_checked_at": t.last_checked_at, "last_local_status": t.last_local_status,
        "installed_version": t.installed_version, "latest_version": t.latest_version,
        "update_status": t.update_status, "new_major": t.new_major, "last_error": t.last_error,
        "created_at": t.created_at, "updated_at": t.updated_at,
    }


# ----------------------------------------------------------------------------- contrôle

def _snapshot(t: VersionTarget) -> dict:
    """Copie des champs utiles (la session ne doit pas être tenue pendant les appels réseau)."""
    return {"id": t.id, "app_type": t.app_type, "url": t.url, "username": t.username,
            "password_enc": t.password_enc, "token_enc": t.token_enc, "verify_tls": t.verify_tls,
            "ca_file": t.ca_file, "channel": t.channel}


def _build_config(snap: dict, timeout: float) -> Tuple[Optional[AppConfig], Optional[str]]:
    if not snap["url"]:
        return None, None
    try:
        password = decrypt_secret(snap["password_enc"]) if snap["password_enc"] else None
        token = decrypt_secret(snap["token_enc"]) if snap["token_enc"] else None
    except SecretUnreadable as exc:
        return AppConfig(app=snap["app_type"], url=snap["url"]), str(exc)
    return AppConfig(app=snap["app_type"], url=snap["url"], username=snap["username"], password=password,
                     token=token, verify_tls=snap["verify_tls"], ca_file=snap["ca_file"], timeout=timeout), None


async def _check_snapshot(snap: dict) -> Tuple[LocalVersion, UpstreamVersion, str, Optional[str], Optional[str]]:
    """Réseau uniquement (aucun accès base). Retourne local, amont, statut, cible, nouvelle majeure."""
    st = load_settings()
    at = get_app_type(snap["app_type"])
    cfg, secret_error = _build_config(snap, st.local_timeout)

    if secret_error:
        local = LocalVersion(app=snap["app_type"], url=snap["url"], status="error", error=secret_error)
    else:
        local = await check_local(snap["app_type"], at.local, cfg, at.max_parts)

    opts = UpstreamOptions(github_token=st.github_token, proxmox_suite=st.proxmox_suite,
                           timeout=st.upstream_timeout, ca_file=st.upstream_ca_file, cache_ttl=st.cache_ttl)
    upstream = await fetch_upstream(snap["app_type"], at.upstream, snap["channel"], local.version, opts, at.max_parts)

    if local.status == STATUS_OK and upstream.status == STATUS_OK:
        status, target, new_major = compare(local.version, upstream.latest, upstream.latest_by_major)
    else:
        status, target, new_major = UNKNOWN, upstream.latest, None
    return local, upstream, status, target, new_major


def _persist(db: Session, t: VersionTarget, local: LocalVersion, up: UpstreamVersion,
             status: str, target: Optional[str], new_major: Optional[str]) -> VersionCheck:
    now = utcnow()
    check = VersionCheck(
        target_id=t.id, app_type=t.app_type, checked_at=now,
        local_status=local.status, local_version=local.version, local_raw=(local.raw or None) and local.raw[:200],
        local_error=(local.error or None) and local.error[:500], local_latency_ms=local.latency_ms,
        upstream_status=up.status, upstream_latest=up.latest, upstream_latest_raw=(up.latest_raw or None) and up.latest_raw[:200],
        upstream_by_major={str(k): v for k, v in up.latest_by_major.items()} or None,
        upstream_source=(up.source or None) and up.source[:500], upstream_docs_url=up.docs_url,
        upstream_archived=up.archived, upstream_error=(up.error or None) and up.error[:500],
        upstream_latency_ms=up.latency_ms, channel=up.channel,
        update_status=status, target_version=target, new_major=new_major)
    db.add(check)
    t.last_checked_at = now
    t.last_local_status = local.status
    t.installed_version = local.version
    t.latest_version = target
    t.update_status = status
    t.new_major = new_major
    t.last_error = ((local.error if local.status != STATUS_OK and local.status != STATUS_NOT_CONFIGURED else None)
                    or up.error or None)
    if t.last_error:
        t.last_error = t.last_error[:500]
    db.commit()
    db.refresh(check)
    db.refresh(t)
    return check


async def run_target(db: Session, t: VersionTarget) -> VersionCheck:
    local, up, status, target, new_major = await _check_snapshot(_snapshot(t))
    return _persist(db, t, local, up, status, target, new_major)


async def run_all(db: Session, only_configured: bool = False) -> Tuple[List[Tuple[VersionTarget, VersionCheck]], int]:
    """Contrôle toutes les cibles actives (non configurées comprises : la veille amont reste utile),
    en parallèle borné. Retourne ([(cible, contrôle)], nombre ignoré)."""
    targets = [t for t in db.query(VersionTarget).order_by(VersionTarget.app_type, VersionTarget.name).all()
               if t.enabled and get_app_type(t.app_type) and (t.url or not only_configured)]
    skipped = db.query(VersionTarget).count() - len(targets)
    sem = asyncio.Semaphore(load_settings().concurrency)

    async def one(t: VersionTarget):
        async with sem:
            try:
                return t, await _check_snapshot(_snapshot(t))
            except Exception:  # un échec ne doit pas bloquer les autres
                logger.exception("version check failed for target %s", t.id)
                return t, None

    outcomes = await asyncio.gather(*(one(t) for t in targets))
    results = []
    for t, res in outcomes:  # écriture séquentielle (session non thread-safe)
        if res is None:
            skipped += 1
            continue
        results.append((t, _persist(db, t, *res)))
    return results, skipped


# ----------------------------------------------------------------------------- lecture / purge

def summary(db: Session) -> dict:
    ts = db.query(VersionTarget).filter(VersionTarget.enabled.is_(True)).all()
    configured = [t for t in ts if t.url]
    return {
        "total": len(ts), "configured": len(configured), "not_configured": len(ts) - len(configured),
        "up_to_date": sum(1 for t in configured if t.update_status in (UP_TO_DATE, AHEAD)),
        "behind": sum(1 for t in configured if t.update_status in BEHIND_STATUSES),
        "errors": sum(1 for t in configured if t.last_local_status == "error"),
        "last_checked_at": max((t.last_checked_at for t in ts if t.last_checked_at), default=None),
    }


def purge_history(db: Session, retention_days: Optional[int] = None) -> int:
    days = retention_days if retention_days is not None else load_settings().retention_days
    n = db.query(VersionCheck).filter(VersionCheck.checked_at < utcnow() - timedelta(days=days)).delete()
    db.commit()
    return n
