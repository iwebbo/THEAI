"""Modèle SQLAlchemy : cibles HTTP/HTTPS à surveiller (configuration des checks synthétiques).

`http_synthetic_targets`  = CE QU'ON DOIT CHECKER (configuration, 1 ligne par cible)
`http_synthetic_checks`   = RÉSULTAT de chaque check (historique, inchangé)
"""
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text, CheckConstraint, func,
)

from core.database import Base


class HttpSyntheticTarget(Base):
    __tablename__ = "http_synthetic_targets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=True)

    # Cible : une URL explicite et/ou un serveur existant (URL déduite de servers.http_* à chaque check)
    url = Column(String(2048), nullable=True)
    server_id = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), nullable=True, index=True)

    # Options (formulaire "Advanced options")
    method = Column(String(8), nullable=False, default="GET", server_default="GET")  # GET | HEAD
    timeout = Column(Integer, nullable=False, default=10, server_default="10")       # secondes
    verify_tls = Column(Boolean, nullable=False, default=True, server_default="true")
    follow_redirects = Column(Boolean, nullable=False, default=True, server_default="true")
    probe_protocols = Column(Boolean, nullable=False, default=True, server_default="true")

    # Planification
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    interval_seconds = Column(Integer, nullable=False, default=300, server_default="300")

    # Dernier état connu (mis à jour par le processor / les checks manuels)
    status = Column(String(16), nullable=False, default="unknown", server_default="unknown")  # unknown|online|warning|offline
    last_checked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_status_change = Column(DateTime(timezone=True), nullable=True)
    last_total_ms = Column(Float, nullable=True)
    last_error = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("url IS NOT NULL OR server_id IS NOT NULL", name="ck_http_target_has_target"),
        CheckConstraint("method IN ('GET', 'HEAD')", name="ck_http_target_method"),
        # Unicité de (server, url, méthode), NULL compris
        Index("uq_http_target_identity", func.coalesce(server_id, 0), func.coalesce(url, ""), method, unique=True),
    )
