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
ALERTE DE MONITORING - SERVEUR HORS LIGNE

Serveur: {server_name}
Hostname: {server_hostname}
Adresse IP: {server_ip}
Date/Heure: {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}

Détails de l'erreur:
{error_message}

Veuillez vérifier l'état de ce serveur dès que possible.

---
Système de monitoring automatique
        """.strip()
        
        # Corps du message en HTML
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background-color: #dc3545; color: white; padding: 15px; border-radius: 5px; text-align: center;">
                    <h2 style="margin: 0;">🚨 ALERTE - SERVEUR HORS LIGNE</h2>
                </div>
                
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="color: #dc3545; margin-top: 0;">Détails du serveur</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Serveur:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">{server_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Hostname:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">{server_hostname}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Adresse IP:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">{server_ip}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">Date/Heure:</td>
                            <td style="padding: 8px;">{datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border-left: 4px solid #ffc107;">
                    <h4 style="color: #856404; margin-top: 0;">Détails de l'erreur:</h4>
                    <p style="margin: 0; font-family: monospace; background-color: #f8f9fa; padding: 10px; border-radius: 3px;">
                        {error_message}
                    </p>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background-color: #e9ecef; border-radius: 5px; text-align: center;">
                    <p style="margin: 0; font-style: italic;">
                        Veuillez vérifier l'état de ce serveur dès que possible.
                    </p>
                </div>
                
                <div style="margin-top: 30px; text-align: center; color: #6c757d; font-size: 12px;">
                    <p>---</p>
                    <p>Système de monitoring automatique</p>
                </div>
            </div>
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

Serveur: {server_name}
Hostname: {server_hostname}
Adresse IP: {server_ip}
Date/Heure: {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}
Temps de réponse: {response_time}ms

Le serveur est maintenant de nouveau accessible et répond normalement.

---
Système de monitoring automatique
        """.strip()
        
        # Corps du message en HTML (COMPLET)
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background-color: #28a745; color: white; padding: 15px; border-radius: 5px; text-align: center;">
                    <h2 style="margin: 0;">✅ RÉCUPÉRATION - SERVEUR EN LIGNE</h2>
                </div>
                
                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="color: #28a745; margin-top: 0;">Détails du serveur</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Serveur:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">{server_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Hostname:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">{server_hostname}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Adresse IP:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">{server_ip}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #dee2e6;">Date/Heure:</td>
                            <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">{datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; font-weight: bold;">Temps de réponse:</td>
                            <td style="padding: 8px;">{response_time}ms</td>
                        </tr>
                    </table>
                </div>
                
                <div style="background-color: #d1eddd; padding: 15px; border-radius: 5px; border-left: 4px solid #28a745;">
                    <p style="margin: 0; color: #155724;">
                        <strong>Bonne nouvelle !</strong> Le serveur est maintenant de nouveau accessible et répond normalement.
                    </p>
                </div>
                
                <div style="margin-top: 30px; text-align: center; color: #6c757d; font-size: 12px;">
                    <p>---</p>
                    <p>Système de monitoring automatique</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return EmailService.send_email(to_emails, subject, body, html_body)