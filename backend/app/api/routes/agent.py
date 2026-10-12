from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.deps import get_db
from api.routes.auth import get_current_user
from models.agent import Agent, AgentInventory, AgentMetric
from models.server import Server
from models.user import User
from schemas.agent import EnrollRequest, HeartbeatRequest, InventoryRequest, PortsRequest
from services import agent_service as svc
from services.agent_vulns import VULNS_COUNT_SQL, VULNS_SQL

# Routes appelées par l'agent (authentification : clé API de l'agent, jamais de JWT)
agent_router = APIRouter()
# Routes appelées par l'interface (authentification : JWT utilisateur)
agents_router = APIRouter()

_bearer = HTTPBearer(auto_error=False)


# --------------------------------------------------------------------------------------
# Côté agent
# --------------------------------------------------------------------------------------

def get_agent(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Agent:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid agent credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or not credentials.credentials:
        raise unauthorized
    agent = db.query(Agent).filter(Agent.api_key_hash == svc.sha256_hex(credentials.credentials)).first()
    if agent is None or agent.enrolled_at is None:
        raise unauthorized
    return agent


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "")[:64]


@agent_router.post("/enroll")
def enroll(body: EnrollRequest, request: Request, db: Session = Depends(get_db)):
    """Échange le jeton à usage unique contre une clé API propre au serveur."""
    agent = (
        db.query(Agent)
        .filter(Agent.token_hash == svc.sha256_hex(body.token))
        .with_for_update()
        .first()
    )
    if agent is None or agent.token_expires_at is None or agent.token_expires_at < svc.utcnow():
        raise HTTPException(status_code=401, detail="Invalid or expired enrollment token")

    api_key = svc.new_api_key()
    agent.api_key_hash = svc.sha256_hex(api_key)
    agent.token_hash = None          # usage unique
    agent.token_expires_at = None
    agent.enrolled_at = svc.utcnow()
    agent.last_seen = None
    agent.agent_hostname = body.hostname or None
    agent.os_family = body.os or None
    agent.arch = body.arch or None
    agent.agent_version = body.agent_version or None
    agent.remote_ip = _client_ip(request)
    db.commit()

    return {"api_key": api_key, "server_id": agent.server_id, "interval_seconds": agent.interval_seconds}


@agent_router.post("/heartbeat")
def heartbeat(
    body: HeartbeatRequest,
    request: Request,
    agent: Agent = Depends(get_agent),
    db: Session = Depends(get_db),
):
    now = svc.utcnow()
    disk_pcts = [100.0 * d.used / d.total for d in body.disks if d.total > 0]

    db.add(AgentMetric(
        server_id=agent.server_id,
        ts=now,
        cpu_percent=body.cpu_percent,
        mem_total=body.mem_total,
        mem_used=body.mem_used,
        swap_total=body.swap_total,
        swap_used=body.swap_used,
        load1=body.load1,
        load5=body.load5,
        load15=body.load15,
        uptime_seconds=body.uptime_seconds,
        net_rx_bytes=body.net_rx_bytes,
        net_tx_bytes=body.net_tx_bytes,
        disk_used_pct=max(disk_pcts) if disk_pcts else None,
        disks=[d.model_dump() for d in body.disks],
    ))
    agent.last_seen = now
    agent.remote_ip = _client_ip(request)
    if body.agent_version:
        agent.agent_version = body.agent_version

    inv = db.get(AgentInventory, agent.server_id)
    need_inventory = inv is None or inv.pkg_hash != body.inventory_hash
    db.commit()

    return {"interval_seconds": agent.interval_seconds, "need_inventory": need_inventory}


@agent_router.post("/inventory")
def inventory(
    body: InventoryRequest,
    agent: Agent = Depends(get_agent),
    db: Session = Depends(get_db),
):
    now = svc.utcnow()
    inv = db.get(AgentInventory, agent.server_id)
    if inv is None:
        inv = AgentInventory(server_id=agent.server_id, ports=[])
        db.add(inv)

    ecosystem = svc.osv_ecosystem(body.os.family, body.os.id, body.os.version_id, body.os.pretty)
    inv.pkg_hash = body.pkg_hash
    inv.os_family = body.os.family or None
    inv.os_id = body.os.id or None
    inv.os_version = body.os.version_id or None
    inv.os_pretty = body.os.pretty or None
    inv.kernel = body.os.kernel or None
    inv.arch = body.os.arch or None
    inv.packages = [p.model_dump() for p in body.packages]
    inv.package_count = len(body.packages)
    inv.collected_at = now
    inv.ecosystem = ecosystem

    # Nouvel inventaire : l'analyse CVE est relancée par la tâche de fond
    # (l'OS non supporté est marqué immédiatement, sans appel externe).
    if ecosystem is None:
        inv.vuln_status = "unsupported"
        inv.vuln_error = "Corrélation CVE non disponible pour cet OS (supporté : Debian, Ubuntu, Alpine)."
        inv.vuln_checked_at = now
        inv.vuln_count = 0
        db.execute(text("DELETE FROM server_vulns WHERE server_id = :sid"), {"sid": agent.server_id})
    else:
        inv.vuln_status = "pending"
        inv.vuln_error = None
        inv.vuln_checked_at = None
    db.commit()
    return {"status": "ok", "packages": inv.package_count}


@agent_router.post("/ports")
def ports(
    body: PortsRequest,
    agent: Agent = Depends(get_agent),
    db: Session = Depends(get_db),
):
    inv = db.get(AgentInventory, agent.server_id)
    if inv is None:
        inv = AgentInventory(server_id=agent.server_id, packages=[])
        db.add(inv)
    inv.ports = [p.model_dump() for p in body.ports]
    inv.ports_updated_at = svc.utcnow()
    db.commit()
    return {"status": "ok", "ports": len(body.ports)}


# --------------------------------------------------------------------------------------
# Côté interface (JWT)
# --------------------------------------------------------------------------------------

def _get_server_or_404(db: Session, server_id: int) -> Server:
    server = db.query(Server).filter(Server.id == server_id).first()
    if server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return server


def _vuln_row(r) -> dict:
    m = r._mapping
    return {
        "server_id": m["server_id"],
        "server_name": m["server_name"],
        "vuln_id": m["vuln_id"],
        "package": m["package"],
        "installed_version": m["installed_version"],
        "osv_id": m["osv_id"],
        "first_seen": svc.iso(m["first_seen"]),
        "kev": bool(m["kev"]),
        "kev_due_date": m["kev_due_date"].isoformat() if m["kev_due_date"] else None,
        "kev_ransomware": bool(m["kev_ransomware"]) if m["kev_ransomware"] is not None else False,
        "epss_score": float(m["epss_score"]) if m["epss_score"] is not None else None,
        "epss_percentile": float(m["epss_percentile"]) if m["epss_percentile"] is not None else None,
        "cvss_base": float(m["cvss_base"]) if m["cvss_base"] is not None else None,
        "severity": m["severity"],
        "description": m["description"],
    }


@agents_router.post("/servers/{server_id}/enrollment")
def create_enrollment(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Génère un jeton d'enrôlement à usage unique (l'agent déjà enrôlé reste valide jusqu'à l'enrôlement suivant)."""
    _get_server_or_404(db, server_id)
    agent = db.query(Agent).filter(Agent.server_id == server_id).first()
    if agent is None:
        agent = Agent(server_id=server_id, interval_seconds=svc.DEFAULT_INTERVAL)
        db.add(agent)

    token = svc.new_enrollment_token()
    agent.token_hash = svc.sha256_hex(token)
    agent.token_expires_at = svc.enrollment_expiry()
    db.commit()
    return {"token": token, "expires_at": svc.iso(agent.token_expires_at)}


@agents_router.delete("/servers/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_agent(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Révoque la clé API et tout jeton en attente."""
    _get_server_or_404(db, server_id)
    agent = db.query(Agent).filter(Agent.server_id == server_id).first()
    if agent is not None:
        agent.api_key_hash = None
        agent.token_hash = None
        agent.token_expires_at = None
        agent.enrolled_at = None
        agent.last_seen = None
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@agents_router.get("/servers/{server_id}")
def agent_status(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_server_or_404(db, server_id)
    agent = db.query(Agent).filter(Agent.server_id == server_id).first()
    if agent is None:
        return {"exists": False, "enrolled": False, "online": False, "pending_token": False}

    enrolled = agent.enrolled_at is not None and agent.api_key_hash is not None
    pending = (
        agent.token_hash is not None
        and agent.token_expires_at is not None
        and agent.token_expires_at > svc.utcnow()
    )
    result = {
        "exists": True,
        "enrolled": enrolled,
        "online": enrolled and svc.is_fresh(agent.last_seen, agent.interval_seconds),
        "pending_token": pending,
        "token_expires_at": svc.iso(agent.token_expires_at) if pending else None,
        "last_seen": svc.iso(agent.last_seen),
        "enrolled_at": svc.iso(agent.enrolled_at),
        "interval_seconds": agent.interval_seconds,
        "agent_version": agent.agent_version,
        "hostname": agent.agent_hostname,
        "os_family": agent.os_family,
        "arch": agent.arch,
        "remote_ip": agent.remote_ip,
        "metrics": None,
        "inventory": None,
        "ports": [],
    }

    m = (
        db.query(AgentMetric)
        .filter(AgentMetric.server_id == server_id)
        .order_by(AgentMetric.ts.desc())
        .first()
    )
    if m is not None:
        result["metrics"] = {
            "ts": svc.iso(m.ts),
            "cpu_percent": m.cpu_percent,
            "mem_total": m.mem_total,
            "mem_used": m.mem_used,
            "mem_percent": (100.0 * m.mem_used / m.mem_total) if m.mem_total else None,
            "swap_total": m.swap_total,
            "swap_used": m.swap_used,
            "load1": m.load1,
            "load5": m.load5,
            "load15": m.load15,
            "uptime_seconds": m.uptime_seconds,
            "net_rx_bytes": m.net_rx_bytes,
            "net_tx_bytes": m.net_tx_bytes,
            "disk_used_pct": m.disk_used_pct,
            "disks": m.disks or [],
        }

    inv = db.get(AgentInventory, server_id)
    if inv is not None:
        result["inventory"] = {
            "os_pretty": inv.os_pretty,
            "os_id": inv.os_id,
            "os_version": inv.os_version,
            "kernel": inv.kernel,
            "arch": inv.arch,
            "package_count": inv.package_count,
            "collected_at": svc.iso(inv.collected_at),
            "ecosystem": inv.ecosystem,
            "vuln_status": inv.vuln_status,
            "vuln_checked_at": svc.iso(inv.vuln_checked_at),
            "vuln_error": inv.vuln_error,
            "vuln_count": inv.vuln_count,
        }
        result["ports"] = inv.ports or []
    return result


@agents_router.get("/servers/{server_id}/metrics")
def agent_metrics(
    server_id: int,
    hours: int = Query(6, ge=1, le=720),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_server_or_404(db, server_id)
    since = svc.utcnow() - timedelta(hours=hours)
    bucket = max(30, (hours * 3600) // 240)  # ~240 points maximum
    rows = db.execute(text("""
        SELECT CAST(floor(extract(epoch FROM ts) / :b) * :b AS bigint) AS bucket_ts,
               avg(cpu_percent) AS cpu,
               avg(100.0 * CAST(mem_used AS double precision) / NULLIF(mem_total, 0)) AS mem,
               max(disk_used_pct) AS disk,
               avg(load1) AS load1
        FROM agent_metrics
        WHERE server_id = :sid AND ts >= :since
        GROUP BY 1
        ORDER BY 1
    """), {"b": bucket, "sid": server_id, "since": since}).fetchall()

    def f(v):
        return round(float(v), 2) if v is not None else None

    return {
        "hours": hours,
        "bucket_seconds": bucket,
        "points": [
            {"t": int(r.bucket_ts) * 1000, "cpu": f(r.cpu), "mem": f(r.mem), "disk": f(r.disk), "load1": f(r.load1)}
            for r in rows
        ],
    }


@agents_router.get("/servers/{server_id}/packages")
def agent_packages(
    server_id: int,
    q: Optional[str] = Query(None, max_length=100),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_server_or_404(db, server_id)
    inv = db.get(AgentInventory, server_id)
    packages = (inv.packages if inv is not None else None) or []
    if q:
        needle = q.lower()
        packages = [p for p in packages if needle in (p.get("name") or "").lower()]
    return {"total": len(packages), "items": packages[:limit]}


@agents_router.post("/servers/{server_id}/vulns/refresh", status_code=status.HTTP_202_ACCEPTED)
def refresh_vulns(
    server_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replanifie l'analyse (prise en charge par la tâche de fond dans les 2 minutes)."""
    _get_server_or_404(db, server_id)
    inv = db.get(AgentInventory, server_id)
    if inv is None or not inv.pkg_hash:
        raise HTTPException(status_code=409, detail="No inventory received from the agent yet")
    if inv.ecosystem is None:
        raise HTTPException(status_code=409, detail=inv.vuln_error or "CVE correlation not supported for this OS")
    inv.vuln_status = "pending"
    inv.vuln_error = None
    inv.vuln_checked_at = None
    db.commit()
    return {"status": "queued"}


def _list_vulns(db: Session, server_id: Optional[int], limit: int, offset: int) -> dict:
    where = "WHERE v.server_id = :sid" if server_id is not None else ""
    params = {"sid": server_id} if server_id is not None else {}

    counts = db.execute(text(VULNS_COUNT_SQL.format(where=where)), params).first()
    rows = db.execute(
        text(VULNS_SQL.format(where=where)),
        {**params, "lim": limit, "off": offset},
    ).fetchall()
    return {
        "total": int(counts.total or 0),
        "kev": int(counts.kev or 0),
        "items": [_vuln_row(r) for r in rows],
    }


@agents_router.get("/servers/{server_id}/vulns")
def server_vulns(
    server_id: int,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0, le=100000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Vulnérabilités d'un serveur, triées KEV > EPSS > CVSS."""
    _get_server_or_404(db, server_id)
    return _list_vulns(db, server_id, limit, offset)


@agents_router.get("/vulns")
def all_vulns(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0, le=100000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """File « à résoudre ASAP » tous serveurs confondus : KEV d'abord, puis EPSS, puis CVSS."""
    return _list_vulns(db, None, limit, offset)
