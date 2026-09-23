import re
from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr, Field

from core import db, oid, serialize, now_utc
from security import (verify_password, create_access_token, create_refresh_token,
                      set_auth_cookies, clear_auth_cookies, get_current_user, log_action,
                      hash_password)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OwnerRegistration(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    hotel_name: str = Field(min_length=2, max_length=160)
    city: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=7, max_length=30)


@router.post("/register", status_code=201)
async def register(body: OwnerRegistration, response: Response):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if not re.search(r"[A-Z]", body.password) or not re.search(r"[a-z]", body.password) or not re.search(r"[0-9]", body.password):
        raise HTTPException(status_code=400, detail="Password must include an uppercase letter, lowercase letter, and number")
    if len(body.password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 bytes or fewer")
    base_slug = re.sub(r"[^a-z0-9]+", "-", body.hotel_name.lower()).strip("-") or "hotel"
    slug = base_slug
    suffix = 2
    while await db.properties.find_one({"booking_slug": slug}):
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    now = now_utc().isoformat()
    prop_result = await db.properties.insert_one({
        "name": body.hotel_name.strip(), "booking_slug": slug, "booking_website_enabled": True,
        "city": body.city.strip(), "state": body.state.strip(), "phone": body.phone.strip(),
        "email": email, "address": "", "description": "", "checkin_time": "14:00", "checkout_time": "11:00",
        "setup_completed": False, "currency": "INR", "policies": {},
        "payment_settings": {"upi_id": "", "upi_name": body.hotel_name.strip(), "methods": ["upi", "cash", "card", "bank_transfer"], "tax_percent": 12.0},
        "created_at": now,
    })
    user_doc = {
        "name": body.name.strip(), "email": email, "password_hash": hash_password(body.password),
        "role": "owner", "property_id": str(prop_result.inserted_id), "active": True,
        "created_at": now,
    }
    try:
        user_result = await db.users.insert_one(user_doc)
    except Exception as exc:
        await db.properties.delete_one({"_id": prop_result.inserted_id})
        raise HTTPException(status_code=409, detail="An account with this email already exists") from exc
    safe = serialize({**user_doc, "_id": user_result.inserted_id})
    set_auth_cookies(response, create_access_token(safe["id"], email), create_refresh_token(safe["id"]))
    await log_action(safe, "register_owner", f"Created hotel {body.hotel_name.strip()}")
    return safe


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="Your account has been deactivated")
    uid = str(user["_id"])
    access = create_access_token(uid, email)
    refresh_tok = create_refresh_token(uid)
    set_auth_cookies(response, access, refresh_tok)
    safe = serialize(user)
    await log_action(safe, "login", f"{safe['name']} logged in")
    return safe


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    import jwt
    from security import get_jwt_secret, JWT_ALGORITHM
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": oid(payload["sub"])})
        if not user or not user.get("active", True):
            raise HTTPException(status_code=401, detail="User not found or inactive")
        set_auth_cookies(response, create_access_token(str(user["_id"]), user["email"]),
                         create_refresh_token(str(user["_id"])))
        return serialize(user)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
