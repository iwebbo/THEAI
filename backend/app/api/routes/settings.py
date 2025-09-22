from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from api.deps import get_db
from models.settings import AppSettings
from schemas.settings import Setting, SettingCreate, SettingUpdate, EmailConfig, EmailConfigUpdate, SettingsResponse
from services.settings import SettingsService
from services.email import EmailService

router = APIRouter()

@router.get("/", response_model=SettingsResponse)
async def get_all_settings(db: Session = Depends(get_db)):
    """
    Récupère toutes les configurations de l'application
    """
    # Initialiser les paramètres par défaut si nécessaire
    SettingsService.initialize_default_settings(db)
    
    # Récupérer la configuration email
    email_config = SettingsService.get_email_config(db)
    
    return SettingsResponse(
        email=email_config,
        general={}
    )

@router.get("/email", response_model=EmailConfig)
async def get_email_settings(db: Session = Depends(get_db)):
    """
    Récupère la configuration email
    """
    return SettingsService.get_email_config(db)

@router.put("/email", response_model=EmailConfig)
async def update_email_settings(
    config_update: EmailConfigUpdate, 
    db: Session = Depends(get_db)
):
    """
    Met à jour la configuration email
    """
    # Convertir en dictionnaire en excluant les valeurs None
    config_dict = config_update.dict(exclude_unset=True)
    
    # Mettre à jour la configuration
    updated_config = SettingsService.update_email_config(db, config_dict)
    
    return updated_config

@router.post("/email/test")
async def test_email_configuration(db: Session = Depends(get_db)):
    """
    Teste la configuration email actuelle
    """
    # Récupérer la configuration email depuis la base de données
    email_config = SettingsService.get_email_config(db)
    
    if not email_config.enable_email_alerts:
        return {"success": False, "message": "Les alertes email sont désactivées"}
    
    if not email_config.alert_emails:
        return {"success": False, "message": "Aucun destinataire configuré"}
    
    if not email_config.smtp_username or not email_config.smtp_password:
        return {"success": False, "message": "Identifiants SMTP manquants"}
    
    # Utiliser temporairement la nouvelle configuration pour le test
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from datetime import datetime
    
    try:
        # Créer le message de test
        msg = MIMEMultipart('alternative')
        msg['From'] = email_config.smtp_from_email
        msg['To'] = ', '.join(email_config.alert_emails)
        msg['Subject'] = "Test de configuration email - Server Monitor"
        
        body = f"""
Test de configuration email

Ce message confirme que la configuration email fonctionne correctement.

Paramètres testés:
- Serveur SMTP: {email_config.smtp_server}:{email_config.smtp_port}
- TLS: {'Activé' if email_config.smtp_use_tls else 'Désactivé'}
- Destinataires: {', '.join(email_config.alert_emails)}

Date/Heure du test: {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}

---
Système de monitoring automatique
        """.strip()
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # Se connecter au serveur SMTP et envoyer l'email
        with smtplib.SMTP(email_config.smtp_server, email_config.smtp_port) as server:
            if email_config.smtp_use_tls:
                server.starttls()
            
            server.login(email_config.smtp_username, email_config.smtp_password)
            server.send_message(msg)
        
        return {
            "success": True,
            "message": "Email de test envoyé avec succès",
            "recipients": email_config.alert_emails
        }
        
    except Exception as e:
        return {
            "success": False,
            "message": f"Erreur lors de l'envoi du test: {str(e)}"
        }

@router.get("/categories", response_model=List[str])
async def get_setting_categories(db: Session = Depends(get_db)):
    """
    Récupère toutes les catégories de paramètres
    """
    categories = db.query(AppSettings.category).distinct().all()
    return [cat[0] for cat in categories]

@router.get("/category/{category}", response_model=List[Setting])
async def get_settings_by_category(category: str, db: Session = Depends(get_db)):
    """
    Récupère tous les paramètres d'une catégorie
    """
    settings = db.query(AppSettings).filter(AppSettings.category == category).all()
    
    # Masquer les valeurs sensibles
    for setting in settings:
        if setting.is_sensitive and setting.value:
            setting.value = "***"
    
    return settings

@router.post("/", response_model=Setting)
async def create_setting(setting_in: SettingCreate, db: Session = Depends(get_db)):
    """
    Crée un nouveau paramètre
    """
    # Vérifier si le paramètre existe déjà
    existing = db.query(AppSettings).filter(AppSettings.key == setting_in.key).first()
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Setting with key '{setting_in.key}' already exists"
        )
    
    setting = SettingsService.set_setting(
        db=db,
        key=setting_in.key,
        value=setting_in.value or "",
        description=setting_in.description,
        category=setting_in.category,
        is_sensitive=setting_in.is_sensitive
    )
    
    return setting

@router.put("/{setting_key}", response_model=Setting)
async def update_setting(
    setting_key: str, 
    setting_update: SettingUpdate, 
    db: Session = Depends(get_db)
):
    """
    Met à jour un paramètre existant
    """
    setting = db.query(AppSettings).filter(AppSettings.key == setting_key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    if setting_update.value is not None:
        setting.value = setting_update.value
    if setting_update.description is not None:
        setting.description = setting_update.description
    
    db.commit()
    db.refresh(setting)
    
    return setting

@router.delete("/{setting_key}")
async def delete_setting(setting_key: str, db: Session = Depends(get_db)):
    """
    Supprime un paramètre
    """
    setting = db.query(AppSettings).filter(AppSettings.key == setting_key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    
    db.delete(setting)
    db.commit()
    
    return {"message": "Setting deleted successfully"}