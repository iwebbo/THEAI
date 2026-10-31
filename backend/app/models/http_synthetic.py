"""Modèle SQLAlchemy : résultats des checks HTTP/HTTPS synthétiques."""
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from core.database import Base


class HttpSyntheticCheck(Base):
    __tablename__ = "http_synthetic_checks"

    id = Column(Integer, primary_key=True, index=True)
    server_id = Column(Integer, ForeignKey("servers.id", ondelete="SET NULL"), nullable=True, index=True)

    # Cible
    url = Column(String(2048), nullable=False)
    scheme = Column(String(8), nullable=False)
    hostname = Column(String(255), nullable=False, index=True)
    port = Column(Integer, nullable=False)
    resolved_ip = Column(String(64), nullable=True)

    # Résultat global
    status = Column(String(16), nullable=False, index=True)  # online | warning | offline
    error = Column(Text, nullable=True)
    warnings = Column(JSONB, nullable=False, default=list)

    # HTTP
    http_status_code = Column(Integer, nullable=True)
    http_version = Column(String(16), nullable=True)
    final_url = Column(String(2048), nullable=True)
    redirect_count = Column(Integer, nullable=False, default=0)
    redirects = Column(JSONB, nullable=False, default=list)
    response_headers = Column(JSONB, nullable=True)
    security_headers = Column(JSONB, nullable=True)
    response_size = Column(Integer, nullable=True)

    # Timings (ms)
    dns_ms = Column(Float, nullable=True)
    tcp_ms = Column(Float, nullable=True)
    tls_ms = Column(Float, nullable=True)
    ttfb_ms = Column(Float, nullable=True)
    total_ms = Column(Float, nullable=True)

    # TLS négocié
    tls_version = Column(String(16), nullable=True)
    cipher_suite = Column(String(128), nullable=True)
    cipher_bits = Column(Integer, nullable=True)
    alpn_protocol = Column(String(32), nullable=True)
    tls_trusted = Column(Boolean, nullable=True)
    tls_verify_error = Column(Text, nullable=True)
    tls_protocols = Column(JSONB, nullable=True)  # support TLS 1.0 → 1.3

    # Certificat (colonnes requêtables) + détail complet en JSONB
    cert_subject_cn = Column(String(255), nullable=True)
    cert_issuer_cn = Column(String(255), nullable=True)
    cert_not_before = Column(DateTime(timezone=True), nullable=True)
    cert_not_after = Column(DateTime(timezone=True), nullable=True, index=True)
    cert_days_remaining = Column(Integer, nullable=True)
    cert_fingerprint_sha256 = Column(String(128), nullable=True)
    cert_hostname_match = Column(Boolean, nullable=True)
    certificate = Column(JSONB, nullable=True)
    chain = Column(JSONB, nullable=True)

    checked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        Index("ix_http_synth_url_checked", "url", "checked_at"),
    )