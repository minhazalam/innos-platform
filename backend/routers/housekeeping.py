from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from core import db, oid, serialize, now_utc
from security import require, log_action
from notifications_service import notify_roles

router = APIRouter(prefix="/housekeeping", tags=["housekeeping"])


class TaskIn(BaseModel):
    room_id: str
    task_type: str = "checkout_cleaning"
    priority: str = "normal"
    assigned_to: Optional[str] = None
    notes: str = ""


class TaskAssignment(BaseModel):
    assigned_to: Optional[str] = None


class TaskUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


async def _room(property_id: str, room_id: str):
    room = await db.rooms.find_one({"_id": oid(room_id), "property_id": property_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


async def _assignee(property_id: str, user_id: Optional[str]):
    if user_id is None:
        return None
    user = await db.users.find_one({"_id": oid(user_id), "property_id": property_id, "role": "housekeeping", "active": True})
    if not user:
        raise HTTPException(status_code=400, detail="Choose an active housekeeping staff member")
    return user


def _visible_task(task: dict, user: dict) -> dict:
    result = serialize(task)
    if user["role"] == "housekeeping":
        # Only operational information needed to clean the room is returned.
        for key in ("property_id", "created_by", "created_by_id", "assigned_to", "assigned_name"):
            result.pop(key, None)
    return result


@router.get("")
async def list_tasks(user: dict = Depends(require("housekeeping", ["full", "own"]))):
    query = {"property_id": user["property_id"]}
    if user["role"] == "housekeeping":
        query["assigned_to"] = user["id"]
    tasks = await db.housekeeping_tasks.find(query).sort([("priority", -1), ("created_at", 1)]).to_list(1000)
    priority_order = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    tasks.sort(key=lambda task: (priority_order.get(task.get("priority"), 2), task.get("created_at", "")))
    return [_visible_task(task, user) for task in tasks]


@router.post("")
async def create_task(body: TaskIn, user: dict = Depends(require("housekeeping", ["full"]))):
    room = await _room(user["property_id"], body.room_id)
    assignee = await _assignee(user["property_id"], body.assigned_to)
    task = {
        "property_id": user["property_id"], "room_id": body.room_id,
        "room_number": room["number"], "task_type": body.task_type,
        "priority": body.priority, "status": "pending", "notes": body.notes,
        "assigned_to": body.assigned_to, "assigned_name": assignee["name"] if assignee else None,
        "created_by_id": user["id"], "created_by": user["name"],
        "created_at": now_utc().isoformat(),
    }
    result = await db.housekeeping_tasks.insert_one(task)
    await log_action(user, "create_housekeeping_task", f"Created task for room {room['number']}")
    await notify_roles(user["property_id"], ["owner", "manager", "housekeeping"], "housekeeping", "New housekeeping task", f"Room {room['number']} · {body.task_type.replace('_', ' ')}", "/housekeeping")
    return serialize(await db.housekeeping_tasks.find_one({"_id": result.inserted_id}))


@router.patch("/{task_id}/assignment")
async def assign_task(task_id: str, body: TaskAssignment, user: dict = Depends(require("housekeeping", ["full"]))):
    task = await db.housekeeping_tasks.find_one({"_id": oid(task_id), "property_id": user["property_id"]})
    if not task:
        raise HTTPException(status_code=404, detail="Housekeeping task not found")
    assignee = await _assignee(user["property_id"], body.assigned_to)
    await db.housekeeping_tasks.update_one({"_id": task["_id"]}, {"$set": {
        "assigned_to": body.assigned_to, "assigned_name": assignee["name"] if assignee else None,
        "updated_at": now_utc().isoformat(),
    }})
    await log_action(user, "assign_housekeeping_task", f"Assigned room {task.get('room_number')} task")
    return serialize(await db.housekeeping_tasks.find_one({"_id": task["_id"]}))


@router.patch("/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, user: dict = Depends(require("housekeeping", ["full", "own"]))):
    if body.status not in ("pending", "in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Invalid task status")
    query = {"_id": oid(task_id), "property_id": user["property_id"]}
    if user["role"] == "housekeeping":
        query["assigned_to"] = user["id"]
    task = await db.housekeeping_tasks.find_one(query)
    if not task:
        raise HTTPException(status_code=404, detail="Housekeeping task not found")
    if task.get("status") == "completed" and body.status != "completed":
        raise HTTPException(status_code=400, detail="Completed tasks cannot be reopened")
    now = now_utc().isoformat()
    updates = {"status": body.status, "updated_at": now}
    if body.notes is not None:
        updates["staff_notes"] = body.notes
    if body.status == "in_progress":
        updates["started_at"] = now
    if body.status == "completed":
        updates["completed_at"] = now
    await db.housekeeping_tasks.update_one({"_id": task["_id"]}, {"$set": updates})
    room = await db.rooms.find_one({"_id": oid(task["room_id"]), "property_id": user["property_id"]})
    # Keep room readiness consistent with every open issue/task. Maintenance
    # and out-of-order states take precedence; in-progress cleaning precedes
    # queued cleaning, and only a fully clear room becomes available.
    next_room_status = None
    if room and room.get("status") != "occupied":
        open_issue = await db.maintenance_issues.find_one({
            "property_id": user["property_id"], "room_id": task["room_id"],
            "status": {"$in": ["open", "in_progress"]},
        })
        active_tasks = await db.housekeeping_tasks.find({
            "property_id": user["property_id"], "room_id": task["room_id"],
            "status": {"$in": ["pending", "in_progress"]},
        }).to_list(100)
        next_room_status = "maintenance" if open_issue else (
            "out_of_order" if room.get("status") == "out_of_order" else
            "cleaning" if any(item.get("status") == "in_progress" for item in active_tasks) else
            "dirty" if active_tasks or body.status == "pending" else "available"
        )
    if next_room_status:
        await db.rooms.update_one({"_id": oid(task["room_id"]), "property_id": user["property_id"]}, {"$set": {"status": next_room_status}})
    await log_action(user, "update_housekeeping_task", f"Room {task.get('room_number')} task -> {body.status}")
    return _visible_task(await db.housekeeping_tasks.find_one({"_id": task["_id"]}), user)
