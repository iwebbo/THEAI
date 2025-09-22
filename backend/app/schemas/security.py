from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class RiskLevel(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"

class ScanStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class VulnerabilitySeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"

# Vulnerability schemas
class VulnerabilityBase(BaseModel):
    severity: VulnerabilitySeverity
    type: str
    description: str
    port: Optional[int] = None
    service: Optional[str] = None
    cve: Optional[str] = None
    remediation: Optional[str] = None

class VulnerabilityDetail(VulnerabilityBase):
    id: Optional[int] = None
    detected_at: Optional[datetime] = None
    is_resolved: bool = False
    
    class Config:
        orm_mode = True

# Security scan schemas
class SecurityScanBase(BaseModel):
    server_id: int
    scan_depth: Optional[str] = "standard"  # quick, standard, deep
    custom_ports: Optional[List[int]] = None

class SecurityScanCreate(SecurityScanBase):
    pass

class SecurityScanResponse(BaseModel):
    scan_id: int
    server_id: int
    status: ScanStatus
    message: Optional[str] = None
    
    class Config:
        orm_mode = True

class SecurityScanSummary(BaseModel):
    id: int
    server_id: int
    status: ScanStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    risk_level: RiskLevel
    vulnerability_count: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    
    class Config:
        orm_mode = True

class SecurityScanDetail(SecurityScanSummary):
    vulnerabilities: Optional[List[Dict[str, Any]]] = []
    recommendations: Optional[List[Dict[str, Any]]] = []
    scan_details: Optional[Dict[str, Any]] = {}
    detected_technologies: Optional[List[Dict[str, Any]]] = []
    open_ports: Optional[List[Dict[str, Any]]] = []
    error_message: Optional[str] = None
    
    class Config:
        orm_mode = True

# Quick scan response
class QuickScanResult(BaseModel):
    server_id: int
    timestamp: datetime
    overall_risk: RiskLevel
    checks: Dict[str, Any]

# Vulnerability report
class ServerRisk(BaseModel):
    server_id: int
    server_name: str
    risk_level: RiskLevel
    vulnerabilities_count: int

class VulnerabilityReport(BaseModel):
    total_vulnerabilities: int
    critical: int
    high: int
    medium: int
    low: int
    servers_at_risk: List[ServerRisk]
    last_update: datetime

# Security recommendations
class SecurityRecommendation(BaseModel):
    priority: str  # critical, high, medium, low
    category: str  # ssl, web, network, general
    action: str
    details: str

class RecommendationsResponse(BaseModel):
    server_id: int
    scan_date: Optional[datetime] = None
    risk_level: Optional[RiskLevel] = None
    recommendations: List[SecurityRecommendation]

# Security configuration
class SecurityConfigBase(BaseModel):
    scan_frequency: Optional[str] = "weekly"  # daily, weekly, monthly
    scan_depth: Optional[str] = "standard"    # quick, standard, deep
    custom_ports: Optional[List[int]] = None
    exclude_ports: Optional[List[int]] = None
    enable_ssl_scan: bool = True
    enable_web_scan: bool = True
    enable_dns_scan: bool = True
    enable_cve_scan: bool = True
    notify_on_critical: bool = True
    notify_on_high: bool = True
    notification_email: Optional[str] = None
    max_open_ports: int = 10

class SecurityConfigCreate(SecurityConfigBase):
    server_id: int

class SecurityConfigUpdate(SecurityConfigBase):
    pass

class SecurityConfig(SecurityConfigBase):
    id: int
    server_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        orm_mode = True

# Dashboard statistics
class SecurityDashboard(BaseModel):
    total_servers: int
    servers_scanned: int
    total_vulnerabilities: int
    critical_vulnerabilities: int
    high_vulnerabilities: int
    recent_scans: List[SecurityScanSummary]
    high_risk_servers: List[ServerRisk]
    
class ScanScheduleRequest(BaseModel):
    server_ids: List[int]
    scan_type: str = "standard"  # quick, standard, deep
    schedule_time: Optional[datetime] = None  # None = maintenant