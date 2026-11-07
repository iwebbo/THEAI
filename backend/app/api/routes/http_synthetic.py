"""Routes API : HTTP/HTTPS synthetic monitoring (checks + cibles à surveiller)."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.database import get_db
from api.routes.auth import get_current_user
from models.http_synthetic import HttpSyntheticCheck
from models.http_synthetic_target import HttpSyntheticTarget
from models.server import Server
from schemas.http_synthetic import HttpSyntheticCheckRequest, HttpSyntheticCheckResponse
from schemas.http_synthetic_target import (
    HttpSyntheticTargetCheckAllItem, HttpSyntheticTargetCreate,
    HttpSyntheticTargetResponse, HttpSyntheticTargetUpdate,
)
from services import http_synthetic_target_service as target_svc
from services.http_synthetic_service import HttpSyntheticService
from services.http_synthetic_target_service import url_from_server  # noqa: F401  (compat)

router = APIRouter(dependencies=[Depends(get_current_user)])

_OPTION_FIELDS = ("method", "timeout", "verify_tls", "follow_redirects", "probe_protocols")
_NOT_NULLABLE = {"method", "timeout", "verify_tls", "follow_redirects", "probe_protocols",
                 "enabled", "interval_seconds"}


def _require_server(db: Session, server_id: Optional[int]) -> None:
    if server_id is not None and not db.query(Server).filter(Server.id == server_id).first():
        raise HTTPException(status_code=404, detail="Server not found")


def _get_target_or_404(db: Session, target_id: int) -> HttpSyntheticTarget:
    t = db.query(HttpSyntheticTarget).filter(HttpSyntheticTarget.id == target_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Target not found")
    return t


# --------------------------------------------------------------------------- #
# Checks
# --------------------------------------------------------------------------- #
@router.post("/check", response_model=HttpSyntheticCheckResponse)
async def run_check(payload: HttpSyntheticCheckRequest, db: Session = Depends(get_db)):
    """Exécute un check synthétique. Si save=true : crée (ou retrouve) la cible, stocke le check rattaché."""
    url = payload.url
    if payload.server_id is not None:
        server = db.query(Server).filter(Server.id == payload.server_id).first()
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        url = url or target_svc.url_from_server(server)

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

    # Identité de la cible : URL saisie (normalisée) et/ou serveur
    ident_url = HttpSyntheticService.normalize_url(payload.url) if payload.url else None
    options = {k: getattr(payload, k) for k in _OPTION_FIELDS}

    target = target_svc.find_existing(db, url=ident_url, server_id=payload.server_id, method=payload.method)
    if target is None:
        target = HttpSyntheticTarget(url=ident_url, server_id=payload.server_id, **options)
        db.add(target)
        try:
            db.flush()
        except IntegrityError:  # course avec un autre check identique
            db.rollback()
            target = target_svc.find_existing(db, url=ident_url, server_id=payload.server_id, method=payload.method)
            if target is None:
                raise
    else:
        for k, v in options.items():  # le formulaire fait foi : on aligne les options de la cible
            setattr(target, k, v)

    row = target_svc.store_result(db, target, data)
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=List[HttpSyntheticCheckResponse])
def list_checks(
    server_id: Optional[int] = None,
    target_id: Optional[int] = None,
    hostname: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(online|warning|offline)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(HttpSyntheticCheck)
    if server_id is not None:
        q = q.filter(HttpSyntheticCheck.server_id == server_id)
    if target_id is not None:
        q = q.filter(HttpSyntheticCheck.target_id == target_id)
    if hostname:
        q = q.filter(HttpSyntheticCheck.hostname == hostname)
    if status_filter:
        q = q.filter(HttpSyntheticCheck.status == status_filter)
    return q.order_by(HttpSyntheticCheck.checked_at.desc()).offset(skip).limit(limit).all()


@router.get("/latest", response_model=HttpSyntheticCheckResponse)
def latest_check(
    server_id: Optional[int] = None,
    target_id: Optional[int] = None,
    url: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if server_id is None and target_id is None and not url:
        raise HTTPException(status_code=422, detail="server_id, target_id ou url requis")
    q = db.query(HttpSyntheticCheck)
    if server_id is not None:
        q = q.filter(HttpSyntheticCheck.server_id == server_id)
    if target_id is not None:
        q = q.filter(HttpSyntheticCheck.target_id == target_id)
    if url:
        q = q.filter(HttpSyntheticCheck.url == HttpSyntheticService.normalize_url(url))
    row = q.order_by(HttpSyntheticCheck.checked_at.desc(), HttpSyntheticCheck.id.desc()).first()
    if not row:
        raise HTTPException(status_code=404, detail="No check found")
    return row


# --------------------------------------------------------------------------- #
# Cibles (déclarées AVANT /{check_id}, sinon "targets" serait capturé par ce dernier)
# --------------------------------------------------------------------------- #
@router.post("/targets", response_model=HttpSyntheticTargetResponse, status_code=status.HTTP_201_CREATED)
def create_target(payload: HttpSyntheticTargetCreate, db: Session = Depends(get_db)):
    """Enregistre une cible à surveiller (sans la checker)."""
    _require_server(db, payload.server_id)
    if target_svc.find_existing(db, url=payload.url, server_id=payload.server_id, method=payload.method):
        raise HTTPException(status_code=409, detail="Target already exists")
    target = HttpSyntheticTarget(**payload.model_dump())
    db.add(target)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Target already exists")
    db.refresh(target)
    return target


@router.get("/targets", response_model=List[HttpSyntheticTargetResponse])
def list_targets(
    server_id: Optional[int] = None,
    enabled: Optional[bool] = None,
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(unknown|online|warning|offline)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(HttpSyntheticTarget)
    if server_id is not None:
        q = q.filter(HttpSyntheticTarget.server_id == server_id)
    if enabled is not None:
        q = q.filter(HttpSyntheticTarget.enabled.is_(enabled))
    if status_filter:
        q = q.filter(HttpSyntheticTarget.status == status_filter)
    return q.order_by(HttpSyntheticTarget.id).offset(skip).limit(limit).all()


@router.post("/targets/check-all", response_model=List[HttpSyntheticTargetCheckAllItem])
async def check_all_targets(db: Session = Depends(get_db)):
    """Checke immédiatement toutes les cibles activées (hors planification)."""
    targets = db.query(HttpSyntheticTarget).filter(HttpSyntheticTarget.enabled.is_(True)).order_by(HttpSyntheticTarget.id).all()
    results = await target_svc.run_many(db, targets)
    db.commit()
    return [
        HttpSyntheticTargetCheckAllItem(
            target_id=t.id, status=t.status, error=err or t.last_error, check_id=row.id if row else None
        )
        for t, row, err in results
    ]


@router.get("/targets/{target_id}", response_model=HttpSyntheticTargetResponse)
def get_target(target_id: int, db: Session = Depends(get_db)):
    return _get_target_or_404(db, target_id)


@router.put("/targets/{target_id}", response_model=HttpSyntheticTargetResponse)
def update_target(target_id: int, payload: HttpSyntheticTargetUpdate, db: Session = Depends(get_db)):
    """Mise à jour partielle (seuls les champs envoyés changent)."""
    target = _get_target_or_404(db, target_id)
    changes = payload.model_dump(exclude_unset=True)
    for k in _NOT_NULLABLE:
        if k in changes and changes[k] is None:
            raise HTTPException(status_code=422, detail=f"{k} ne peut pas être null")
    if "server_id" in changes:
        _require_server(db, changes["server_id"])

    for k, v in changes.items():
        setattr(target, k, v)
    if not target.url and target.server_id is None:
        db.rollback()
        raise HTTPException(status_code=422, detail="url ou server_id requis")

    dup = target_svc.find_existing(db, url=target.url, server_id=target.server_id, method=target.method)
    if dup is not None and dup.id != target.id:
        db.rollback()
        raise HTTPException(status_code=409, detail="Target already exists")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Target already exists")
    db.refresh(target)
    return target


@router.delete("/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_target(target_id: int, db: Session = Depends(get_db)):
    """Supprime la cible ; l'historique de checks est conservé (target_id passe à NULL)."""
    target = _get_target_or_404(db, target_id)
    db.delete(target)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/targets/{target_id}/check", response_model=HttpSyntheticCheckResponse)
async def check_target(target_id: int, db: Session = Depends(get_db)):
    """Checke la cible maintenant avec sa configuration enregistrée, stocke le résultat."""
    target = _get_target_or_404(db, target_id)
    try:
        row = await target_svc.check_target(db, target)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    db.refresh(row)
    return row


@router.get("/targets/{target_id}/checks", response_model=List[HttpSyntheticCheckResponse])
def target_history(
    target_id: int,
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(online|warning|offline)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    _get_target_or_404(db, target_id)
    q = db.query(HttpSyntheticCheck).filter(HttpSyntheticCheck.target_id == target_id)
    if status_filter:
        q = q.filter(HttpSyntheticCheck.status == status_filter)
    return q.order_by(HttpSyntheticCheck.checked_at.desc(), HttpSyntheticCheck.id.desc()).offset(skip).limit(limit).all()


# --------------------------------------------------------------------------- #
# Détail / suppression d'un check
# --------------------------------------------------------------------------- #
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
