from datetime import datetime

from sqlalchemy import (
    BigInteger, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from core.database import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


class Agent(Base):
    """
    Un agent par serveur. Le jeton d'enrôlement et la clé API ne sont jamais stockés en clair
    (SHA-256 : ce sont des secrets aléatoires à forte entropie, pas des mots de passe).
    """
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True)
    server_id = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, unique=True)

    token_hash = Column(String(64), nullable=True, index=True)       # jeton d'enrôlement (usage unique)
    token_expires_at = Column(DateTime, nullable=True)
    api_key_hash = Column(String(64), nullable=True, index=True)     # clé API de l'agent
    enrolled_at = Column(DateTime, nullable=True)
    last_seen = Column(DateTime, nullable=True)                       # UTC
    interval_seconds = Column(Integer, nullable=False, default=30)

    agent_version = Column(String(64), nullable=True)
    agent_hostname = Column(String(255), nullable=True)
    os_family = Column(String(32), nullable=True)
    arch = Column(String(32), nullable=True)
    remote_ip = Column(String(64), nullable=True)

    created_at = Column(DateTime, nullable=False, default=_utcnow)


class AgentMetric(Base):
    __tablename__ = "agent_metrics"

    id = Column(BigInteger, primary_key=True)
    server_id = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    ts = Column(DateTime, nullable=False, index=True)                 # UTC

    cpu_percent = Column(Float, nullable=True)
    mem_total = Column(BigInteger, nullable=True)
    mem_used = Column(BigInteger, nullable=True)
    swap_total = Column(BigInteger, nullable=True)
    swap_used = Column(BigInteger, nullable=True)
    load1 = Column(Float, nullable=True)
    load5 = Column(Float, nullable=True)
    load15 = Column(Float, nullable=True)
    uptime_seconds = Column(BigInteger, nullable=True)
    net_rx_bytes = Column(BigInteger, nullable=True)
    net_tx_bytes = Column(BigInteger, nullable=True)
    disk_used_pct = Column(Float, nullable=True)                      # max sur les disques
    disks = Column(JSONB, nullable=False, default=list)

    __table_args__ = (
        Index("ix_agent_metrics_server_ts", "server_id", "ts"),
    )


class AgentInventory(Base):
    """Dernier inventaire + ports en écoute + état de l'analyse de vulnérabilités."""
    __tablename__ = "agent_inventory"

    server_id = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True)

    pkg_hash = Column(String(128), nullable=True)
    os_family = Column(String(32), nullable=True)
    os_id = Column(String(64), nullable=True)
    os_version = Column(String(64), nullable=True)
    os_pretty = Column(String(255), nullable=True)
    kernel = Column(String(255), nullable=True)
    arch = Column(String(32), nullable=True)
    packages = Column(JSONB, nullable=False, default=list)
    package_count = Column(Integer, nullable=False, default=0)
    collected_at = Column(DateTime, nullable=True)

    ports = Column(JSONB, nullable=False, default=list)
    ports_updated_at = Column(DateTime, nullable=True)

    ecosystem = Column(String(64), nullable=True)                     # écosystème OSV, NULL = non supporté
    vuln_status = Column(String(20), nullable=False, default="pending")  # pending / ok / unsupported / error
    vuln_checked_at = Column(DateTime, nullable=True)
    vuln_error = Column(Text, nullable=True)
    vuln_count = Column(Integer, nullable=False, default=0)


class ServerVuln(Base):
    """Vulnérabilités confirmées par une source de distribution (OSV) pour un serveur."""
    __tablename__ = "server_vulns"

    server_id = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True)
    vuln_id = Column(String(64), primary_key=True)                    # CVE-... (ou id OSV si aucun CVE associé)
    package = Column(String(255), primary_key=True)                   # paquet source
    installed_version = Column(String(255), nullable=False)
    osv_id = Column(String(128), nullable=True)
    ecosystem = Column(String(64), nullable=True)
    first_seen = Column(DateTime, nullable=False, default=_utcnow)
    last_seen = Column(DateTime, nullable=False, default=_utcnow)

    __table_args__ = (
        Index("ix_server_vulns_vuln", "vuln_id"),
    )


class OsvCache(Base):
    """Cache des notices OSV (id -> CVE associés) pour éviter de re-télécharger à chaque analyse."""
    __tablename__ = "osv_vuln_cache"

    osv_id = Column(String(128), primary_key=True)
    modified = Column(String(64), nullable=False, default="")
    cves = Column(ARRAY(String), nullable=False, default=list)
    summary = Column(Text, nullable=True)
    fetched_at = Column(DateTime, nullable=False, default=_utcnow)
