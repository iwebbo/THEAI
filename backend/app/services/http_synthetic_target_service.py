"""Service des cibles HTTP synthetic : résolution d'URL, exécution d'un check, persistance.

Le moteur de check (HttpSyntheticService) n'est PAS modifié : ce module ne fait que
lire la configuration d'une cible, appeler run_check(), puis stocker le résultat
dans http_synthetic_checks (avec target_id) et mettre à jour l'état de la cible.
"""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from models.http_synthetic import HttpSyntheticCheck
from models.http_synthetic_target import HttpSyntheticTarget
from models.server import Server
from services.http_synthetic_service import HttpSyntheticService


def url_from_server(server: Server) -> str:
    https = bool(server.use_https)
    scheme = "https" if https else "http"
    default = 443 if https else 80
    port = server.http_port
    netloc = server.hostname if port in (None, default) else f"{server.hostname}:{port}"
    return f"{scheme}://{netloc}{server.http_path or '/'}"


@dataclass(frozen=True)
class CheckParams:
    """Paramètres d'un check, extraits de la cible (pas d'objet ORM : utilisable hors session)."""
    target_id: int
    server_id: Optional[int]
    url: str
    method: str
    timeout: int
    verify_tls: bool
    follow_redirects: bool
    probe_protocols: bool


def resolve_params(db: Session, target: HttpSyntheticTarget) -> CheckParams:
    """URL explicite prioritaire, sinon déduite du serveur lié. ValueError si impossible."""
    url = target.url
    if not url:
        server = db.query(Server).filter(Server.id == target.server_id).first() if target.server_id else None
        if server is None:
            raise ValueError("Serveur lié introuvable : impossible de déduire l'URL")
        url = url_from_server(server)
    return CheckParams(
        target_id=target.id, server_id=target.server_id, url=url, method=target.method,
        timeout=target.timeout, verify_tls=target.verify_tls,
        follow_redirects=target.follow_redirects, probe_protocols=target.probe_protocols,
    )


async def run_params(p: CheckParams) -> Dict[str, Any]:
    """Exécute le check (aucun accès DB). Lève ValueError si l'URL est invalide."""
    return await HttpSyntheticService.run_check(
        p.url, timeout=p.timeout, verify_tls=p.verify_tls,
        follow_redirects=p.follow_redirects, probe_protocols=p.probe_protocols, method=p.method,
    )


def store_result(db: Session, target: HttpSyntheticTarget, data: Dict[str, Any]) -> HttpSyntheticCheck:
    """Insère le check (target_id renseigné) et met à jour l'état de la cible. Commit fait par l'appelant."""
    row = HttpSyntheticCheck(target_id=target.id, server_id=target.server_id, **data)
    db.add(row)

    old = target.status
    new = data["status"]
    target.status = new
    target.last_checked_at = datetime.now(timezone.utc)
    target.last_total_ms = data.get("total_ms")
    target.last_error = data.get("error")
    if old != new:
        target.last_status_change = target.last_checked_at
    return row


def store_failure(db: Session, target: HttpSyntheticTarget, error: str) -> None:
    """Cible non exécutable (URL invalide, serveur supprimé) : état offline, pas de ligne de check."""
    old = target.status
    target.status = "offline"
    target.last_checked_at = datetime.now(timezone.utc)
    target.last_total_ms = None
    target.last_error = error[:1000]
    if old != "offline":
        target.last_status_change = target.last_checked_at


async def check_target(db: Session, target: HttpSyntheticTarget) -> HttpSyntheticCheck:
    """Check complet d'une cible (utilisé par l'API). ValueError si non exécutable. Commit par l'appelant."""
    data = await run_params(resolve_params(db, target))
    return store_result(db, target, data)


def is_due(target: HttpSyntheticTarget, now: datetime) -> bool:
    last = target.last_checked_at
    if last is None:
        return True
    if last.tzinfo is None:  # défensif : valeur naïve = UTC
        last = last.replace(tzinfo=timezone.utc)
    return (now - last).total_seconds() >= target.interval_seconds


def find_existing(db: Session, *, url: Optional[str], server_id: Optional[int], method: str) -> Optional[HttpSyntheticTarget]:
    # `== None` -> IS NULL côté SQL : correspond à l'index d'unicité (coalesce)
    return (db.query(HttpSyntheticTarget)
            .filter(HttpSyntheticTarget.url == url,
                    HttpSyntheticTarget.server_id == server_id,
                    HttpSyntheticTarget.method == method)
            .first())


MAX_CONCURRENCY = 10


async def run_many(db: Session, targets: List[HttpSyntheticTarget],
                   concurrency: int = MAX_CONCURRENCY
                   ) -> List[Tuple[HttpSyntheticTarget, Optional[HttpSyntheticCheck], Optional[str]]]:
    """Checke plusieurs cibles en parallèle (borné), puis persiste séquentiellement.

    Une cible en erreur ne casse pas les autres : (cible, None, message) et état offline.
    Flush fait (ids disponibles), commit à la charge de l'appelant.
    """
    sem = asyncio.Semaphore(concurrency)

    async def _one(target):
        try:
            params = resolve_params(db, target)  # lecture DB synchrone, avant tout await
        except ValueError as e:
            return target, None, str(e)
        async with sem:
            try:
                return target, await run_params(params), None
            except Exception as e:
                return target, None, f"{type(e).__name__}: {e}"

    raw = await asyncio.gather(*(_one(t) for t in targets))

    out = []
    for target, data, err in raw:
        if data is not None:
            out.append((target, store_result(db, target, data), None))
        else:
            store_failure(db, target, err)
            out.append((target, None, err))
    db.flush()
    return out
