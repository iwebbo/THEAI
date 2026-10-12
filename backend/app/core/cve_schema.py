from pathlib import Path

from sqlalchemy import text

from core.database import engine

SCHEMA_FILE = Path(__file__).resolve().parent.parent / "sql" / "cve_schema.sql"


def ensure_cve_schema() -> None:
    """
    Cree (ou complete) le schema `cve` : installation neuve comme mise a jour d'une base existante.
    Le SQL est idempotent ; le verrou consultatif evite les conflits si plusieurs replicas demarrent.
    """
    sql = SCHEMA_FILE.read_text(encoding="utf-8")
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_xact_lock(727401)"))
        conn.exec_driver_sql(sql)
