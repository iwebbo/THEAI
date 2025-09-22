from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import json

from api.deps import get_db
from models.server import Server
from models.security import SecurityScan, VulnerabilityType
from schemas.security import (
    SecurityScanCreate, 
    SecurityScanResponse,
    SecurityScanSummary,
    SecurityScanDetail,
    VulnerabilityReport
)
from services.security_scanner import SecurityScanner

router = APIRouter()

# Instance du scanner
scanner = SecurityScanner()

@router.post("/{server_id}/scan", response_model=SecurityScanResponse)
async def start_security_scan(
    server_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Lance un scan de sécurité pour un serveur spécifique
    """
    # Vérifier que le serveur existe
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Créer une entrée de scan avec statut "in_progress"
    db_scan = SecurityScan(
        server_id=server_id,
        status="in_progress",
        started_at=datetime.now(),
        risk_level="unknown"
    )
    db.add(db_scan)
    db.commit()
    db.refresh(db_scan)
    
    # Lancer le scan en arrière-plan
    background_tasks.add_task(
        run_security_scan,
        db_scan.id,
        server.hostname,
        server.ip_address
    )
    
    return {
        "scan_id": db_scan.id,
        "server_id": server_id,
        "status": "in_progress",
        "message": "Scan de sécurité lancé en arrière-plan"
    }

@router.get("/{server_id}/scans", response_model=List[SecurityScanSummary])
async def get_server_security_scans(
    server_id: int,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Récupère l'historique des scans de sécurité d'un serveur
    """
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    scans = db.query(SecurityScan)\
        .filter(SecurityScan.server_id == server_id)\
        .order_by(SecurityScan.started_at.desc())\
        .limit(limit)\
        .all()
    
    return scans

@router.get("/scan/{scan_id}", response_model=SecurityScanDetail)
async def get_security_scan_details(
    scan_id: int,
    db: Session = Depends(get_db)
):
    """
    Récupère les détails complets d'un scan de sécurité
    """
    scan = db.query(SecurityScan).filter(SecurityScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    # Parser les champs JSON s'ils sont stockés comme des chaînes
    if scan.vulnerabilities and isinstance(scan.vulnerabilities, str):
        try:
            scan.vulnerabilities = json.loads(scan.vulnerabilities)
        except:
            scan.vulnerabilities = []
    
    if scan.recommendations and isinstance(scan.recommendations, str):
        try:
            scan.recommendations = json.loads(scan.recommendations)
        except:
            scan.recommendations = []
    
    if scan.scan_details and isinstance(scan.scan_details, str):
        try:
            scan.scan_details = json.loads(scan.scan_details)
        except:
            scan.scan_details = {}
    
    if scan.detected_technologies and isinstance(scan.detected_technologies, str):
        try:
            scan.detected_technologies = json.loads(scan.detected_technologies)
        except:
            scan.detected_technologies = []
    
    if scan.open_ports and isinstance(scan.open_ports, str):
        try:
            scan.open_ports = json.loads(scan.open_ports)
        except:
            scan.open_ports = []
    
    return scan

@router.get("/vulnerabilities/summary", response_model=VulnerabilityReport)
async def get_vulnerabilities_summary(
    db: Session = Depends(get_db)
):
    """
    Récupère un résumé des vulnérabilités pour tous les serveurs
    """
    # Récupérer les derniers scans de chaque serveur
    latest_scans = db.query(SecurityScan)\
        .filter(SecurityScan.status == "completed")\
        .order_by(SecurityScan.server_id, SecurityScan.started_at.desc())\
        .all()
    
    # Agrégation des vulnérabilités
    total_vulnerabilities = 0
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0
    
    servers_at_risk = []
    
    # Traiter chaque scan
    processed_servers = set()
    for scan in latest_scans:
        if scan.server_id in processed_servers:
            continue
        processed_servers.add(scan.server_id)
        
        if scan.vulnerabilities:
            vulns = json.loads(scan.vulnerabilities) if isinstance(scan.vulnerabilities, str) else scan.vulnerabilities
            
            for vuln in vulns:
                total_vulnerabilities += 1
                severity = vuln.get("severity", "low").lower()
                
                if severity == "critical":
                    critical_count += 1
                elif severity == "high":
                    high_count += 1
                elif severity == "medium":
                    medium_count += 1
                else:
                    low_count += 1
            
            if scan.risk_level in ["critical", "high"]:
                server = db.query(Server).filter(Server.id == scan.server_id).first()
                servers_at_risk.append({
                    "server_id": scan.server_id,
                    "server_name": server.name if server else "Unknown",
                    "risk_level": scan.risk_level,
                    "vulnerabilities_count": len(vulns)
                })
    
    return {
        "total_vulnerabilities": total_vulnerabilities,
        "critical": critical_count,
        "high": high_count,
        "medium": medium_count,
        "low": low_count,
        "servers_at_risk": servers_at_risk,
        "last_update": datetime.now()
    }

@router.post("/scan/quick/{server_id}")
async def quick_security_check(
    server_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Effectue une vérification de sécurité rapide et sauvegarde en base
    """
    server = db.query(Server).filter(Server.id == server_id).first()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Créer une entrée de scan avec type "quick"
    db_scan = SecurityScan(
        server_id=server_id,
        status="in_progress",
        started_at=datetime.now(),
        risk_level="unknown"
    )
    db.add(db_scan)
    db.commit()
    db.refresh(db_scan)
    
    # Scan rapide synchrone
    results = {
        "server_id": server_id,
        "timestamp": datetime.now(),
        "checks": {}
    }
    
    vulnerabilities = []
    
    try:
        # 1. Vérification des ports critiques
        critical_ports = [22, 23, 139, 445, 3389, 5900, 6379, 9200, 27017]
        open_critical = []
        
        import socket
        for port in critical_ports:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex((server.ip_address, port))
            sock.close()
            
            if result == 0:
                open_critical.append(port)
                # Ajouter comme vulnérabilité si c'est un port dangereux
                if port in [23, 139, 445, 3389, 5900, 6379, 9200, 27017]:
                    port_names = {
                        23: "Telnet",
                        139: "NetBIOS", 
                        445: "SMB",
                        3389: "RDP",
                        5900: "VNC",
                        6379: "Redis",
                        9200: "Elasticsearch",
                        27017: "MongoDB"
                    }
                    vulnerabilities.append({
                        "severity": "high" if port in [23, 445, 6379, 9200, 27017] else "medium",
                        "type": "dangerous_port",
                        "port": port,
                        "description": f"Port {port} ({port_names.get(port, 'Service')}) ouvert",
                        "remediation": f"Fermer ou sécuriser le port {port}"
                    })
        
        results["checks"]["critical_ports"] = {
            "open": open_critical,
            "risk": "high" if len([p for p in open_critical if p in [23, 445, 6379, 9200, 27017]]) > 0 else "low"
        }
        
        # 2. Vérification SSL rapide si HTTPS
        if server.protocols and "http" in server.protocols and server.use_https:
            try:
                import ssl
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                
                with socket.create_connection((server.hostname, 443), timeout=5) as sock:
                    with context.wrap_socket(sock, server_hostname=server.hostname) as ssock:
                        cert = ssock.getpeercert()
                        version = ssock.version()
                        
                        secure = version not in ["SSLv2", "SSLv3", "TLSv1", "TLSv1.1"]
                        
                        if not secure:
                            vulnerabilities.append({
                                "severity": "high",
                                "type": "ssl_weak",
                                "description": f"Protocole SSL/TLS obsolète: {version}",
                                "remediation": "Utiliser TLS 1.2 ou supérieur"
                            })
                        
                        results["checks"]["ssl"] = {
                            "protocol": version,
                            "secure": secure,
                            "risk": "high" if not secure else "low"
                        }
            except Exception as e:
                results["checks"]["ssl"] = {"error": str(e), "risk": "unknown"}
        
        # Calculer le risque global
        risks = [check.get("risk", "low") for check in results["checks"].values()]
        if "high" in risks:
            results["overall_risk"] = "high"
            risk_level = "high"
        elif "medium" in risks:
            results["overall_risk"] = "medium"
            risk_level = "medium"
        else:
            results["overall_risk"] = "low"
            risk_level = "low"
        
        # Mettre à jour le scan en base de données
        db_scan.status = "completed"
        db_scan.completed_at = datetime.now()
        db_scan.risk_level = risk_level
        db_scan.vulnerabilities = json.dumps(vulnerabilities)
        db_scan.scan_details = json.dumps(results["checks"])
        db_scan.vulnerability_count = len(vulnerabilities)
        
        # Compter par sévérité
        db_scan.critical_count = sum(1 for v in vulnerabilities if v.get("severity") == "critical")
        db_scan.high_count = sum(1 for v in vulnerabilities if v.get("severity") == "high")
        db_scan.medium_count = sum(1 for v in vulnerabilities if v.get("severity") == "medium")
        db_scan.low_count = sum(1 for v in vulnerabilities if v.get("severity") == "low")
        
        # Générer des recommandations basiques
        recommendations = []
        if db_scan.high_count > 0 or db_scan.critical_count > 0:
            recommendations.append({
                "priority": "high",
                "category": "network",
                "action": "Sécuriser les ports dangereux",
                "details": "Des ports critiques sont ouverts et doivent être sécurisés"
            })
        
        if "ssl" in results["checks"] and not results["checks"]["ssl"].get("secure", True):
            recommendations.append({
                "priority": "high",
                "category": "ssl",
                "action": "Mettre à jour la configuration SSL/TLS",
                "details": "Le protocole SSL/TLS utilisé est obsolète"
            })
        
        db_scan.recommendations = json.dumps(recommendations)
        
        db.commit()
        db.refresh(db_scan)
        
        # Retourner le résultat avec l'ID du scan
        return {
            "scan_id": db_scan.id,
            "server_id": server_id,
            "status": "completed",
            "overall_risk": results["overall_risk"],
            "checks": results["checks"],
            "vulnerability_count": len(vulnerabilities),
            "message": "Quick scan completed successfully"
        }
        
    except Exception as e:
        # En cas d'erreur, marquer le scan comme échoué
        db_scan.status = "failed"
        db_scan.completed_at = datetime.now()
        db_scan.error_message = str(e)
        db.commit()
        
        raise HTTPException(
            status_code=500,
            detail=f"Error during quick scan: {str(e)}"
        )

# Fonction pour exécuter le scan en arrière-plan
async def run_security_scan(scan_id: int, hostname: str, ip_address: str):
    """
    Exécute le scan de sécurité complet en arrière-plan
    """
    from core.database import SessionLocal
    db = SessionLocal()
    
    try:
        # Récupérer le scan
        scan = db.query(SecurityScan).filter(SecurityScan.id == scan_id).first()
        if not scan:
            return
        
        # Exécuter le scan
        scanner = SecurityScanner()
        results = await scanner.full_security_scan(hostname, ip_address)
        
        # Mettre à jour la base de données avec les résultats
        scan.status = "completed"
        scan.completed_at = datetime.now()
        scan.risk_level = results.get("risk_level", "unknown")
        scan.vulnerabilities = json.dumps(results.get("vulnerabilities", []))
        scan.recommendations = json.dumps(results.get("recommendations", []))
        scan.scan_details = json.dumps(results.get("details", {}))
        scan.vulnerability_count = len(results.get("vulnerabilities", []))
        
        # Compter par sévérité
        critical_count = sum(1 for v in results.get("vulnerabilities", []) if v.get("severity") == "critical")
        high_count = sum(1 for v in results.get("vulnerabilities", []) if v.get("severity") == "high")
        medium_count = sum(1 for v in results.get("vulnerabilities", []) if v.get("severity") == "medium")
        low_count = sum(1 for v in results.get("vulnerabilities", []) if v.get("severity") == "low")
        
        scan.critical_count = critical_count
        scan.high_count = high_count
        scan.medium_count = medium_count
        scan.low_count = low_count
        
        db.commit()
        
        print(f"✅ Scan {scan_id} completed successfully")
        
    except Exception as e:
        print(f"❌ Error in scan {scan_id}: {str(e)}")
        
        # Marquer le scan comme échoué
        scan = db.query(SecurityScan).filter(SecurityScan.id == scan_id).first()
        if scan:
            scan.status = "failed"
            scan.completed_at = datetime.now()
            scan.error_message = str(e)
            db.commit()
    
    finally:
        db.close()

@router.delete("/scan/{scan_id}")
async def delete_security_scan(
    scan_id: int,
    db: Session = Depends(get_db)
):
    """
    Supprime un scan de sécurité
    """
    scan = db.query(SecurityScan).filter(SecurityScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    db.delete(scan)
    db.commit()
    
    return {"message": "Scan deleted successfully"}

@router.get("/recommendations/{server_id}")
async def get_security_recommendations(
    server_id: int,
    db: Session = Depends(get_db)
):
    """
    Récupère les recommandations de sécurité pour un serveur
    basées sur le dernier scan
    """
    # Récupérer le dernier scan complété
    latest_scan = db.query(SecurityScan)\
        .filter(SecurityScan.server_id == server_id)\
        .filter(SecurityScan.status == "completed")\
        .order_by(SecurityScan.started_at.desc())\
        .first()
    
    if not latest_scan:
        return {
            "server_id": server_id,
            "message": "Aucun scan de sécurité disponible",
            "recommendations": []
        }
    
    recommendations = json.loads(latest_scan.recommendations) if latest_scan.recommendations else []
    
    return {
        "server_id": server_id,
        "scan_date": latest_scan.completed_at,
        "risk_level": latest_scan.risk_level,
        "recommendations": recommendations
    }