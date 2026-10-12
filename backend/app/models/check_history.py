from sqlalchemy import Column, BigInteger, Integer, String, DateTime, ForeignKey, Index

from core.database import Base


class ServerCheckHistory(Base):
    """
    Historique des checks de monitoring (un enregistrement par serveur et par cycle).
    La table `servers` ne garde que le dernier statut : cette table alimente
    les graphes de temps de reponse et de disponibilite dans Grafana.
    """
    __tablename__ = "server_check_history"

    id = Column(BigInteger, primary_key=True)
    server_id = Column(Integer, ForeignKey("servers.id", ondelete="CASCADE"), nullable=False, index=True)
    checked_at = Column(DateTime, nullable=False, index=True)  # UTC
    status = Column(String(20), nullable=False)                # online / offline
    response_time = Column(Integer, nullable=True)             # ms
    message = Column(String(500), nullable=True)

    __table_args__ = (
        Index("ix_check_history_server_time", "server_id", "checked_at"),
    )
