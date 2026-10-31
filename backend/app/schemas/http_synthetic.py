"""Schémas Pydantic (v2) : HTTP/HTTPS synthetic monitoring."""
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HttpSyntheticCheckRequest(BaseModel):
    url: Optional[str] = Field(None, max_length=2048, description="URL à tester (https:// par défaut si absent)")
    server_id: Optional[int] = Field(None, description="Serveur existant : l'URL est déduite de ses champs http_*")
    method: Literal["GET", "HEAD"] = "GET"
    timeout: int = Field(10, ge=1, le=60)
    verify_tls: bool = Field(True, description="Valider la chaîne de confiance pour la requête HTTP")
    follow_redirects: bool = True
    probe_protocols: bool = Field(True, description="Tester le support TLS 1.0/1.1/1.2/1.3")
    save: bool = Field(True, description="Stocker le résultat en base")

    @model_validator(mode="after")
    def _need_target(self):
        if not self.url and self.server_id is None:
            raise ValueError("url ou server_id requis")
        return self


class HttpSyntheticCheckResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    server_id: Optional[int] = None
    url: str
    scheme: str
    hostname: str
    port: int
    resolved_ip: Optional[str] = None

    status: str
    error: Optional[str] = None
    warnings: List[str] = []

    http_status_code: Optional[int] = None
    http_version: Optional[str] = None
    final_url: Optional[str] = None
    redirect_count: int = 0
    redirects: List[Dict[str, Any]] = []
    response_headers: Optional[Dict[str, str]] = None
    security_headers: Optional[Dict[str, Any]] = None
    response_size: Optional[int] = None

    dns_ms: Optional[float] = None
    tcp_ms: Optional[float] = None
    tls_ms: Optional[float] = None
    ttfb_ms: Optional[float] = None
    total_ms: Optional[float] = None

    tls_version: Optional[str] = None
    cipher_suite: Optional[str] = None
    cipher_bits: Optional[int] = None
    alpn_protocol: Optional[str] = None
    tls_trusted: Optional[bool] = None
    tls_verify_error: Optional[str] = None
    tls_protocols: Optional[Dict[str, Any]] = None

    cert_subject_cn: Optional[str] = None
    cert_issuer_cn: Optional[str] = None
    cert_not_before: Optional[datetime] = None
    cert_not_after: Optional[datetime] = None
    cert_days_remaining: Optional[int] = None
    cert_fingerprint_sha256: Optional[str] = None
    cert_hostname_match: Optional[bool] = None
    certificate: Optional[Dict[str, Any]] = None
    chain: Optional[List[Dict[str, Any]]] = None

    checked_at: Optional[datetime] = None