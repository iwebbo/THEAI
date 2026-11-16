from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _clean_url(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not (v.startswith("http://") or v.startswith("https://")):
        raise ValueError("l'URL doit commencer par http:// ou https://")
    return v.rstrip("/")


class AppTypeOut(BaseModel):
    key: str
    label: str
    auth_fields: List[str]
    auth_required: bool
    auth_hint: str
    url_example: str
    channels: List[str]


class TargetBase(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url: Optional[str] = None
    username: Optional[str] = Field(None, max_length=255)
    verify_tls: bool = True
    ca_file: Optional[str] = Field(None, max_length=500)
    channel: Optional[str] = Field(None, max_length=20)
    enabled: bool = True

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        return _clean_url(v)


class TargetCreate(TargetBase):
    app_type: str = Field(..., min_length=1, max_length=50)
    password: Optional[str] = None
    token: Optional[str] = None


class TargetUpdate(BaseModel):
    """PATCH : seuls les champs envoyés sont modifiés. Secret: "" ou null = effacer."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    url: Optional[str] = None
    username: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = None
    token: Optional[str] = None
    verify_tls: Optional[bool] = None
    ca_file: Optional[str] = Field(None, max_length=500)
    channel: Optional[str] = Field(None, max_length=20)
    enabled: Optional[bool] = None

    @field_validator("url")
    @classmethod
    def _url(cls, v):
        return _clean_url(v)


class TargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    app_type: str
    app_label: Optional[str] = None
    name: str
    url: Optional[str] = None
    configured: bool = False
    username: Optional[str] = None
    has_password: bool = False
    has_token: bool = False
    verify_tls: bool
    ca_file: Optional[str] = None
    channel: Optional[str] = None
    enabled: bool
    last_checked_at: Optional[datetime] = None
    last_local_status: Optional[str] = None
    installed_version: Optional[str] = None
    latest_version: Optional[str] = None
    update_status: str
    new_major: Optional[str] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    target_id: int
    app_type: str
    checked_at: datetime
    local_status: str
    local_version: Optional[str] = None
    local_raw: Optional[str] = None
    local_error: Optional[str] = None
    local_latency_ms: Optional[int] = None
    upstream_status: str
    upstream_latest: Optional[str] = None
    upstream_latest_raw: Optional[str] = None
    upstream_by_major: Optional[Dict[str, str]] = None
    upstream_source: Optional[str] = None
    upstream_docs_url: Optional[str] = None
    upstream_archived: Optional[bool] = None
    upstream_error: Optional[str] = None
    upstream_latency_ms: Optional[int] = None
    channel: Optional[str] = None
    update_status: str
    target_version: Optional[str] = None
    new_major: Optional[str] = None


class CheckRunOut(BaseModel):
    """Résultat d'un contrôle déclenché à la demande."""
    target: TargetOut
    check: CheckOut


class CheckAllOut(BaseModel):
    checked: int
    skipped: int
    results: List[CheckRunOut]


class SummaryOut(BaseModel):
    total: int
    configured: int
    not_configured: int
    up_to_date: int
    behind: int
    errors: int
    last_checked_at: Optional[datetime] = None
