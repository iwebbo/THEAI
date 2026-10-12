from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models.check_history import ServerCheckHistory


def record_check(db: Session, server, check_result) -> None:
    """Ajoute une ligne d'historique (commit fait par l'appelant)."""
    db.add(ServerCheckHistory(
        server_id=server.id,
        checked_at=datetime.utcnow(),
        status=check_result.status,
        response_time=check_result.response_time,
        message=(check_result.message or "")[:500],
    ))


def purge_history(db: Session, retention_days: int) -> None:
    """Supprime l'historique plus ancien que la retention (commit fait par l'appelant)."""
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    db.query(ServerCheckHistory).filter(ServerCheckHistory.checked_at < cutoff).delete(
        synchronize_session=False
    )
