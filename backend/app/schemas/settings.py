from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class SettingBase(BaseModel):
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    category: str = "general"
    is_sensitive: bool = False

class SettingCreate(SettingBase):
    pass

class SettingUpdate(BaseModel):
    value: Optional[str] = None
    description: Optional[str] = None

class Setting(SettingBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        orm_mode = True

class EmailConfig(BaseModel):
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_use_tls: bool = True
    enable_email_alerts: bool = False
    alert_emails: List[str] = []

class EmailConfigUpdate(BaseModel):
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    enable_email_alerts: Optional[bool] = None
    alert_emails: Optional[List[str]] = None

class SettingsResponse(BaseModel):
    email: EmailConfig
    general: Dict[str, Any] = {}