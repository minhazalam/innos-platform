from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from core import db, oid, serialize, now_utc
from security import require, get_current_user, log_action

router = APIRouter(prefix="/guests", tags=["guests"])


class GuestIn(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    address: Optional[str] = ""
    id_type: Optional[str] = ""
    id_number: Optional[str] = ""
    preferences: Optional[str] = ""
    notes: Optional[str] = ""


@router.get("")
async def list_guests(search: Optional[str] = None, user: dict = Depends(require("guests", ["full", "operational"]))):
    query = {"property_id": user["property_id"]}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    guests = await db.guests.find(query).sort("name", 1).to_list(500)
    return [serialize(g) for g in guests]


@router.post("")
async def create_guest(body: GuestIn, user: dict = Depends(require("guests", ["full", "operational"]))):
    doc = body.model_dump()
    doc["property_id"] = user["property_id"]
    doc["created_at"] = now_utc().isoformat()
    res = await db.guests.insert_one(doc)
    await log_action(user, "create_guest", f"Created guest {body.name}")
    return serialize(await db.guests.find_one({"_id": res.inserted_id}))


@router.get("/{guest_id}")
async def get_guest(guest_id: str, user: dict = Depends(require("guests", ["full", "operational"]))):
    guest = await db.guests.find_one({"_id": oid(guest_id), "property_id": user["property_id"]})
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    g = serialize(guest)
    reservations = await db.reservations.find({"property_id": user["property_id"], "guest_id": guest_id}).sort("check_in", -1).to_list(200)
    rooms = {str(r["_id"]): r for r in await db.rooms.find({"property_id": user["property_id"]}).to_list(500)}
    stays = []
    total_spend = 0
    for r in reservations:
        s = serialize(r)
        rm = rooms.get(s.get("room_id"))
        s["room_number"] = rm["number"] if rm else "—"
        stays.append(s)
        total_spend += r.get("paid_amount", 0)
    g["stays"] = stays
    g["total_bookings"] = len(stays)
    if user["role"] != "front_desk":
        g["total_spend"] = total_spend
    return g


@router.put("/{guest_id}")
async def update_guest(guest_id: str, body: GuestIn, user: dict = Depends(require("guests", ["full", "operational"]))):
    guest = await db.guests.find_one({"_id": oid(guest_id), "property_id": user["property_id"]})
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")
    await db.guests.update_one({"_id": guest["_id"]}, {"$set": body.model_dump()})
    await log_action(user, "update_guest", f"Updated guest {body.name}")
    return serialize(await db.guests.find_one({"_id": guest["_id"]}))
