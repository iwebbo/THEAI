from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.deps import get_db
from api.routes.auth import get_current_user
from models.user import User
from models.version_checker import VersionCheck, VersionTarget
from schemas.version_checker import (AppTypeOut, CheckAllOut, CheckOut, CheckRunOut, SummaryOut, TargetCreate,
                                     TargetOut, TargetUpdate)
from services.version_checker import checker_service as svc
from services.version_checker.checker_crypto import SecretStorageError
from services.version_checker.checker_registry import APP_TYPES

router = APIRouter()


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Droits administrateur requis")
    return user


def _get(db: Session, target_id: int) -> VersionTarget:
    t = db.query(VersionTarget).filter(VersionTarget.id == target_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Cible introuvable")
    return t


def _guard(fn, *args):
    try:
        return fn(*args)
    except svc.TargetError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except SecretStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# --- catalogue / synthèse (lecture) --------------------------------------------------------

@router.get("/apps", response_model=List[AppTypeOut])
def list_app_types(_: User = Depends(get_current_user)):
    """Applications supportées (types du registre) : alimente le formulaire du frontend."""
    return [AppTypeOut(key=a.key, label=a.label, auth_fields=list(a.auth_fields), auth_required=a.auth_required,
                       auth_hint=a.auth_hint, url_example=a.url_example, channels=list(a.upstream.channels))
            for a in APP_TYPES.values()]


@router.get("/summary", response_model=SummaryOut)
def get_summary(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.summary(db)


# --- cibles --------------------------------------------------------------------------------

@router.get("/targets", response_model=List[TargetOut])
def list_targets(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Toutes les cibles, configurées ou non (`configured=false` -> « non renseignée »)."""
    ts = db.query(VersionTarget).order_by(VersionTarget.app_type, VersionTarget.name).all()
    return [svc.target_to_dict(t) for t in ts]


@router.post("/targets", response_model=TargetOut, status_code=201)
def create_target(body: TargetCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return svc.target_to_dict(_guard(svc.create_target, db, body.model_dump()))


@router.get("/targets/{target_id}", response_model=TargetOut)
def get_target(target_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.target_to_dict(_get(db, target_id))


@router.patch("/targets/{target_id}", response_model=TargetOut)
def update_target(target_id: int, body: TargetUpdate, db: Session = Depends(get_db),
                  _: User = Depends(require_admin)):
    t = _get(db, target_id)
    return svc.target_to_dict(_guard(svc.update_target, db, t, body.model_dump(exclude_unset=True)))


@router.delete("/targets/{target_id}", status_code=204)
def delete_target(target_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    svc.delete_target(db, _get(db, target_id))


# --- contrôles -----------------------------------------------------------------------------

@router.post("/check", response_model=CheckAllOut)
async def check_all(only_configured: bool = Query(False), db: Session = Depends(get_db),
                    _: User = Depends(require_admin)):
    """Contrôle toutes les cibles actives (local + amont) et enregistre l'historique."""
    results, skipped = await svc.run_all(db, only_configured)
    return CheckAllOut(checked=len(results), skipped=skipped,
                       results=[CheckRunOut(target=svc.target_to_dict(t), check=CheckOut.model_validate(c))
                                for t, c in results])


@router.post("/targets/{target_id}/check", response_model=CheckRunOut)
async def check_one(target_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get(db, target_id)
    c = await svc.run_target(db, t)
    return CheckRunOut(target=svc.target_to_dict(t), check=CheckOut.model_validate(c))


@router.get("/targets/{target_id}/history", response_model=List[CheckOut])
def history(target_id: int, limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db),
            _: User = Depends(get_current_user)):
    _get(db, target_id)
    return (db.query(VersionCheck).filter(VersionCheck.target_id == target_id)
            .order_by(VersionCheck.checked_at.desc(), VersionCheck.id.desc()).limit(limit).all())
