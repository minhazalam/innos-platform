from fastapi import APIRouter, Depends, HTTPException
import re
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from core import db, oid, serialize, now_utc
from security import require, hash_password, log_action

router = APIRouter(prefix="/staff", tags=["staff"])

ASSIGNABLE_ROLES = ["manager", "front_desk", "housekeeping", "maintenance", "accounts"]


class StaffIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    role: str
    phone: Optional[str] = ""


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


@router.get("")
async def list_staff(user: dict = Depends(require("staff", ["full", "limited"]))):
    users = await db.users.find({"property_id": user["property_id"]}).sort("name", 1).to_list(500)
    return [serialize(u) for u in users]


@router.post("")
async def create_staff(body: StaffIn, user: dict = Depends(require("staff", ["full", "limited"]))):
    role = body.role
    # Managers cannot create owners or other managers
    if user["role"] == "manager" and role not in ["front_desk", "housekeeping", "maintenance", "accounts"]:
        raise HTTPException(status_code=403, detail="Managers can only add front desk, housekeeping, maintenance and accounts staff")
    if user["role"] == "owner" and role not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if (not re.search(r"[A-Z]", body.password) or not re.search(r"[a-z]", body.password)
            or not re.search(r"[0-9]", body.password) or len(body.password.encode("utf-8")) > 72):
        raise HTTPException(status_code=400, detail="Password must include uppercase, lowercase and a number, and be 72 bytes or fewer")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    doc = {
        "name": body.name, "email": email, "password_hash": hash_password(body.password),
        "role": role, "phone": body.phone, "property_id": user["property_id"],
        "active": True, "created_at": now_utc().isoformat(),
    }
    res = await db.users.insert_one(doc)
    await log_action(user, "create_staff", f"Added staff {body.name} ({role})")
    return serialize(await db.users.find_one({"_id": res.inserted_id}))


@router.put("/{staff_id}")
async def update_staff(staff_id: str, body: StaffUpdate, user: dict = Depends(require("staff", ["full", "limited"]))):
    target = await db.users.find_one({"_id": oid(staff_id), "property_id": user["property_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="Staff not found")
    if target.get("role") == "owner":
        raise HTTPException(status_code=403, detail="Cannot modify the owner account")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "role" in updates and updates["role"] not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if user["role"] == "manager" and "role" in updates:
        raise HTTPException(status_code=403, detail="Only owners can change staff roles")
    await db.users.update_one({"_id": target["_id"]}, {"$set": updates})
    await log_action(user, "update_staff", f"Updated staff {target['name']}")
    return serialize(await db.users.find_one({"_id": target["_id"]}))
