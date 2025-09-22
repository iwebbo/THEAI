from sqlalchemy import create_engine, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import time
import os

from core.config import settings

# Fonction pour créer la base de données si elle n'existe pas
def create_database_if_not_exists():
    # Connexion à PostgreSQL sans spécifier de base de données
    postgres_uri = f"postgresql://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_SERVER}:{settings.POSTGRES_PORT}/postgres"
    
    # Attendre que PostgreSQL soit prêt (important pour Docker)
    retries = 5
    while retries > 0:
        try:
            # Vérifier si la base de données existe
            conn = psycopg2.connect(postgres_uri)
            conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cursor = conn.cursor()
            cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{settings.POSTGRES_DB}'")
            exists = cursor.fetchone()
            
            if not exists:
                print(f"Creating database {settings.POSTGRES_DB}...")
                cursor.execute(f"CREATE DATABASE {settings.POSTGRES_DB}")
                print(f"Database {settings.POSTGRES_DB} created successfully!")
            else:
                print(f"Database {settings.POSTGRES_DB} already exists.")
            
            cursor.close()
            conn.close()
            break
        except psycopg2.OperationalError as e:
            print(f"PostgreSQL is not ready yet: {e}")
            retries -= 1
            time.sleep(5)
    
    if retries == 0:
        print("Failed to connect to PostgreSQL after multiple attempts")
        raise Exception("Could not connect to PostgreSQL")

# Créer la base de données si nécessaire
create_database_if_not_exists()

# Création du moteur SQLAlchemy
engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)

# Session locale
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base pour les modèles
Base = declarative_base()

# Fonction utilitaire pour obtenir une session DB
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()