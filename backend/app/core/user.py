# backend/app/core/init_db.py
from sqlalchemy.orm import Session
from models.user import User
from core.database import SessionLocal
from core.config import settings
import logging

logger = logging.getLogger(__name__)

def init_default_user():
    """
    Initialise l'utilisateur par défaut depuis les variables d'environnement
    """
    db = SessionLocal()
    try:
        # Vérifier si l'utilisateur par défaut existe déjà
        existing_user = db.query(User).filter(User.username == settings.DEFAULT_ADMIN_USERNAME).first()
        
        if existing_user:
            logger.info(f"Default user '{settings.DEFAULT_ADMIN_USERNAME}' already exists")
            return existing_user
        
        # Créer l'utilisateur par défaut
        default_user = User(
            username=settings.DEFAULT_ADMIN_USERNAME,
            email=settings.DEFAULT_ADMIN_EMAIL,
            hashed_password=User.hash_password(settings.DEFAULT_ADMIN_PASSWORD),
            is_active=True,
            is_admin=True
        )
        
        db.add(default_user)
        db.commit()
        db.refresh(default_user)
        
        logger.info(f"Created default admin user: {settings.DEFAULT_ADMIN_USERNAME}")
        return default_user
        
    except Exception as e:
        logger.error(f"Error creating default user: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def init_database():
    """
    Initialise la base de données avec les données par défaut
    """
    logger.info("Initializing database...")
    
    # Créer l'utilisateur par défaut
    init_default_user()
    
    logger.info("Database initialization completed")