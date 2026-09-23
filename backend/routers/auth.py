from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr

from core import db, oid, serialize
from security import (verify_password, create_access_token, create_refresh_token,
                      set_auth_cookies, clear_auth_cookies, get_current_user, log_action)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
    return {**safe, "access_token": access, "refresh_token": refresh_tok}


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
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
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        set_auth_cookies(response, create_access_token(str(user["_id"]), user["email"]),
                         create_refresh_token(str(user["_id"])))
        return serialize(user)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
