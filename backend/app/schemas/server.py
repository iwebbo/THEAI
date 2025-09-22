from pydantic import BaseModel, Field, IPvAnyAddress, validator
from typing import Optional, List, Union
from datetime import datetime
from enum import Enum

class MonitoringProtocol(str, Enum):
    ICMP = "icmp"
    HTTP = "http"
    SSH = "ssh"

class ServerStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"

class ServerBase(BaseModel):
    name: str
    hostname: str
    ip_address: str
    description: Optional[str] = None
    enabled: bool = True
    protocols: str = "icmp"  # Comma-separated list of protocol names
    
    # HTTP specific settings
    http_port: Optional[int] = None
    http_path: Optional[str] = "/"
    use_https: bool = False
    
    # SSH specific settings
    ssh_port: Optional[int] = 22
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_key_path: Optional[str] = None
    
    @validator('protocols')
    def validate_protocols(cls, v):
        valid_protocols = [p.value for p in MonitoringProtocol]
        protocols = v.split(',')
        for protocol in protocols:
            if protocol not in valid_protocols:
                raise ValueError(f"Invalid protocol: {protocol}. Must be one of {valid_protocols}")
        return v

class ServerCreate(ServerBase):
    pass

class ServerUpdate(ServerBase):
    name: Optional[str] = None
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    protocols: Optional[str] = None

class Server(ServerBase):
    id: int
    status: ServerStatus = ServerStatus.UNKNOWN
    last_check: Optional[datetime] = None
    last_status_change: Optional[datetime] = None
    response_time: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        orm_mode = True

class ServerCheck(BaseModel):
    id: int
    status: ServerStatus
    response_time: Optional[int] = None
    message: Optional[str] = None
    last_check: datetime