from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List

from core import db, oid, serialize, now_utc
from security import require, get_current_user, log_action

router = APIRouter(prefix="/rooms", tags=["rooms"])

VALID_STATUSES = ["available", "occupied", "dirty", "cleaning", "maintenance", "out_of_order"]


class RoomTypeIn(BaseModel):
    name: str
    base_price: float = Field(ge=0)
    capacity: int = Field(default=2, ge=1, le=20)
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
async def list_types(user: dict = Depends(require("rooms", ["full", "operational"]))):
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
    result = await db.room_types.update_one(
        {"_id": oid(type_id), "property_id": user["property_id"]}, {"$set": body.model_dump()})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Room type not found")
    await log_action(user, "update_room_type", f"Updated room type {body.name}")
    return serialize(await db.room_types.find_one({"_id": oid(type_id)}))


# ---------------- Rooms ----------------
@router.get("")
async def list_rooms(user: dict = Depends(require("rooms", ["full", "operational", "assigned"]))):
    room_query = {"property_id": user["property_id"]}
    if user["role"] == "housekeeping":
        tasks = await db.housekeeping_tasks.find({"property_id": user["property_id"], "assigned_to": user["id"], "status": {"$in": ["pending", "in_progress"]}}).to_list(500)
        room_query["_id"] = {"$in": [oid(t.get("room_id")) for t in tasks if t.get("room_id")]}
    elif user["role"] == "maintenance":
        issues = await db.maintenance_issues.find({"property_id": user["property_id"], "assigned_to": user["id"], "status": {"$in": ["open", "in_progress"]}}).to_list(500)
        room_query["_id"] = {"$in": [oid(i.get("room_id")) for i in issues if i.get("room_id")]}
    rooms = await db.rooms.find(room_query).to_list(500)
    types = {str(t["_id"]): t for t in await db.room_types.find({"property_id": user["property_id"]}).to_list(200)}
    out = []
    for r in rooms:
        s = serialize(r)
        t = types.get(s.get("room_type_id"))
        s["room_type_name"] = t["name"] if t else "—"
        if user["role"] not in ("housekeeping", "maintenance"):
            s["base_price"] = t["base_price"] if t else 0
        else:
            for key in ("property_id", "room_type_id", "created_at"):
                s.pop(key, None)
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
    if not await db.room_types.find_one({"_id": oid(body.room_type_id), "property_id": user["property_id"]}):
        raise HTTPException(status_code=404, detail="Room type not found")
    doc = body.model_dump()
    doc["property_id"] = user["property_id"]
    doc["created_at"] = now_utc().isoformat()
    res = await db.rooms.insert_one(doc)
    await log_action(user, "create_room", f"Created room {body.number}")
    return serialize(await db.rooms.find_one({"_id": res.inserted_id}))


@router.patch("/{room_id}/status")
async def update_status(room_id: str, body: StatusUpdate, user: dict = Depends(require("rooms", ["full"]))):
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
