"""Processor HTTP synthetic : checke périodiquement les cibles actives de http_synthetic_targets.

Même principe que tasks/scheduler.py (serveurs) : une boucle asyncio démarrée au startup.
Chaque cible a son propre interval_seconds ; la boucle "tick" toutes les TICK_SECONDS et
ne lance que les cibles échues (checks en parallèle borné, écriture DB séquentielle).
"""
import asyncio
import logging
from datetime import datetime, timezone

from core.database import SessionLocal
from models.http_synthetic_target import HttpSyntheticTarget
from services import http_synthetic_target_service as svc

logger = logging.getLogger(__name__)

TICK_SECONDS = 30


async def run_due_targets(db) -> int:
    """Checke toutes les cibles échues. Retourne le nombre de cibles traitées."""
    now = datetime.now(timezone.utc)
    targets = db.query(HttpSyntheticTarget).filter(HttpSyntheticTarget.enabled.is_(True)).all()
    due = [t for t in targets if svc.is_due(t, now)]
    if not due:
        return 0

    olds = {t.id: t.status for t in due}
    for target, row, err in await svc.run_many(db, due):
        if err:
            logger.error("HTTP synthetic target %s non exécutée : %s", target.id, err)
        if olds[target.id] != target.status:
            logger.info("HTTP synthetic target %s : %s -> %s", target.id, olds[target.id], target.status)
            # Point d'accroche alerting : olds[target.id] -> target.status, target.last_error
    db.commit()
    return len(due)


async def check_http_targets_periodically(tick_seconds: int = TICK_SECONDS):
    logger.info("Starting HTTP synthetic processor (tick: %ss)", tick_seconds)
    while True:
        db = SessionLocal()
        try:
            n = await run_due_targets(db)
            if n:
                logger.info("HTTP synthetic : %s cible(s) checkée(s)", n)
        except Exception as e:
            logger.error("HTTP synthetic processor error: %s", e)
            db.rollback()
        finally:
            db.close()
        await asyncio.sleep(tick_seconds)


def start_http_synthetic_scheduler():
    asyncio.create_task(check_http_targets_periodically())
