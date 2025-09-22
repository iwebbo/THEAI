from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum
from sqlalchemy.sql import func
import enum

from core.database import Base

class MonitoringProtocol(enum.Enum):
    ICMP = "icmp"  # Ping
    HTTP = "http"  # HTTP/HTTPS
    SSH = "ssh"    # SSH

class ServerStatus(enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"

class Server(Base):
    __tablename__ = "servers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    hostname = Column(String(255), nullable=False)
    ip_address = Column(String(15), nullable=False)
    description = Column(Text, nullable=True)
    
    # Monitoring configuration
    enabled = Column(Boolean, default=True)
    protocols = Column(Text, nullable=False, default="icmp")  # Comma-separated list of protocols
    
    # For HTTP monitoring
    http_port = Column(Integer, nullable=True)
    http_path = Column(String(255), default="/")
    use_https = Column(Boolean, default=False)
    
    # For SSH monitoring
    ssh_port = Column(Integer, nullable=True, default=22)
    ssh_username = Column(String(255), nullable=True)
    ssh_password = Column(String(255), nullable=True)
    ssh_key_path = Column(String(255), nullable=True)
    
    # Status information
    status = Column(String(20), default=ServerStatus.UNKNOWN.value)
    last_check = Column(DateTime, nullable=True)
    last_status_change = Column(DateTime, nullable=True)
    response_time = Column(Integer, nullable=True)  # in milliseconds
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())