import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session

from core.database import SessionLocal
from services.settings import SettingsService

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def get_email_config():
        """
        Récupère la configuration email depuis la base de données
        """
        db = SessionLocal()
        try:
            return SettingsService.get_email_config(db)
        finally:
            db.close()
    
    @staticmethod
    def send_email(
        to_emails: List[str],
        subject: str,
        body: str,
        html_body: Optional[str] = None
    ) -> bool:
        """
        Envoie un email à une liste de destinataires en utilisant la configuration de la DB
        
        Args:
            to_emails: Liste des adresses email des destinataires
            subject: Sujet de l'email
            body: Corps du message en texte brut
            html_body: Corps du message en HTML (optionnel)
            
        Returns:
            bool: True si l'email a été envoyé avec succès, False sinon
        """
        # Récupérer la configuration depuis la base de données
        config = EmailService.get_email_config()
        
        if not config.enable_email_alerts:
            logger.info("Email alerts are disabled in configuration")
            return False
        
        if not config.smtp_username or not config.smtp_password:
            logger.error("SMTP credentials not configured")
            return False
        
        try:
            # Créer le message
            msg = MIMEMultipart('alternative')
            msg['From'] = config.smtp_from_email
            msg['To'] = ', '.join(to_emails)
            msg['Subject'] = subject
            
            # Ajouter le texte brut
            msg.attach(MIMEText(body, 'plain', 'utf-8'))
            
            # Ajouter le HTML si fourni
            if html_body:
                msg.attach(MIMEText(html_body, 'html', 'utf-8'))
            
            # Se connecter au serveur SMTP et envoyer l'email
            with smtplib.SMTP(config.smtp_server, config.smtp_port) as server:
                if config.smtp_use_tls:
                    server.starttls()
                
                server.login(config.smtp_username, config.smtp_password)
                server.send_message(msg)
            
            logger.info(f"Email sent successfully to {', '.join(to_emails)} with subject: {subject}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {', '.join(to_emails)}: {str(e)}")
            return False
    
    @staticmethod
    def send_server_down_alert(server_name: str, server_hostname: str, server_ip: str, 
                              error_message: str, to_emails: Optional[List[str]] = None) -> bool:
        """
        Envoie une alerte email pour un serveur hors ligne
        
        Args:
            server_name: Nom du serveur
            server_hostname: Hostname du serveur
            server_ip: Adresse IP du serveur
            error_message: Message d'erreur détaillé
            to_emails: Liste des destinataires (optionnel, utilise la config DB si None)
            
        Returns:
            bool: True si l'email a été envoyé avec succès
        """
        # Utiliser les destinataires de la configuration si non spécifiés
        if to_emails is None:
            config = EmailService.get_email_config()
            to_emails = config.alert_emails
        
        if not to_emails:
            logger.warning("No email recipients configured for alerts")
            return False
        
        subject = f"🚨 ALERTE - Serveur {server_name} hors ligne"
        
        # Corps du message en texte brut
        body = f"""
Critical infrastructure alert - SERVER OFFLINE

Server: {server_name}
Hostname: {server_hostname}
IP Address: {server_ip}
Times: {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}

Details:
{error_message}

Veuillez vérifier l'état de ce serveur dès que possible.

---
Système de monitoring automatique
        """.strip()
        
        # Corps du message en HTML
        html_body = f"""
        <html lang="en">
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #1a202c;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 40px 20px;">
                        <!-- Main Container -->
                        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #2d3748; border-radius: 16px; border: 1px solid #4a5568; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);">
                            
                            <!-- Header -->
                            <tr>
                                <td style="padding: 40px 30px; text-align: center;">
                                    <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #fc8181 0%, #f56565 100%); border-radius: 50%; margin: 0 auto 20px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 30px rgba(252, 129, 129, 0.4);">
                                        <span style="font-size: 56px;">⚠️</span>
                                    </div>
                                    <h1 style="color: #f7fafc; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                                        SERVER OFFLINE
                                    </h1>
                                    <p style="color: #cbd5e0; margin: 12px 0 0; font-size: 16px;">
                                        Critical infrastructure alert
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Status Banner -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <div style="background: linear-gradient(135deg, rgba(252, 129, 129, 0.15) 0%, rgba(245, 101, 101, 0.15) 100%); border: 2px solid #fc8181; border-radius: 12px; padding: 20px; text-align: center;">
                                        <p style="margin: 0; color: #feb2b2; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                                            🔴 STATUS: DOWN
                                        </p>
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Server Information Grid -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;" colspan="1">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Server</p>
                                                <p style="margin: 0; color: #f7fafc; font-size: 18px; font-weight: 700;">{server_name}</p>
                                            </td>
                                            <td style="width: 10px;"></td>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">IP Address</p>
                                                <p style="margin: 0; color: #f7fafc; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">{server_ip}</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Hostname</p>
                                                <p style="margin: 0; color: #f7fafc; font-size: 14px; font-family: 'Courier New', monospace;">{server_hostname}</p>
                                            </td>
                                            <td style="width: 10px;"></td>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Detection Time</p>
                                                <p style="margin: 0; color: #f7fafc; font-size: 14px; font-weight: 600;">{datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Error Details -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <div style="background-color: #4a5568; border-left: 4px solid #fc8181; border-radius: 8px; padding: 20px;">
                                        <p style="margin: 0 0 10px; color: #f7fafc; font-size: 14px; font-weight: 600;">
                                            💥 Error Message
                                        </p>
                                        <p style="margin: 0; color: #feb2b2; font-size: 13px; font-family: 'Courier New', monospace; line-height: 1.6;">
                                            {error_message}.
                                        </p>
                                    </div>
                                </td>
                            </tr>        
                            <!-- Action Buttons -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <table role="presentation" style="width: 100%;">
                                        <tr>
                                            <td style="width: 50%; padding-right: 5px;">
                                                <a href="#" style="display: block; background: linear-gradient(135deg, #fc8181 0%, #f56565 100%); color: #ffffff; text-decoration: none; padding: 14px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; box-shadow: 0 4px 12px rgba(252, 129, 129, 0.3);">
                                                    View Dashboard
                                                </a>
                                            </td>
                                            <td style="width: 50%; padding-left: 5px;">
                                                <a href="#" style="display: block; background-color: #4a5568; color: #f7fafc; text-decoration: none; padding: 14px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; border: 1px solid #718096;">
                                                    View Logs
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a202c; padding: 30px; text-align: center; border-top: 1px solid #4a5568; border-radius: 0 0 16px 16px;">
                                    <div style="margin-bottom: 12px;">
                                        <svg width="40" height="40" viewBox="0 0 100 100" style="display: inline-block;">
                                            <polygon points="50,10 80,30 80,70 50,90 20,70 20,30" fill="#3b82f6" stroke="none"/>
                                            <g fill="white" stroke="white" stroke-width="3">
                                                <line x1="35" y1="35" x2="65" y2="65"/>
                                                <line x1="65" y1="35" x2="35" y2="65"/>
                                                <line x1="50" y1="25" x2="50" y2="75"/>
                                                <line x1="30" y1="50" x2="70" y2="50"/>
                                            </g>
                                        </svg>
                                    </div>
                                    <p style="margin: 0 0 5px; color: #e2e8f0; font-size: 14px; font-weight: 600;">
                                        THEAI Monitoring
                                    </p>
                                    <p style="margin: 0; color: #a0aec0; font-size: 11px;">
                                        Automated Infrastructure Monitoring
                                    </p>
                                </td>
                            </tr>
                            
                        </table>
                        
                        <!-- Disclaimer -->
                        <table role="presentation" style="max-width: 600px; margin: 20px auto 0;">
                            <tr>
                                <td style="text-align: center; padding: 0 30px;">
                                    <p style="margin: 0; color: #a0aec0; font-size: 11px; line-height: 1.6;">
                                        This is an automated alert from THEAI Monitoring System.<br>
                                        Please do not reply to this email.
                                    </p>
                                </td>
                            </tr>
                        </table>
                        
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        return EmailService.send_email(to_emails, subject, body, html_body)
    
    @staticmethod
    def send_server_recovery_alert(server_name: str, server_hostname: str, server_ip: str,
                                  response_time: int, to_emails: Optional[List[str]] = None) -> bool:
        """
        Envoie une alerte email pour un serveur qui est redevenu accessible
        
        Args:
            server_name: Nom du serveur
            server_hostname: Hostname du serveur
            server_ip: Adresse IP du serveur
            response_time: Temps de réponse en millisecondes
            to_emails: Liste des destinataires (optionnel, utilise la config DB si None)
            
        Returns:
            bool: True si l'email a été envoyé avec succès
        """
        # Utiliser les destinataires de la configuration si non spécifiés
        if to_emails is None:
            config = EmailService.get_email_config()
            to_emails = config.alert_emails
        
        if not to_emails:
            logger.warning("No email recipients configured for alerts")
            return False
        
        subject = f"✅ RÉCUPÉRATION - Serveur {server_name} de nouveau en ligne"
        
        # Corps du message en texte brut
        body = f"""
NOTIFICATION DE MONITORING - SERVEUR RÉCUPÉRÉ

Server: {server_name}
Hostname: {server_hostname}
IP Adress: {server_ip}
Times: {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}
Average: {response_time}ms

Le serveur est maintenant de nouveau accessible et répond normalement.

---
Système de monitoring automatique
        """.strip()
        
        # Corps du message en HTML (COMPLET)
        html_body = f"""
        <html lang="en">
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #1a202c;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 40px 20px;">
                        <!-- Main Container -->
                        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #2d3748; border-radius: 16px; border: 1px solid #4a5568; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);">
                            
                            <!-- Header -->
                            <tr>
                                <td style="padding: 40px 30px; text-align: center;">
                                    <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #68d391 0%, #48bb78 100%); border-radius: 50%; margin: 0 auto 20px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 30px rgba(104, 211, 145, 0.4);">
                                        <span style="font-size: 56px;">✅</span>
                                    </div>
                                    <h1 style="color: #f7fafc; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                                        SERVER RECOVERED
                                    </h1>
                                    <p style="color: #cbd5e0; margin: 12px 0 0; font-size: 16px;">
                                        System is back online and operational
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Status Banner -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <div style="background: linear-gradient(135deg, rgba(104, 211, 145, 0.15) 0%, rgba(72, 187, 120, 0.15) 100%); border: 2px solid #68d391; border-radius: 12px; padding: 20px; text-align: center;">
                                        <p style="margin: 0; color: #9ae6b4; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                                            🟢 STATUS: ONLINE
                                        </p>
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Server Information Grid -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;" colspan="1">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Server</p>
                                                <p style="margin: 0; color: #f7fafc; font-size: 18px; font-weight: 700;">{server_name}</p>
                                            </td>
                                            <td style="width: 10px;"></td>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">IP Address</p>
                                                <p style="margin: 0; color: #f7fafc; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">{server_ip}</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Hostname</p>
                                                <p style="margin: 0; color: #f7fafc; font-size: 14px; font-family: 'Courier New', monospace;">{server_hostname}</p>
                                            </td>
                                            <td style="width: 10px;"></td>
                                            <td style="width: 50%; padding: 20px; background-color: #4a5568; border-radius: 12px; vertical-align: top;">
                                                <p style="margin: 0 0 8px; color: #cbd5e0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Response Time</p>
                                                <p style="margin: 0; color: #9ae6b4; font-size: 18px; font-weight: 700;">{response_time}ms</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Recovery Details -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <div style="background-color: #4a5568; border-left: 4px solid #68d391; border-radius: 8px; padding: 20px;">
                                        <p style="margin: 0 0 10px; color: #f7fafc; font-size: 14px; font-weight: 600;">
                                            ✓ Recovery Information
                                        </p>
                                        <p style="margin: 0; color: #9ae6b4; font-size: 13px; line-height: 1.6;">
                                            Server has been successfully restored and is responding normally to health checks. All services are operational.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                            
                            <!-- Recovery Stats -->
                            <tr>
                                <td style="padding: 0 30px 30px;">
                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                        <tr>
                                            <td style="width: 33.33%; padding: 16px; background-color: rgba(104, 211, 145, 0.1); border-radius: 8px; text-align: center;">
                                                <p style="margin: 0 0 6px; color: #cbd5e0; font-size: 11px; text-transform: uppercase;">Recovery</p>
                                                <p style="margin: 0; color: #9ae6b4; font-size: 20px; font-weight: 700;">{datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}</p>
                                            </td>
                                            <td style="width: 5px;"></td>
                                            <td style="width: 33.33%; padding: 16px; background-color: rgba(104, 211, 145, 0.1); border-radius: 8px; text-align: center;">
                                                <p style="margin: 0 0 6px; color: #cbd5e0; font-size: 11px; text-transform: uppercase;">Status</p>
                                                <p style="margin: 0; color: #9ae6b4; font-size: 20px; font-weight: 700;">100%</p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Action Button -->
                            <tr>
                                <td style="padding: 0 30px 30px; text-align: center;">
                                    <a href="#" style="display: inline-block; background: linear-gradient(135deg, #68d391 0%, #48bb78 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(104, 211, 145, 0.3);">
                                        View Dashboard
                                    </a>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="background-color: #1a202c; padding: 30px; text-align: center; border-top: 1px solid #4a5568; border-radius: 0 0 16px 16px;">
                                    <div style="margin-bottom: 12px;">
                                        <svg width="40" height="40" viewBox="0 0 100 100" style="display: inline-block;">
                                            <polygon points="50,10 80,30 80,70 50,90 20,70 20,30" fill="#3b82f6" stroke="none"/>
                                            <g fill="white" stroke="white" stroke-width="3">
                                                <line x1="35" y1="35" x2="65" y2="65"/>
                                                <line x1="65" y1="35" x2="35" y2="65"/>
                                                <line x1="50" y1="25" x2="50" y2="75"/>
                                                <line x1="30" y1="50" x2="70" y2="50"/>
                                            </g>
                                        </svg>
                                    </div>
                                    <p style="margin: 0 0 5px; color: #e2e8f0; font-size: 14px; font-weight: 600;">
                                        THEAI Monitoring
                                    </p>
                                    <p style="margin: 0; color: #a0aec0; font-size: 11px;">
                                        Automated Infrastructure Monitoring
                                    </p>
                                </td>
                            </tr>
                            
                        </table>
                        
                        <!-- Disclaimer -->
                        <table role="presentation" style="max-width: 600px; margin: 20px auto 0;">
                            <tr>
                                <td style="text-align: center; padding: 0 30px;">
                                    <p style="margin: 0; color: #a0aec0; font-size: 11px; line-height: 1.6;">
                                        This is an automated alert from THEAI Monitoring System.<br>
                                        Please do not reply to this email.
                                    </p>
                                </td>
                            </tr>
                        </table>
                        
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        return EmailService.send_email(to_emails, subject, body, html_body)