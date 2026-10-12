import asyncio
import logging
from datetime import datetime

from services.monitoring import MonitoringService
from services.email import EmailService
from services.settings import SettingsService
from services.history import record_check, purge_history
from models.server import Server
from core.config import settings
from core.database import SessionLocal

# Configurer le logging avec plus de détails
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def check_all_servers_periodically(interval_seconds=300):
    """
    Vérifie périodiquement l'état de tous les serveurs actifs.

    Args:
        interval_seconds: Intervalle entre les vérifications en secondes
    """
    logger.info(f"🚀 Starting periodic server checking service (interval: {interval_seconds}s)")

    while True:
        db = SessionLocal()
        try:
            # Récupérer la configuration email depuis la base de données
            email_config = SettingsService.get_email_config(db)

            # Log de la configuration des alertes
            if email_config.enable_email_alerts and email_config.alert_emails:
                logger.info(f"📧 Email alerts enabled for: {', '.join(email_config.alert_emails)}")
            else:
                logger.info("📧 Email alerts are disabled or no recipients configured")

            active_servers = db.query(Server).filter(Server.enabled == True).all()
            logger.info(f"🔍 Checking {len(active_servers)} active servers")

            for server in active_servers:
                try:
                    logger.info(f"Checking server: {server.name} ({server.hostname}) - Current status: {server.status}")

                    check_result = await MonitoringService.check_server(server)

                    old_status = server.status
                    new_status = check_result.status

                    logger.info(f"Server {server.name}: {old_status} -> {new_status}")

                    # Mettre à jour le serveur
                    server.status = new_status
                    server.last_check = datetime.now()
                    server.response_time = check_result.response_time

                    # Historiser le check (alimente les dashboards Grafana)
                    record_check(db, server, check_result)

                    # Vérifier si le statut a changé
                    if old_status != new_status:
                        server.last_status_change = datetime.now()
                        logger.info(f"🔄 STATUS CHANGE DETECTED for {server.name}: {old_status} -> {new_status}")

                        # Envoyer des alertes email si configurées
                        await send_status_change_alert(server, old_status, check_result, email_config)
                    else:
                        logger.debug(f"✅ No status change for {server.name} (remains {new_status})")

                except Exception as e:
                    logger.error(f"❌ Error checking server {server.name} ({server.hostname}): {e}")

            # Purge de l'historique au-delà de la rétention
            purge_history(db, settings.CHECK_HISTORY_RETENTION_DAYS)

            db.commit()
            logger.info(f"✅ Completed checking {len(active_servers)} servers")

        except Exception as e:
            logger.error(f"❌ Error in server checking task: {e}")
            db.rollback()
        finally:
            db.close()

        # Attendre avant la prochaine vérification
        logger.info(f"⏳ Waiting {interval_seconds} seconds before next check...")
        await asyncio.sleep(interval_seconds)

async def send_status_change_alert(server, old_status, check_result, email_config):
    """
    Envoie une alerte email en cas de changement de statut d'un serveur

    Args:
        server: Instance du serveur
        old_status: Ancien statut du serveur
        check_result: Résultat de la vérification (ServerCheck)
        email_config: Configuration email depuis la base de données
    """
    logger.info(f"📧 send_status_change_alert called for {server.name}: {old_status} -> {check_result.status}")

    # Vérifier si les alertes email sont activées
    if not email_config.enable_email_alerts:
        logger.info(f"❌ Email alerts are DISABLED")
        return

    if not email_config.alert_emails:
        logger.info(f"❌ No alert emails configured")
        return

    logger.info(f"✅ Email alerts are enabled for: {', '.join(email_config.alert_emails)}")

    # Vérifier les conditions d'alerte
    if old_status == "unknown":
        logger.info(f"⏭️ Skipping email alert for server {server.name}: initial status change from unknown")
        return

    try:
        email_sent = False

        if check_result.status == "offline" and old_status == "online":
            # Serveur devenu hors ligne
            logger.info(f"🚨 Sending OFFLINE alert for server {server.name}")
            success = EmailService.send_server_down_alert(
                server_name=server.name,
                server_hostname=server.hostname,
                server_ip=server.ip_address,
                error_message=check_result.message or "Aucun message d'erreur disponible"
                # to_emails est récupéré automatiquement depuis la config DB
            )
            email_sent = True

            if success:
                logger.info(f"✅ Offline alert sent successfully for server {server.name}")
            else:
                logger.error(f"❌ Failed to send offline alert for server {server.name}")

        elif check_result.status == "online" and old_status == "offline":
            # Serveur redevenu en ligne
            logger.info(f"✅ Sending RECOVERY alert for server {server.name}")
            success = EmailService.send_server_recovery_alert(
                server_name=server.name,
                server_hostname=server.hostname,
                server_ip=server.ip_address,
                response_time=check_result.response_time or 0
                # to_emails est récupéré automatiquement depuis la config DB
            )
            email_sent = True

            if success:
                logger.info(f"✅ Recovery alert sent successfully for server {server.name}")
            else:
                logger.error(f"❌ Failed to send recovery alert for server {server.name}")

        if not email_sent:
            logger.info(f"ℹ️ No email alert condition met for {server.name}: {old_status} -> {check_result.status}")

    except Exception as e:
        logger.error(f"❌ Exception in send_status_change_alert for server {server.name}: {e}")
        import traceback
        logger.error(traceback.format_exc())

def start_scheduler():
    """
    Démarre le planificateur des tâches de vérification.
    Cette fonction doit être appelée au démarrage de l'application.
    """
    logger.info("🚀 Initializing server monitoring scheduler")
    # Intervalle réduit à 30 secondes pour les tests
    asyncio.create_task(check_all_servers_periodically(30))
