from datetime import datetime, timezone

from sqlalchemy import (BigInteger, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, text)
from sqlalchemy.dialects.postgresql import JSONB

from core.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)  # UTC naïf (convention THEAI)


_NOW_UTC = text("(now() AT TIME ZONE 'utc')")


class VersionTarget(Base):
    """
    Réglages d'une instance à surveiller (URL + secrets) et son dernier état connu.

    Une ligne par application du registre est créée au démarrage avec `url` vide
    (« non configurée ») ; renseigner l'URL suffit à activer le contrôle. Plusieurs instances
    d'un même type sont possibles (nom différent). Les secrets sont chiffrés (Fernet) :
    ils ne sont JAMAIS renvoyés par l'API.
    """
    __tablename__ = "version_targets"

    id = Column(Integer, primary_key=True)
    app_type = Column(String(50), nullable=False, index=True)    # clé du registre : jenkins, grafana...
    name = Column(String(100), nullable=False)
    url = Column(String(500), nullable=True)                     # NULL = non configurée
    username = Column(String(255), nullable=True)
    password_enc = Column(Text, nullable=True)                   # chiffré
    token_enc = Column(Text, nullable=True)                      # chiffré
    verify_tls = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    ca_file = Column(String(500), nullable=True)
    channel = Column(String(20), nullable=True)                  # stable|weekly, lts|sts|any (selon l'app)
    enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))

    # Dernier état (dénormalisé : alimente la liste et le tableau de bord sans jointure)
    last_checked_at = Column(DateTime, nullable=True)            # UTC
    last_local_status = Column(String(20), nullable=True)        # ok | error | not_configured
    installed_version = Column(String(100), nullable=True)
    latest_version = Column(String(100), nullable=True)          # cible (même majeure que l'installée)
    update_status = Column(String(20), nullable=False, default="unknown", server_default=text("'unknown'"))
    new_major = Column(String(100), nullable=True)
    last_error = Column(String(500), nullable=True)

    created_at = Column(DateTime, nullable=False, default=_utcnow, server_default=_NOW_UTC)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow, server_default=_NOW_UTC)

    __table_args__ = (
        UniqueConstraint("app_type", "name", name="uq_version_targets_app_name"),
    )


class VersionCheck(Base):
    """
    Historique des contrôles : version LOCALE (installée) et version REMOTE (officielle)
    au même instant, avec l'écart calculé. Un enregistrement par cible et par contrôle.
    """
    __tablename__ = "version_checks"

    id = Column(BigInteger, primary_key=True)
    target_id = Column(Integer, ForeignKey("version_targets.id", ondelete="CASCADE"), nullable=False, index=True)
    app_type = Column(String(50), nullable=False)
    checked_at = Column(DateTime, nullable=False, index=True)    # UTC

    # Local
    local_status = Column(String(20), nullable=False)            # ok | error | not_configured
    local_version = Column(String(100), nullable=True)
    local_raw = Column(String(200), nullable=True)
    local_error = Column(String(500), nullable=True)
    local_latency_ms = Column(Integer, nullable=True)

    # Remote
    upstream_status = Column(String(20), nullable=False)         # ok | error
    upstream_latest = Column(String(100), nullable=True)
    upstream_latest_raw = Column(String(200), nullable=True)
    upstream_by_major = Column(JSONB, nullable=True)             # {"2": "2.5.314", "3": "3.0.1"}
    upstream_source = Column(String(500), nullable=True)         # URL officielle interrogée
    upstream_docs_url = Column(String(500), nullable=True)
    upstream_archived = Column(Boolean, nullable=True)
    upstream_error = Column(String(500), nullable=True)
    upstream_latency_ms = Column(Integer, nullable=True)
    channel = Column(String(20), nullable=True)

    # Comparaison
    update_status = Column(String(20), nullable=False)           # up_to_date | patch_behind | ...
    target_version = Column(String(100), nullable=True)
    new_major = Column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_version_checks_target_time", "target_id", "checked_at"),
    )
