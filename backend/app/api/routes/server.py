from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from api.deps import get_db
from models.server import Server, ServerStatus
from schemas.server import ServerCreate, ServerUpdate, Server as ServerSchema, ServerCheck
from services.monitoring import MonitoringService

router = APIRouter()

@router.post("/", response_model=ServerSchema, status_code=status.HTTP_201_CREATED)
async def create_server(server_in: ServerCreate, db: Session = Depends(get_db)):
    """
    Crée un nouveau serveur à monitorer
    """
    # Création d'une nouvelle instance de serveur
    db_server = Server(
        name=server_in.name,
        hostname=server_in.hostname,
        ip_address=server_in.ip_address,
        description=server_in.description,
        enabled=server_in.enabled,
        protocols=server_in.protocols,
        http_port=server_in.http_port,
        http_path=server_in.http_path,
        use_https=server_in.use_https,
        ssh_port=server_in.ssh_port,
        ssh_username=server_in.ssh_username,
        ssh_password=server_in.ssh_password,
        ssh_key_path=server_in.ssh_key_path,
        tcp_port=server_in.tcp_port,
        tcp_timeout=server_in.tcp_timeout,
        status=ServerStatus.UNKNOWN.value
    )
    
    db.add(db_server)
    db.commit()
    db.refresh(db_server)
    
    # Vérification automatique après création
    check_result = await MonitoringService.check_server(db_server)
    
    # Mise à jour du statut avec les résultats
    db_server.status = check_result.status
    db_server.last_check = datetime.now()
    db_server.response_time = check_result.response_time
    db_server.last_status_change = datetime.now()
    
    db.add(db_server)
    db.commit()
    db.refresh(db_server)
    
    return db_server

@router.get("/", response_model=List[ServerSchema])
async def read_servers(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """
    Récupère la liste des serveurs
    """
    servers = db.query(Server).offset(skip).limit(limit).all()
    return servers

@router.get("/{server_id}", response_model=ServerSchema)
async def read_server(server_id: int, db: Session = Depends(get_db)):
    """
    Récupère un serveur spécifique par son ID
    """
    db_server = db.query(Server).filter(Server.id == server_id).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    return db_server

@router.put("/{server_id}", response_model=ServerSchema)
async def update_server(
    server_id: int, 
    server_in: ServerUpdate, 
    db: Session = Depends(get_db)
):
    """
    Met à jour un serveur existant
    """
    db_server = db.query(Server).filter(Server.id == server_id).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Mise à jour des champs spécifiés
    server_data = server_in.dict(exclude_unset=True)
    for key, value in server_data.items():
        setattr(db_server, key, value)
    
    db.add(db_server)
    db.commit()
    db.refresh(db_server)
    return db_server

@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_server(server_id: int, db: Session = Depends(get_db)):
    """
    Supprime un serveur
    """
    db_server = db.query(Server).filter(Server.id == server_id).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    
    db.delete(db_server)
    db.commit()
    return None

@router.get("/{server_id}/check", response_model=ServerCheck)
async def check_server_status(server_id: int, db: Session = Depends(get_db)):
    """
    Vérifie l'état d'un serveur et met à jour son statut dans la base de données
    """
    db_server = db.query(Server).filter(Server.id == server_id).first()
    if db_server is None:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Effectue la vérification du serveur
    check_result = await MonitoringService.check_server(db_server)
    
    # Met à jour le statut et les informations de monitoring dans la base de données
    old_status = db_server.status
    db_server.status = check_result.status
    db_server.last_check = datetime.now()
    db_server.response_time = check_result.response_time
    
    # Si le statut a changé, enregistre l'heure du changement
    if old_status != check_result.status:
        db_server.last_status_change = datetime.now()
    
    db.add(db_server)
    db.commit()
    db.refresh(db_server)
    
    return check_result

@router.get("/check/all", response_model=List[ServerCheck])
async def check_all_servers(db: Session = Depends(get_db)):
    """
    Vérifie l'état de tous les serveurs activés
    """
    active_servers = db.query(Server).filter(Server.enabled == True).all()
    results = []
    
    for server in active_servers:
        check_result = await MonitoringService.check_server(server)
        
        # Met à jour le statut et les informations de monitoring
        old_status = server.status
        server.status = check_result.status
        server.last_check = datetime.now()
        server.response_time = check_result.response_time
        
        # Si le statut a changé, enregistre l'heure du changement
        if old_status != check_result.status:
            server.last_status_change = datetime.now()
        
        results.append(check_result)
    
    # Commit tous les changements à la fois
    db.add_all(active_servers)
    db.commit()
    
    return results