from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_current_user_optional
from ..models import Hospital, Role, User
from ..ratelimit import client_ip, enforce
from ..schemas import LoginIn, RegisterIn, UserOut
from ..security import create_access_token, hash_ip, hash_password, verify_password
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
_DUMMY_HASH = hash_password("timing-equaliser-0")


def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(
        settings.cookie_name, token, httponly=True, secure=settings.cookie_secure, samesite="lax",
        max_age=settings.jwt_expire_minutes * 60, path="/",
    )


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    enforce(request, "login", settings.rate_limit_login_per_15min, 900)
    user = db.scalar(select(User).where(User.email == body.email.lower(), User.deleted_at.is_(None)))
    if not user:
        verify_password(body.password, _DUMMY_HASH)  # equalise timing
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        audit.log(db, actor=user, action="login_failed", entity_type="user", entity_id=user.id, ip_hash=hash_ip(client_ip(request)))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is disabled. Contact your administrator.")
    user.last_login_at = datetime.now(timezone.utc)
    audit.log(db, actor=user, action="login", entity_type="user", entity_id=user.id, ip_hash=hash_ip(client_ip(request)))
    db.commit()
    token = create_access_token(user.id, user.role.code)
    _set_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": UserOut.from_user(user)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(settings.cookie_name, path="/")
    return {"ok": True}


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    enforce(request, "register", 10, 3600)
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    hospital = None
    if body.account_type == "hospital_staff":
        hospital = db.get(Hospital, body.hospital_id)
        if not hospital or not hospital.is_active or not verify_password(body.facility_code.strip().upper(), hospital.registration_code_hash):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid facility or facility access code. Obtain the code from your medical administrator.")
    role = db.scalar(select(Role).where(Role.code == body.account_type))
    user = User(
        email=email, password_hash=hash_password(body.password), full_name=body.full_name.strip(), designation=body.designation,
        role_id=role.id, hospital_id=hospital.id if hospital else None, district_id=hospital.district_id if hospital else None,
    )
    db.add(user)
    db.flush()
    audit.log(db, actor=user, action="register", entity_type="user", entity_id=user.id, changes={"role": role.code, "hospital_id": user.hospital_id}, ip_hash=hash_ip(client_ip(request)))
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, role.code)
    _set_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "user": UserOut.from_user(user)}


@router.get("/me", response_model=UserOut | None)
def me(user: User | None = Depends(get_current_user_optional)):
    """Current session user, or null when signed out (avoids 401 noise for anonymous visitors)."""
    return UserOut.from_user(user) if user else None
