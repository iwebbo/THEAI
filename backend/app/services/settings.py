from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from models.settings import AppSettings
from schemas.settings import EmailConfig
import json

class SettingsService:
    @staticmethod
    def get_setting(db: Session, key: str, default_value: Optional[str] = None) -> Optional[str]:
        """
        Récupère une valeur de configuration depuis la base de données
        """
        setting = db.query(AppSettings).filter(AppSettings.key == key).first()
        if setting:
            return setting.value
        return default_value
    
    @staticmethod
    def set_setting(db: Session, key: str, value: str, description: Optional[str] = None, 
                   category: str = "general", is_sensitive: bool = False) -> AppSettings:
        """
        Définit ou met à jour une valeur de configuration
        """
        setting = db.query(AppSettings).filter(AppSettings.key == key).first()
        
        if setting:
            # Mettre à jour
            setting.value = value
            if description:
                setting.description = description
        else:
            # Créer nouveau
            setting = AppSettings(
                key=key,
                value=value,
                description=description,
                category=category,
                is_sensitive=is_sensitive
            )
            db.add(setting)
        
        db.commit()
        db.refresh(setting)
        return setting
    
    @staticmethod
    def get_email_config(db: Session) -> EmailConfig:
        """
        Récupère la configuration email complète
        """
        # Valeurs par défaut depuis les variables d'environnement
        from core.config import settings as env_settings
        
        # Récupérer les valeurs depuis la base de données ou utiliser les valeurs par défaut
        smtp_server = SettingsService.get_setting(db, "email.smtp_server", env_settings.SMTP_SERVER)
        smtp_port = int(SettingsService.get_setting(db, "email.smtp_port", str(env_settings.SMTP_PORT)))
        smtp_username = SettingsService.get_setting(db, "email.smtp_username", env_settings.SMTP_USERNAME)
        smtp_password = SettingsService.get_setting(db, "email.smtp_password", env_settings.SMTP_PASSWORD)
        smtp_from_email = SettingsService.get_setting(db, "email.smtp_from_email", env_settings.SMTP_FROM_EMAIL)
        smtp_use_tls = SettingsService.get_setting(db, "email.smtp_use_tls", str(env_settings.SMTP_USE_TLS)).lower() == "true"
        enable_email_alerts = SettingsService.get_setting(db, "email.enable_alerts", str(env_settings.ENABLE_EMAIL_ALERTS)).lower() == "true"
        
        # Gérer la liste des emails d'alerte
        alert_emails_str = SettingsService.get_setting(db, "email.alert_emails", ",".join(env_settings.ALERT_EMAILS))
        alert_emails = [email.strip() for email in alert_emails_str.split(",") if email.strip()] if alert_emails_str else []
        
        return EmailConfig(
            smtp_server=smtp_server,
            smtp_port=smtp_port,
            smtp_username=smtp_username,
            smtp_password=smtp_password,
            smtp_from_email=smtp_from_email,
            smtp_use_tls=smtp_use_tls,
            enable_email_alerts=enable_email_alerts,
            alert_emails=alert_emails
        )
    
    @staticmethod
    def update_email_config(db: Session, config: Dict[str, Any]) -> EmailConfig:
        """
        Met à jour la configuration email
        """
        # Mettre à jour chaque paramètre s'il est fourni
        if "smtp_server" in config:
            SettingsService.set_setting(db, "email.smtp_server", config["smtp_server"], 
                                       "Serveur SMTP pour l'envoi d'emails", "email")
        
        if "smtp_port" in config:
            SettingsService.set_setting(db, "email.smtp_port", str(config["smtp_port"]), 
                                       "Port SMTP", "email")
        
        if "smtp_username" in config:
            SettingsService.set_setting(db, "email.smtp_username", config["smtp_username"], 
                                       "Nom d'utilisateur SMTP", "email")
        
        if "smtp_password" in config:
            SettingsService.set_setting(db, "email.smtp_password", config["smtp_password"], 
                                       "Mot de passe SMTP", "email", is_sensitive=True)
        
        if "smtp_from_email" in config:
            SettingsService.set_setting(db, "email.smtp_from_email", config["smtp_from_email"], 
                                       "Adresse email d'expédition", "email")
        
        if "smtp_use_tls" in config:
            SettingsService.set_setting(db, "email.smtp_use_tls", str(config["smtp_use_tls"]), 
                                       "Utiliser TLS pour SMTP", "email")
        
        if "enable_email_alerts" in config:
            SettingsService.set_setting(db, "email.enable_alerts", str(config["enable_email_alerts"]), 
                                       "Activer les alertes par email", "email")
        
        if "alert_emails" in config:
            alert_emails_str = ",".join(config["alert_emails"]) if config["alert_emails"] else ""
            SettingsService.set_setting(db, "email.alert_emails", alert_emails_str, 
                                       "Liste des destinataires d'alertes", "email")
        
        # Retourner la configuration mise à jour
        return SettingsService.get_email_config(db)
    
    @staticmethod
    def initialize_default_settings(db: Session):
        """
        Initialise les paramètres par défaut en base de données si ils n'existent pas
        """
        from core.config import settings as env_settings
        
        default_settings = [
            ("email.smtp_server", env_settings.SMTP_SERVER, "Serveur SMTP", "email", False),
            ("email.smtp_port", str(env_settings.SMTP_PORT), "Port SMTP", "email", False),
            ("email.smtp_username", env_settings.SMTP_USERNAME or "", "Nom d'utilisateur SMTP", "email", False),
            ("email.smtp_password", env_settings.SMTP_PASSWORD or "", "Mot de passe SMTP", "email", True),
            ("email.smtp_from_email", env_settings.SMTP_FROM_EMAIL, "Adresse email d'expédition", "email", False),
            ("email.smtp_use_tls", str(env_settings.SMTP_USE_TLS), "Utiliser TLS", "email", False),
            ("email.enable_alerts", str(env_settings.ENABLE_EMAIL_ALERTS), "Activer les alertes email", "email", False),
            ("email.alert_emails", ",".join(env_settings.ALERT_EMAILS), "Destinataires d'alertes", "email", False),
        ]
        
        for key, value, description, category, is_sensitive in default_settings:
            existing = db.query(AppSettings).filter(AppSettings.key == key).first()
            if not existing:
                SettingsService.set_setting(db, key, value, description, category, is_sensitive)