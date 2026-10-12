from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

_SORT_COLUMNS = {
    "published": "published",
    "cvss_base": "cvss_base",
    "epss_score": "epss_score",
}
_NUMERIC_FIELDS = ("cvss_base", "epss_score", "epss_percentile")


def _schema_ready(db: Session) -> bool:
    return bool(db.execute(text("SELECT to_regclass('cve.entries') IS NOT NULL")).scalar())


def get_stats(db: Session) -> dict:
    """Compteurs globaux du referentiel CVE et derniere ingestion reussie."""
    empty = {
        "ready": False, "total": 0, "by_severity": {}, "kev": 0,
        "epss_high": 0, "critical_recent": 0, "last_ingest": None,
    }
    if not _schema_ready(db):
        return empty

    row = db.execute(text("""
        SELECT count(*) AS total,
               count(*) FILTER (WHERE kev) AS kev,
               count(*) FILTER (WHERE epss_score >= 0.1) AS epss_high,
               count(*) FILTER (WHERE cvss_base >= 9 AND published >= now() - interval '30 days') AS critical_recent
        FROM cve.entries
    """)).one()

    by_severity = {
        r.severity: r.n
        for r in db.execute(text("""
            SELECT severity, count(*) AS n
            FROM cve.entries
            WHERE severity IS NOT NULL
            GROUP BY severity
        """))
    }

    last = db.execute(text("""
        SELECT run_at, mode, duration_s
        FROM cve.ingest_runs
        WHERE success
        ORDER BY run_at DESC
        LIMIT 1
    """)).mappings().first()

    return {
        "ready": row.total > 0,
        "total": row.total,
        "by_severity": by_severity,
        "kev": row.kev,
        "epss_high": row.epss_high,
        "critical_recent": row.critical_recent,
        "last_ingest": dict(last) if last else None,
    }


def search_cve(
    db: Session,
    q: Optional[str],
    severity: Optional[str],
    kev: Optional[bool],
    min_epss: Optional[float],
    sort: str,
    size: int,
    offset: int,
) -> dict:
    if not _schema_ready(db):
        return {"total": 0, "items": []}

    where = ["TRUE"]
    params = {"size": size, "offset": offset}

    if severity:
        where.append("severity = :severity")
        params["severity"] = severity.lower()
    if kev:
        where.append("kev")
    if min_epss is not None:
        where.append("epss_score >= :min_epss")
        params["min_epss"] = min_epss
    if q and q.strip():
        term = q.strip()
        params["q"] = term
        params["q_upper"] = term.upper()
        params["q_lower"] = term.lower()
        where.append(
            "(cve_id = :q_upper"
            " OR :q_lower = ANY(products)"
            " OR :q_lower = ANY(vendors)"
            " OR to_tsvector('english', description) @@ plainto_tsquery('english', :q))"
        )

    where_sql = " AND ".join(where)
    order_col = _SORT_COLUMNS.get(sort, "published")

    total = db.execute(
        text(f"SELECT count(*) FROM cve.entries WHERE {where_sql}"), params
    ).scalar()

    rows = db.execute(text(f"""
        SELECT cve_id, published, last_modified, description, cvss_base, severity, attack_vector,
               epss_score, epss_percentile, kev, kev_date_added, kev_due_date, kev_ransomware,
               products, vendors, cwe
        FROM cve.entries
        WHERE {where_sql}
        ORDER BY {order_col} DESC NULLS LAST, cve_id
        LIMIT :size OFFSET :offset
    """), params).mappings().all()

    items = []
    for r in rows:
        item = dict(r)
        for field in _NUMERIC_FIELDS:
            if item[field] is not None:
                item[field] = float(item[field])
        items.append(item)

    return {"total": total, "items": items}
