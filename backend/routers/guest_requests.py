from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from core import db, oid, serialize, now_utc
from security import require, log_action
from notifications_service import notify_roles

router = APIRouter(prefix="/guest-requests", tags=["guest-requests"])

CATEGORIES = {"extra_towels", "extra_bed", "room_cleaning", "food", "taxi", "early_checkin", "late_checkout", "maintenance", "wifi", "other"}
ASSIGNABLE_ROLES = {"front_desk", "housekeeping", "maintenance"}


class RequestIn(BaseModel):
    category: str
    description: str = ""
    room_id: Optional[str] = None
    reservation_id: Optional[str] = None
    priority: str = "normal"
    assigned_to: Optional[str] = None


class AssignmentIn(BaseModel):
    assigned_to: Optional[str] = None


class RequestUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


def _shape(item: dict, user: dict):
    result = serialize(item)
    if user["role"] in ("housekeeping", "maintenance"):
        for key in ("property_id", "guest_id", "reservation_id", "assigned_to", "assigned_name", "created_by_id", "created_by"):
            result.pop(key, None)
    return result


@router.get("")
async def list_requests(user: dict = Depends(require("guest_requests", ["full", "relevant"]))):
    query = {"property_id": user["property_id"]}
    if user["role"] in ("housekeeping", "maintenance"):
        query["assigned_to"] = user["id"]
    items = await db.guest_requests.find(query).sort("created_at", -1).to_list(1000)
    return [_shape(item, user) for item in items]


@router.post("")
async def create_request(body: RequestIn, user: dict = Depends(require("guest_requests", ["full", "relevant"]))):
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid request category")
    room = None
    reservation = None
    if body.room_id:
        room = await db.rooms.find_one({"_id": oid(body.room_id), "property_id": user["property_id"]})
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
    if body.reservation_id:
        reservation = await db.reservations.find_one({"_id": oid(body.reservation_id), "property_id": user["property_id"]})
        if not reservation:
            raise HTTPException(status_code=404, detail="Reservation not found")
        if not room:
            room = await db.rooms.find_one({"_id": oid(reservation["room_id"]), "property_id": user["property_id"]})
    assigned = None
    assigned_id = None
    if body.assigned_to:
        if user["role"] not in ("owner", "manager"):
            raise HTTPException(status_code=403, detail="Only owners and managers can assign requests")
        assigned = await db.users.find_one({
            "_id": oid(body.assigned_to), "property_id": user["property_id"],
            "role": {"$in": list(ASSIGNABLE_ROLES)}, "active": True,
        })
        if not assigned:
            raise HTTPException(status_code=400, detail="Choose an active operational staff member")
        assigned_id = str(assigned["_id"])
    elif user["role"] not in ("owner", "manager"):
        target_role = "housekeeping" if body.category in ("room_cleaning", "extra_towels", "extra_bed") else "maintenance" if body.category == "maintenance" else "front_desk"
        assigned = await db.users.find_one({"property_id": user["property_id"], "role": target_role, "active": True})
        if assigned:
            assigned_id = str(assigned["_id"])
    item = {
        "property_id": user["property_id"], "room_id": str(room["_id"]) if room else None,
        "room_number": room["number"] if room else None,
        "reservation_id": body.reservation_id or (str(reservation["_id"]) if reservation else None),
        "guest_id": reservation.get("guest_id") if reservation else None,
        "category": body.category, "description": body.description,
        "priority": body.priority, "status": "assigned" if assigned else "created",
        "assigned_to": assigned_id,
        "assigned_name": assigned.get("name") if assigned else None,
        "created_by_id": user["id"], "created_by": user["name"],
        "created_at": now_utc().isoformat(), "notes": [],
    }
    result = await db.guest_requests.insert_one(item)
    await log_action(user, "create_guest_request", f"Created {body.category} request for room {item['room_number'] or '—'}")
    target_roles = ["owner", "manager", "front_desk"]
    if body.category in ("room_cleaning", "extra_towels", "extra_bed"):
        target_roles.append("housekeeping")
    if body.category == "maintenance":
        target_roles.append("maintenance")
    await notify_roles(user["property_id"], target_roles, "guest_request", "Guest request created", f"{body.category.replace('_', ' ')} · Room {item['room_number'] or '—'}", "/guest-requests")
    return _shape(await db.guest_requests.find_one({"_id": result.inserted_id}), user)


@router.patch("/{request_id}/assignment")
async def assign_request(request_id: str, body: AssignmentIn, user: dict = Depends(require("guest_requests", ["full"]))):
    item = await db.guest_requests.find_one({"_id": oid(request_id), "property_id": user["property_id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Guest request not found")
    assigned = None
    if body.assigned_to:
        assigned = await db.users.find_one({
            "_id": oid(body.assigned_to), "property_id": user["property_id"],
            "role": {"$in": list(ASSIGNABLE_ROLES)}, "active": True,
        })
        if not assigned:
            raise HTTPException(status_code=400, detail="Choose an active operational staff member")
    updates = {
        "assigned_to": str(assigned["_id"]) if assigned else None,
        "assigned_name": assigned.get("name") if assigned else None,
        "status": "assigned" if assigned else "created", "updated_at": now_utc().isoformat(),
    }
    await db.guest_requests.update_one({"_id": item["_id"]}, {"$set": updates})
    await log_action(user, "assign_guest_request", f"Assigned {item.get('category')} request")
    return serialize(await db.guest_requests.find_one({"_id": item["_id"]}))


@router.patch("/{request_id}")
async def update_request(request_id: str, body: RequestUpdate, user: dict = Depends(require("guest_requests", ["full", "relevant"]))):
    if body.status not in ("assigned", "in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Invalid request status")
    query = {"_id": oid(request_id), "property_id": user["property_id"]}
    if user["role"] in ("housekeeping", "maintenance"):
        query["assigned_to"] = user["id"]
    item = await db.guest_requests.find_one(query)
    if not item:
        raise HTTPException(status_code=404, detail="Guest request not found")
    now = now_utc().isoformat()
    update = {"$set": {"status": body.status, "updated_at": now}}
    if body.status == "completed":
        update["$set"]["completed_at"] = now
    if body.notes:
        update["$push"] = {"notes": {"author": user["name"], "text": body.notes, "created_at": now}}
    await db.guest_requests.update_one({"_id": item["_id"]}, update)
    await log_action(user, "update_guest_request", f"{item.get('category')} request -> {body.status}")
    return _shape(await db.guest_requests.find_one({"_id": item["_id"]}), user)
