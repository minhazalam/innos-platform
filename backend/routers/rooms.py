from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from core import db, oid, serialize, now_utc
from security import require, get_current_user, log_action

router = APIRouter(prefix="/rooms", tags=["rooms"])

VALID_STATUSES = ["available", "occupied", "dirty", "cleaning", "maintenance", "out_of_order"]


class RoomTypeIn(BaseModel):
    name: str
    base_price: float
    capacity: int = 2
    amenities: List[str] = []
    photo: Optional[str] = None
    description: Optional[str] = ""


class RoomIn(BaseModel):
    number: str
    room_type_id: str
    floor: Optional[str] = ""
    status: str = "available"


class StatusUpdate(BaseModel):
    status: str


# ---------------- Room Types ----------------
@router.get("/types")
async def list_types(user: dict = Depends(get_current_user)):
    types = await db.room_types.find({"property_id": user["property_id"]}).to_list(200)
    return [serialize(t) for t in types]


@router.post("/types")
async def create_type(body: RoomTypeIn, user: dict = Depends(require("rooms", ["full"]))):
    doc = body.model_dump()
    doc["property_id"] = user["property_id"]
    doc["created_at"] = now_utc().isoformat()
    res = await db.room_types.insert_one(doc)
    await log_action(user, "create_room_type", f"Created room type {body.name}")
    return serialize(await db.room_types.find_one({"_id": res.inserted_id}))


@router.put("/types/{type_id}")
async def update_type(type_id: str, body: RoomTypeIn, user: dict = Depends(require("rooms", ["full"]))):
    await db.room_types.update_one(
        {"_id": oid(type_id), "property_id": user["property_id"]}, {"$set": body.model_dump()})
    await log_action(user, "update_room_type", f"Updated room type {body.name}")
    return serialize(await db.room_types.find_one({"_id": oid(type_id)}))


# ---------------- Rooms ----------------
@router.get("")
async def list_rooms(user: dict = Depends(get_current_user)):
    rooms = await db.rooms.find({"property_id": user["property_id"]}).to_list(500)
    types = {str(t["_id"]): t for t in await db.room_types.find({"property_id": user["property_id"]}).to_list(200)}
    out = []
    for r in rooms:
        s = serialize(r)
        t = types.get(s.get("room_type_id"))
        s["room_type_name"] = t["name"] if t else "—"
        s["base_price"] = t["base_price"] if t else 0
        out.append(s)
    out.sort(key=lambda x: x["number"])
    return out


@router.post("")
async def create_room(body: RoomIn, user: dict = Depends(require("rooms", ["full"]))):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    exists = await db.rooms.find_one({"property_id": user["property_id"], "number": body.number})
    if exists:
        raise HTTPException(status_code=400, detail=f"Room {body.number} already exists")
    doc = body.model_dump()
    doc["property_id"] = user["property_id"]
    doc["created_at"] = now_utc().isoformat()
    res = await db.rooms.insert_one(doc)
    await log_action(user, "create_room", f"Created room {body.number}")
    return serialize(await db.rooms.find_one({"_id": res.inserted_id}))


@router.patch("/{room_id}/status")
async def update_status(room_id: str, body: StatusUpdate, user: dict = Depends(require("rooms", ["full", "operational", "assigned"]))):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    room = await db.rooms.find_one({"_id": oid(room_id), "property_id": user["property_id"]})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    await db.rooms.update_one({"_id": room["_id"]}, {"$set": {"status": body.status}})
    await log_action(user, "room_status_change", f"Room {room['number']}: {room.get('status')} -> {body.status}")
    return serialize(await db.rooms.find_one({"_id": room["_id"]}))


@router.delete("/{room_id}")
async def delete_room(room_id: str, user: dict = Depends(require("rooms", ["full"]))):
    room = await db.rooms.find_one({"_id": oid(room_id), "property_id": user["property_id"]})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    active = await db.reservations.find_one({"room_id": room_id, "status": {"$in": ["confirmed", "checked_in"]}})
    if active:
        raise HTTPException(status_code=400, detail="Room has active reservations")
    await db.rooms.delete_one({"_id": room["_id"]})
    await log_action(user, "delete_room", f"Deleted room {room['number']}")
    return {"ok": True}
