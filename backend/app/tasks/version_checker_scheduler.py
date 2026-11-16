"""Scheduler du version checker : contrôle périodique de toutes les cibles (local + officiel).

Même principe que tasks/scheduler.py et le processor HTTP synthetic : une boucle asyncio
démarrée au startup. La boucle "tick" toutes les heures et ne lance un run_all que si une
cible active n'a jamais été contrôlée ou l'a été il y a plus de INTERVAL_HOURS. Un redémarrage
du conteneur ne relance donc pas de contrôle inutile.

run_all contrôle aussi les cibles non configurées (URL vide) : la veille de versions officielles
reste utile, le statut local est simplement « not_configured ».

Variables d'environnement (optionnelles) :
  VERSION_CHECKER_SCHEDULER_ENABLED   true|false          (défaut : true)
  VERSION_CHECKER_INTERVAL_HOURS      intervalle en heures (défaut : 168 = hebdomadaire ; 720 ≈ mensuel)
"""
import asyncio
import logging
import os
from datetime import timedelta

from core.database import SessionLocal
from models.version_checker import VersionTarget
from services.version_checker.checker_common import utcnow
from services.version_checker.checker_service import purge_history, run_all

logger = logging.getLogger(__name__)

TICK_SECONDS = 3600
STARTUP_DELAY_SECONDS = 30  # laisse le démarrage (init DB, seed des cibles) se terminer


def _interval_hours() -> float:
    try:
        return max(1.0, float(os.getenv("VERSION_CHECKER_INTERVAL_HOURS") or 168))
    except ValueError:
        return 168.0


def _enabled() -> bool:
    return (os.getenv("VERSION_CHECKER_SCHEDULER_ENABLED", "true").strip().lower()
            not in ("0", "false", "no", "off"))


def is_due(db, interval_hours: float) -> bool:
    """Vrai si une cible active n'a jamais été contrôlée ou l'a été il y a plus de l'intervalle."""
    limit = utcnow() - timedelta(hours=interval_hours)
    return db.query(VersionTarget.id).filter(
        VersionTarget.enabled.is_(True),
        (VersionTarget.last_checked_at.is_(None)) | (VersionTarget.last_checked_at < limit),
    ).first() is not None


async def run_version_checks(db) -> int:
    """Lance run_all, purge l'historique ancien et journalise les changements. Retourne le nombre de cibles."""
    before = {t.id: t.update_status for t in db.query(VersionTarget).all()}
    results, skipped = await run_all(db)
    for target, check in results:
        if before.get(target.id) != check.update_status:
            logger.info("Version check %s (%s) : %s -> %s (installée %s, disponible %s)",
                        target.name, target.app_type, before.get(target.id), check.update_status,
                        check.local_version, check.target_version)
            # Point d'accroche alerting : target en retard (patch/minor/major_behind)
        if check.local_status == "error":
            logger.warning("Version check %s : lecture locale en erreur : %s", target.name, check.local_error)
        if check.upstream_status != "ok":
            logger.warning("Version check %s : source officielle en erreur : %s", target.name, check.upstream_error)
    purged = purge_history(db)
    if purged:
        logger.info("Version check : %s ligne(s) d'historique purgée(s)", purged)
    logger.info("Version check terminé : %s cible(s) contrôlée(s), %s ignorée(s)", len(results), skipped)
    return len(results)


async def check_versions_periodically(tick_seconds: int = TICK_SECONDS):
    interval = _interval_hours()
    logger.info("Starting version checker scheduler (interval: %sh, tick: %ss)", interval, tick_seconds)
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        db = SessionLocal()
        try:
            if is_due(db, interval):
                logger.info("Version checker : contrôle périodique lancé")
                await run_version_checks(db)
        except Exception as e:
            logger.error("Version checker scheduler error: %s", e)
            db.rollback()
        finally:
            db.close()
        await asyncio.sleep(tick_seconds)


def start_version_checker_scheduler():
    if not _enabled():
        logger.info("Version checker scheduler désactivé (VERSION_CHECKER_SCHEDULER_ENABLED=false)")
        return
    asyncio.create_task(check_versions_periodically())