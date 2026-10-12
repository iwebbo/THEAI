from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from api.deps import get_db
from api.routes.auth import get_current_user
from models.user import User
from services import cve as cve_service

router = APIRouter()


@router.get("/stats")
def cve_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compteurs du referentiel CVE (total, severites, KEV, EPSS) et derniere ingestion."""
    return cve_service.get_stats(db)


@router.get("/search")
def cve_search(
    q: Optional[str] = Query(None, max_length=100, description="CVE-ID, produit, editeur ou texte"),
    severity: Optional[str] = Query(None, pattern="^(critical|high|medium|low)$"),
    kev: Optional[bool] = Query(None, description="true = uniquement les CVE exploitees (CISA KEV)"),
    min_epss: Optional[float] = Query(None, ge=0, le=1),
    sort: str = Query("published", pattern="^(published|cvss_base|epss_score)$"),
    size: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return cve_service.search_cve(db, q, severity, kev, min_epss, sort, size, offset)
