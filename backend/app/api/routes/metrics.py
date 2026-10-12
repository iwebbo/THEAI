from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.deps import get_db
from api.routes.auth import get_current_user
from models.server import Server
from models.user import User

router = APIRouter()


@router.get("/overview")
def metrics_overview(
    hours: int = Query(6, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Données du dashboard : compteurs, disponibilité par serveur et temps de réponse
    sur la période (même source que le dashboard Grafana : server_check_history).
    """
    since = datetime.utcnow() - timedelta(hours=hours)
    bucket = max(60, (hours * 3600) // 120)  # ~120 points par courbe

    servers = db.query(Server).order_by(Server.name).all()

    availability = {}
    for r in db.execute(text("""
        SELECT server_id,
               100.0 * avg(CAST(status = 'online' AS integer)) AS availability,
               count(*) AS checks
        FROM server_check_history
        WHERE checked_at >= :since
        GROUP BY server_id
    """), {"since": since}):
        availability[r.server_id] = (float(r.availability), int(r.checks))

    points = {}
    for r in db.execute(text("""
        SELECT CAST(floor(extract(epoch FROM checked_at) / :b) * :b AS bigint) AS bucket_ts,
               server_id,
               avg(response_time) AS rt
        FROM server_check_history
        WHERE checked_at >= :since AND response_time IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 1
    """), {"since": since, "b": bucket}):
        points.setdefault(r.server_id, []).append([int(r.bucket_ts) * 1000, round(float(r.rt), 1)])

    online = sum(1 for s in servers if s.enabled and s.status == "online")
    offline = sum(1 for s in servers if s.enabled and s.status == "offline")

    return {
        "hours": hours,
        "bucket_seconds": bucket,
        "counts": {
            "total": len(servers),
            "online": online,
            "offline": offline,
            "other": len(servers) - online - offline,
        },
        "servers": [
            {
                "id": s.id,
                "name": s.name,
                "hostname": s.hostname,
                "ip_address": s.ip_address,
                "protocols": s.protocols,
                "enabled": s.enabled,
                "status": s.status,
                "response_time": s.response_time,
                "last_check": s.last_check,
                "last_status_change": s.last_status_change,
                "availability": availability.get(s.id, (None, 0))[0],
                "checks": availability.get(s.id, (None, 0))[1],
            }
            for s in servers
        ],
        "series": [
            {"server_id": s.id, "name": s.name, "points": points[s.id]}
            for s in servers
            if s.id in points
        ],
    }
