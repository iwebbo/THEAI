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
        <head>
            <meta charset="UTF-8">
            <title>Monitoring Alert</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b;">
            <!-- Wrapper Table to center everything -->
            <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #09090b;">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        
                        <!-- Main Container (Centered with margin: 0 auto and max-width) -->
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #121215; border-radius: 12px; border: 1px solid #27272a;">
                            
                            <!-- Header -->
                            <tr>
                                <td align="center" style="padding: 40px 30px 20px 30px;">
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                        <tr>
                                            <td align="center">
                                                <div style="width: 80px; height: 80px; background-color: #1e293b; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); text-align: center; line-height: 80px;">
                                                    <span style="font-size: 36px; vertical-align: middle;">⚠️</span>
                                                </div>
                                                <h1 style="color: #f4f4f5; margin: 0; font-size: 28px; font-weight: 700;">
                                                    SERVER OFFLINE
                                                </h1>
                                                <p style="color: #a1a1aa; margin: 8px 0 0; font-size: 14px;">
                                                    Critical infrastructure alert
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Status Banner -->
                            <tr>
                                <td align="center" style="padding: 0 30px 25px 30px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center" style="background-color: #1e293b; border-radius: 8px; padding: 16px 24px;">
                                                <p style="margin: 0; color: #fca5a5; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    🔴 Status: Down
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Server Information -->
                            <tr>
                                <td align="center" style="padding: 0 25px 20px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding: 0 5px 0 0; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        Server
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 16px; font-weight: 600;">
                                                        {server_name}
                                                    </p>
                                                </div>
                                            </td>
                                            <td style="padding: 0 0 0 5px; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        IP Address
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">
                                                        {server_ip}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Additional Info -->
                            <tr>
                                <td align="center" style="padding: 0 25px 25px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding: 0 5px 0 0; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        Hostname
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 14px; font-family: 'Courier New', monospace;">
                                                        {server_hostname}
                                                    </p>
                                                </div>
                                            </td>
                                            <td style="padding: 0 0 0 5px; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        Detected At
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 14px; font-weight: 600;">
                                                        {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Error Details -->
                            <tr>
                                <td align="center" style="padding: 0 25px 25px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td>
                                                <div style="background-color: #1e293b; border-left: 3px solid #fca5a5; border-radius: 6px; padding: 20px;">
                                                    <p style="margin: 0 0 10px; color: #f4f4f5; font-size: 13px; font-weight: 600;">
                                                        💥 Error Message
                                                    </p>
                                                    <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                                                        {error_message}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Action Buttons -->
                            <tr>
                                <td align="center" style="padding: 0 25px 35px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center" style="padding: 0 5px 0 0; width: 50%;">
                                                <a href="#" style="display: block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 13px; text-align: center;">
                                                    View Dashboard
                                                </a>
                                            </td>
                                            <td align="center" style="padding: 0 0 0 5px; width: 50%;">
                                                <a href="#" style="display: block; background-color: #1e293b; color: #f4f4f5; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 13px; text-align: center; border: 1px solid #3f3f46;">
                                                    View Logs
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer Inside Card -->
                            <tr>
                                <td align="center" style="padding: 0 25px 40px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center">
                                                <div style="margin-bottom: 12px;">
                                                    <svg width="40" height="40" viewBox="0 0 100 100" style="display: inline-block;">
                                                        <polygon points="50,10 80,30 80,70 50,90 20,70 20,30" fill="#6366f1" stroke="none"/>
                                                        <g fill="white" stroke="white" stroke-width="3">
                                                            <line x1="35" y1="35" x2="65" y2="65"/>
                                                            <line x1="65" y1="35" x2="35" y2="65"/>
                                                            <line x1="50" y1="25" x2="50" y2="75"/>
                                                            <line x1="30" y1="50" x2="70" y2="50"/>
                                                        </g>
                                                    </svg>
                                                </div>
                                                <p style="margin: 0 0 4px; color: #a1a1aa; font-size: 13px; font-weight: 600;">
                                                    THEAI Monitoring
                                                </p>
                                                <p style="margin: 0; color: #71717a; font-size: 11px;">
                                                    Automated Infrastructure Monitoring
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                        </table>
                        
                    </td>
                </tr>
                
                <!-- Disclaimer -->
                <tr>
                    <td align="center" style="padding: 0 20px 40px 20px;">
                        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
                            <tr>
                                <td align="center">
                                    <p style="margin: 0; color: #71717a; font-size: 11px; line-height: 1.6;">
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
        <head>
            <meta charset="UTF-8">
            <title>Monitoring Alert</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b;">
            <!-- Wrapper Table to center everything -->
            <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #09090b;">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        
                        <!-- Main Container (Centered with margin: 0 auto and max-width) -->
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #121215; border-radius: 12px; border: 1px solid #27272a;">
                            
                            <!-- Header -->
                            <tr>
                                <td align="center" style="padding: 40px 30px 20px 30px;">
                                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                        <tr>
                                            <td align="center">
                                                <div style="width: 80px; height: 80px; background-color: #1e293b; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); text-align: center; line-height: 80px;">
                                                    <span style="font-size: 36px; vertical-align: middle;">✅</span>
                                                </div>
                                                <h1 style="color: #f4f4f5; margin: 0; font-size: 28px; font-weight: 700;">
                                                    SERVER RECOVERED
                                                </h1>
                                                <p style="color: #a1a1aa; margin: 8px 0 0; font-size: 14px;">
                                                    Critical infrastructure alert
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Status Banner -->
                            <tr>
                                <td align="center" style="padding: 0 30px 25px 30px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center" style="background-color: #1e293b; border-radius: 8px; padding: 16px 24px;">
                                                <p style="margin: 0; color: #fca5a5; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    🟢 STATUS: ONLINE
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Server Information -->
                            <tr>
                                <td align="center" style="padding: 0 25px 20px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding: 0 5px 0 0; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        Server
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 16px; font-weight: 600;">
                                                        {server_name}
                                                    </p>
                                                </div>
                                            </td>
                                            <td style="padding: 0 0 0 5px; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        IP Address
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">
                                                        {server_ip}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Additional Info -->
                            <tr>
                                <td align="center" style="padding: 0 25px 25px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="padding: 0 5px 0 0; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        Hostname
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 14px; font-family: 'Courier New', monospace;">
                                                        {server_hostname}
                                                    </p>
                                                </div>
                                            </td>
                                            <td style="padding: 0 0 0 5px; width: 50%;" valign="top">
                                                <div style="background-color: #1e293b; border-radius: 8px; padding: 20px;">
                                                    <p style="margin: 0 0 6px; color: #71717a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                                                        Detected At
                                                    </p>
                                                    <p style="margin: 0; color: #f4f4f5; font-size: 14px; font-weight: 600;">
                                                        {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Error Details -->
                            <tr>
                                <td align="center" style="padding: 0 25px 25px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td>
                                                <div style="background-color: #1e293b; border-left: 3px solid #fca5a5; border-radius: 6px; padding: 20px;">
                                                    <p style="margin: 0 0 10px; color: #f4f4f5; font-size: 13px; font-weight: 600;">
                                                        💥 Error Message
                                                    </p>
                                                    <p style="margin: 0; color: #a1a1aa; font-size: 12px; line-height: 1.6;">
                                                        {error_message}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Action Buttons -->
                            <tr>
                                <td align="center" style="padding: 0 25px 35px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center" style="padding: 0 5px 0 0; width: 50%;">
                                                <a href="#" style="display: block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 13px; text-align: center;">
                                                    View Dashboard
                                                </a>
                                            </td>
                                            <td align="center" style="padding: 0 0 0 5px; width: 50%;">
                                                <a href="#" style="display: block; background-color: #1e293b; color: #f4f4f5; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 13px; text-align: center; border: 1px solid #3f3f46;">
                                                    View Logs
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                            <!-- Footer Inside Card -->
                            <tr>
                                <td align="center" style="padding: 0 25px 40px 25px;">
                                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td align="center">
                                                <div style="margin-bottom: 12px;">
                                                    <svg width="40" height="40" viewBox="0 0 100 100" style="display: inline-block;">
                                                        <polygon points="50,10 80,30 80,70 50,90 20,70 20,30" fill="#6366f1" stroke="none"/>
                                                        <g fill="white" stroke="white" stroke-width="3">
                                                            <line x1="35" y1="35" x2="65" y2="65"/>
                                                            <line x1="65" y1="35" x2="35" y2="65"/>
                                                            <line x1="50" y1="25" x2="50" y2="75"/>
                                                            <line x1="30" y1="50" x2="70" y2="50"/>
                                                        </g>
                                                    </svg>
                                                </div>
                                                <p style="margin: 0 0 4px; color: #a1a1aa; font-size: 13px; font-weight: 600;">
                                                    THEAI Monitoring
                                                </p>
                                                <p style="margin: 0; color: #71717a; font-size: 11px;">
                                                    Automated Infrastructure Monitoring
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            
                        </table>
                        
                    </td>
                </tr>
                
                <!-- Disclaimer -->
                <tr>
                    <td align="center" style="padding: 0 20px 40px 20px;">
                        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto;">
                            <tr>
                                <td align="center">
                                    <p style="margin: 0; color: #71717a; font-size: 11px; line-height: 1.6;">
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