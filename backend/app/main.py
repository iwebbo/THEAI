from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sys
import os
import logging

# Ajouter le répertoire courant au chemin Python
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

# Import des routes
from api.routes.server import router as servers_router
from api.routes.security import router as security_router
from api.routes.settings import router as settings_router
from core.config import settings
from core.database import Base, engine
from core.user import init_database
from tasks.scheduler import start_scheduler
from api.routes.auth import router as auth_router

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Création des tables dans la base de données
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API pour le monitoring et la sécurité des serveurs",
    version=settings.PROJECT_VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclusion des routes de l'API
app.include_router(servers_router, prefix=f"{settings.API_V1_STR}/servers", tags=["servers"])
app.include_router(settings_router, prefix=f"{settings.API_V1_STR}/settings", tags=["settings"])
app.include_router(security_router, prefix=f"{settings.API_V1_STR}/security", tags=["security"])
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["authentication"])

@app.on_event("startup")
async def startup_event():
    """Événement exécuté au démarrage de l'application"""
    print("Starting THEAI Monitoring Platform")
    
    try:
        init_database()
        logger.info(f"Default admin user available: {settings.DEFAULT_ADMIN_USERNAME}")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

    # Démarrer le scheduler de monitoring
    start_scheduler()
    
    # Vérifier les outils de sécurité disponibles
    await check_security_tools()

@app.get("/")
def root():
    return {
        "message": "THEAI - Monitoring API",
        "docs": "/docs",
        "version": settings.PROJECT_VERSION,
        "features": {
            "monitoring": True,
            "security_scanning": True,
            "vulnerability_detection": True
        }
    }

@app.get("/health")
def health_check():
    """Endpoint de santé pour vérifier que l'API fonctionne"""
    return {
        "status": "healthy",
        "service": "monitoring-api",
        "security_scanner": "enabled"
    }

async def check_security_tools():
    """Vérifie la disponibilité des outils de sécurité"""
    import subprocess
    
    tools = {
        "nmap": False,
        "ping": False,
        "dns": False,
        "ssl": True  # Toujours disponible via Python
    }
    
    # Vérifier nmap
    try:
        result = subprocess.run(["nmap", "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            tools["nmap"] = True
            print("✅ Nmap is available")
    except:
        print("⚠️ Nmap not found - port scanning will be limited")
    
    # Vérifier ping
    try:
        result = subprocess.run(["ping", "-c", "1", "127.0.0.1"], capture_output=True)
        if result.returncode == 0:
            tools["ping"] = True
            print("✅ Ping is available")
    except:
        print("⚠️ Ping not found - ICMP checks will be limited")
    
    # Vérifier DNS
    try:
        import dns.resolver
        tools["dns"] = True
        print("✅ DNS module is available")
    except:
        print("⚠️ DNS module not available - DNS checks will be limited")
    
    return tools

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)