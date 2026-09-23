import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException, Depends

from core import db, now_utc, serialize, oid

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": now_utc() + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access_token: str, refresh_token: str):
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    secure = os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes") or frontend_url.startswith("https://")
    same_site = os.environ.get("COOKIE_SAMESITE", "none" if secure else "lax").lower()
    response.set_cookie("access_token", access_token, httponly=True, secure=secure,
                        samesite=same_site, max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=secure,
                        samesite=same_site, max_age=604800, path="/")


def clear_auth_cookies(response):
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    secure = os.environ.get("COOKIE_SECURE", "").lower() in ("1", "true", "yes") or frontend_url.startswith("https://")
    same_site = os.environ.get("COOKIE_SAMESITE", "none" if secure else "lax").lower()
    response.delete_cookie("access_token", path="/", secure=secure, httponly=True, samesite=same_site)
    response.delete_cookie("refresh_token", path="/", secure=secure, httponly=True, samesite=same_site)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": oid(payload["sub"])})
        if not user or not user.get("active", True):
            raise HTTPException(status_code=401, detail="User not found or inactive")
        return serialize(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Role-Based Access Control
# ---------------------------------------------------------------------------
# level values: "full", "operational", "basic", "limited", "create", "request",
#               "own", "yes", or "no"
ROLE_PERMISSIONS = {
    "owner": {
        "dashboard": "full", "revenue": "full", "analytics": "full", "bookings": "full",
        "guests": "full", "payments": "full", "invoice": "yes", "rooms": "full",
        "housekeeping": "full", "maintenance": "full", "guest_requests": "full",
        "staff": "full", "settings": "full", "ai": "full", "payment_settings": "full",
        "booking_website": "full", "audit": "full",
    },
    "manager": {
        "dashboard": "operational", "revenue": "basic", "analytics": "basic", "bookings": "full",
        "guests": "full", "payments": "full", "invoice": "yes", "rooms": "full",
        "housekeeping": "full", "maintenance": "full", "guest_requests": "full",
        "staff": "limited", "settings": "limited", "ai": "full", "payment_settings": "no",
        "booking_website": "limited", "audit": "limited",
    },
    "accounts": {
        "dashboard": "accounts", "revenue": "full", "analytics": "basic",
        "payments": "accounts",
    },
    "front_desk": {
        "dashboard": "front_desk", "revenue": "no", "analytics": "no", "bookings": "full",
        "guests": "operational", "payments": "operational", "invoice": "yes", "rooms": "operational",
        "housekeeping": "request", "maintenance": "create", "guest_requests": "full",
        "staff": "no", "settings": "no", "ai": "limited", "payment_settings": "no",
        "booking_website": "no",
    },
    "housekeeping": {
        "dashboard": "own", "rooms": "assigned", "housekeeping": "own",
        "maintenance": "create", "guest_requests": "relevant",
    },
    "maintenance": {
        "dashboard": "own", "rooms": "assigned", "maintenance": "own",
        "guest_requests": "relevant",
    },
}


def get_level(role: str, feature: str):
    return ROLE_PERMISSIONS.get(role, {}).get(feature, "no")


def require(feature: str, levels=None):
    """Dependency factory enforcing that the current user can access a feature."""
    async def dependency(user: dict = Depends(get_current_user)) -> dict:
        lvl = get_level(user["role"], feature)
        if not lvl or lvl == "no":
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        if levels is not None and lvl not in levels:
            raise HTTPException(status_code=403, detail="You do not have permission for this action")
        return user
    return dependency


async def log_action(user: dict, action: str, details: str = ""):
    await db.audit_logs.insert_one({
        "property_id": user.get("property_id"),
        "user_id": user.get("id"),
        "user_name": user.get("name"),
        "user_role": user.get("role"),
        "action": action,
        "details": details,
        "timestamp": now_utc().isoformat(),
    })
