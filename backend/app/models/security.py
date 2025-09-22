from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, JSON, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from core.database import Base

class RiskLevel(enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"

class ScanStatus(enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class VulnerabilityType(enum.Enum):
    SSL_VULNERABLE = "ssl_vulnerable"
    OPEN_PORT = "open_port"
    WEAK_CIPHER = "weak_cipher"
    MISSING_HEADER = "missing_header"
    EXPOSED_SERVICE = "exposed_service"
    DEFAULT_CREDENTIALS = "default_credentials"
    SQL_INJECTION = "sql_injection"
    XSS = "xss"
    PATH_TRAVERSAL = "path_traversal"
    INFORMATION_DISCLOSURE = "information_disclosure"
    CVE = "cve"
    MISCONFIGURATION = "misconfiguration"
    OTHER = "other"

class SecurityScan(Base):
    """
    Modèle pour stocker les résultats des scans de sécurité
    """
    __tablename__ = "security_scans"
    
    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id"), nullable=False)
    
    # Statut et timing
    status = Column(String(20), default=ScanStatus.PENDING.value)
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)
    
    # Résultats globaux
    risk_level = Column(String(20), default=RiskLevel.UNKNOWN.value)
    vulnerability_count = Column(Integer, default=0)
    
    # Compteurs par sévérité
    critical_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    
    # Détails du scan (JSON)
    vulnerabilities = Column(JSON, nullable=True)  # Liste des vulnérabilités trouvées
    recommendations = Column(JSON, nullable=True)  # Recommandations de sécurité
    scan_details = Column(JSON, nullable=True)     # Détails techniques du scan
    
    # Technologies détectées
    detected_technologies = Column(JSON, nullable=True)
    
    # Ports ouverts
    open_ports = Column(JSON, nullable=True)
    
    # Erreurs éventuelles
    error_message = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relations
    server = relationship("Server", backref="security_scans")


class Vulnerability(Base):
    """
    Modèle pour stocker les vulnérabilités individuelles
    (optionnel, pour une analyse plus fine)
    """
    __tablename__ = "vulnerabilities"
    
    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("security_scans.id"), nullable=False)
    server_id = Column(Integer, ForeignKey("servers.id"), nullable=False)
    
    # Type et sévérité
    vulnerability_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)  # critical, high, medium, low
    
    # Détails
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    # Informations techniques
    port = Column(Integer, nullable=True)
    service = Column(String(100), nullable=True)
    cve_id = Column(String(50), nullable=True)
    
    # Remediation
    remediation = Column(Text, nullable=True)
    
    # Statut
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)
    
    # Timestamps
    detected_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relations
    scan = relationship("SecurityScan", backref="vulnerability_items")
    server = relationship("Server", backref="vulnerabilities")


class SecurityConfiguration(Base):
    """
    Modèle pour stocker les configurations de sécurité par serveur
    """
    __tablename__ = "security_configurations"
    
    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id"), unique=True, nullable=False)
    
    # Configuration du scan
    scan_frequency = Column(String(20), default="weekly")  # daily, weekly, monthly
    scan_depth = Column(String(20), default="standard")    # quick, standard, deep
    
    # Ports spécifiques à scanner
    custom_ports = Column(JSON, nullable=True)  # Liste de ports additionnels
    exclude_ports = Column(JSON, nullable=True)  # Ports à ignorer
    
    # Tests spécifiques
    enable_ssl_scan = Column(Boolean, default=True)
    enable_web_scan = Column(Boolean, default=True)
    enable_dns_scan = Column(Boolean, default=True)
    enable_cve_scan = Column(Boolean, default=True)
    
    # Notifications
    notify_on_critical = Column(Boolean, default=True)
    notify_on_high = Column(Boolean, default=True)
    notification_email = Column(String(255), nullable=True)
    
    # Seuils d'alerte
    max_open_ports = Column(Integer, default=10)  # Alerte si plus de X ports ouverts
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relations
    server = relationship("Server", backref="security_config", uselist=False)