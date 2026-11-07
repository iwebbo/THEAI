"""Schémas Pydantic (v2) : cibles HTTP/HTTPS synthetic (configuration à checker)."""
from datetime import datetime
from typing import Literal, Optional
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _normalize_url(v: Optional[str]) -> Optional[str]:
    """Même règle que HttpSyntheticService.normalize_url + validation schéma/hostname."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if "://" not in v:
        v = "https://" + v
    parts = urlsplit(v)
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise ValueError("URL invalide : schéma http(s) et hostname requis")
    return v


class HttpSyntheticTargetBase(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    url: Optional[str] = Field(None, max_length=2048, description="URL à tester (https:// par défaut si absent)")
    server_id: Optional[int] = Field(None, description="Serveur existant : URL déduite de ses champs http_* (si url vide)")
    method: Literal["GET", "HEAD"] = "GET"
    timeout: int = Field(10, ge=1, le=60)
    verify_tls: bool = True
    follow_redirects: bool = True
    probe_protocols: bool = True
    enabled: bool = True
    interval_seconds: int = Field(300, ge=30, le=86400, description="Fréquence du processor")

    @field_validator("url")
    @classmethod
    def _norm_url(cls, v):
        return _normalize_url(v)


class HttpSyntheticTargetCreate(HttpSyntheticTargetBase):
    @model_validator(mode="after")
    def _need_target(self):
        if not self.url and self.server_id is None:
            raise ValueError("url ou server_id requis")
        return self


class HttpSyntheticTargetUpdate(BaseModel):
    """Mise à jour partielle : seuls les champs envoyés sont modifiés."""
    name: Optional[str] = Field(None, max_length=255)
    url: Optional[str] = Field(None, max_length=2048)
    server_id: Optional[int] = None
    method: Optional[Literal["GET", "HEAD"]] = None
    timeout: Optional[int] = Field(None, ge=1, le=60)
    verify_tls: Optional[bool] = None
    follow_redirects: Optional[bool] = None
    probe_protocols: Optional[bool] = None
    enabled: Optional[bool] = None
    interval_seconds: Optional[int] = Field(None, ge=30, le=86400)

    @field_validator("url")
    @classmethod
    def _norm_url(cls, v):
        return _normalize_url(v)


class HttpSyntheticTargetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str] = None
    url: Optional[str] = None
    server_id: Optional[int] = None
    method: str
    timeout: int
    verify_tls: bool
    follow_redirects: bool
    probe_protocols: bool
    enabled: bool
    interval_seconds: int

    status: str
    last_checked_at: Optional[datetime] = None
    last_status_change: Optional[datetime] = None
    last_total_ms: Optional[float] = None
    last_error: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class HttpSyntheticTargetCheckAllItem(BaseModel):
    target_id: int
    status: str
    error: Optional[str] = None
    check_id: Optional[int] = None
