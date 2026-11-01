"""Routes API : HTTP/HTTPS synthetic monitoring."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from core.database import get_db
from api.routes.auth import get_current_user
from models.http_synthetic import HttpSyntheticCheck
from models.server import Server
from schemas.http_synthetic import HttpSyntheticCheckRequest, HttpSyntheticCheckResponse
from services.http_synthetic_service import HttpSyntheticService

router = APIRouter(dependencies=[Depends(get_current_user)])


def _url_from_server(server: Server) -> str:
    https = bool(server.use_https)
    scheme = "https" if https else "http"
    default = 443 if https else 80
    port = server.http_port
    netloc = server.hostname if port in (None, default) else f"{server.hostname}:{port}"
    return f"{scheme}://{netloc}{server.http_path or '/'}"


@router.post("/check", response_model=HttpSyntheticCheckResponse)
async def run_check(payload: HttpSyntheticCheckRequest, db: Session = Depends(get_db)):
    """Exécute un check synthétique (et le stocke si save=true)."""
    url = payload.url
    if payload.server_id is not None:
        server = db.query(Server).filter(Server.id == payload.server_id).first()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        url = url or _url_from_server(server)

    try:
        data = await HttpSyntheticService.run_check(
            url, timeout=payload.timeout, verify_tls=payload.verify_tls,
            follow_redirects=payload.follow_redirects,
            probe_protocols=payload.probe_protocols, method=payload.method,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not payload.save:
        return HttpSyntheticCheckResponse(
            server_id=payload.server_id, checked_at=datetime.now(timezone.utc), **data
        )

    row = HttpSyntheticCheck(server_id=payload.server_id, **data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=List[HttpSyntheticCheckResponse])
def list_checks(
    server_id: Optional[int] = None,
    hostname: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(online|warning|offline)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(HttpSyntheticCheck)
    if server_id is not None:
        q = q.filter(HttpSyntheticCheck.server_id == server_id)
    if hostname:
        q = q.filter(HttpSyntheticCheck.hostname == hostname)
    if status_filter:
        q = q.filter(HttpSyntheticCheck.status == status_filter)
    return q.order_by(HttpSyntheticCheck.checked_at.desc()).offset(skip).limit(limit).all()


@router.get("/latest", response_model=HttpSyntheticCheckResponse)
def latest_check(
    server_id: Optional[int] = None,
    url: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if server_id is None and not url:
        raise HTTPException(status_code=422, detail="server_id ou url requis")
    q = db.query(HttpSyntheticCheck)
    if server_id is not None:
        q = q.filter(HttpSyntheticCheck.server_id == server_id)
    if url:
        q = q.filter(HttpSyntheticCheck.url == HttpSyntheticService.normalize_url(url))
    row = q.order_by(HttpSyntheticCheck.checked_at.desc()).first()
    if not row:
        raise HTTPException(status_code=404, detail="No check found")
    return row


@router.get("/{check_id}", response_model=HttpSyntheticCheckResponse)
def get_check(check_id: int, db: Session = Depends(get_db)):
    row = db.query(HttpSyntheticCheck).filter(HttpSyntheticCheck.id == check_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Check not found")
    return row


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_check(check_id: int, db: Session = Depends(get_db)):
    row = db.query(HttpSyntheticCheck).filter(HttpSyntheticCheck.id == check_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Check not found")
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)