from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from core import db, oid, serialize, now_utc
from security import require, log_action
from notifications_service import notify_roles

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


class IssueIn(BaseModel):
    room_id: Optional[str] = None
    room_number: Optional[str] = None
    title: str
    description: str = ""
    priority: str = "normal"
    assigned_to: Optional[str] = None


class AssignmentIn(BaseModel):
    assigned_to: Optional[str] = None


class IssueUpdate(BaseModel):
    status: str
    notes: Optional[str] = None


async def _validate_room(property_id: str, room_id: Optional[str]):
    if not room_id:
        return None
    room = await db.rooms.find_one({"_id": oid(room_id), "property_id": property_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


async def _assignee(property_id: str, user_id: Optional[str]):
    if user_id is None:
        return None
    user = await db.users.find_one({"_id": oid(user_id), "property_id": property_id, "role": "maintenance", "active": True})
    if not user:
        raise HTTPException(status_code=400, detail="Choose an active maintenance staff member")
    return user


def _shape(issue: dict, user: dict):
    result = serialize(issue)
    if user["role"] == "maintenance":
        for key in ("property_id", "reported_by", "reported_by_id", "assigned_to", "assigned_name", "room_status_before_issue"):
            result.pop(key, None)
    return result


@router.get("")
async def list_issues(user: dict = Depends(require("maintenance", ["full", "own", "create"]))):
    query = {"property_id": user["property_id"]}
    if user["role"] == "maintenance":
        query["assigned_to"] = user["id"]
    elif user["role"] == "front_desk":
        query["reported_by_id"] = user["id"]
    issues = await db.maintenance_issues.find(query).sort("created_at", -1).to_list(1000)
    return [_shape(issue, user) for issue in issues]


@router.post("")
async def create_issue(body: IssueIn, user: dict = Depends(require("maintenance", ["full", "create", "own"]))):
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Issue title is required")
    room_id = body.room_id
    if not room_id and body.room_number:
        matched_room = await db.rooms.find_one({"property_id": user["property_id"], "number": body.room_number.strip()})
        if not matched_room:
            raise HTTPException(status_code=404, detail="Room not found")
        room_id = str(matched_room["_id"])
    room = await _validate_room(user["property_id"], room_id)
    room_status_before_issue = room.get("status") if room else None
    if room:
        existing_issue = await db.maintenance_issues.find_one({
            "property_id": user["property_id"], "room_id": str(room["_id"]),
            "status": {"$in": ["open", "in_progress"]},
        }, sort=[("created_at", 1)])
        if existing_issue:
            # All concurrent issues keep the original room state so resolving
            # the final issue can restore a meaningful readiness state.
            room_status_before_issue = existing_issue.get("room_status_before_issue", room_status_before_issue)
    assignee = None
    if body.assigned_to and user["role"] in ("owner", "manager"):
        assignee = await _assignee(user["property_id"], body.assigned_to)
    elif user["role"] == "maintenance":
        assignee = await db.users.find_one({"_id": oid(user["id"]), "property_id": user["property_id"], "active": True})
    elif user["role"] in ("front_desk", "housekeeping"):
        assignee = await db.users.find_one({"property_id": user["property_id"], "role": "maintenance", "active": True})
    issue = {
        "property_id": user["property_id"], "room_id": str(room["_id"]) if room else None,
        "room_number": room["number"] if room else None, "title": body.title.strip(),
        "description": body.description, "priority": body.priority, "status": "open",
        "assigned_to": str(assignee["_id"]) if assignee else None,
        "assigned_name": assignee["name"] if assignee else None,
        "reported_by_id": user["id"], "reported_by": user["name"],
        "created_at": now_utc().isoformat(), "notes": [],
        "room_status_before_issue": room_status_before_issue,
    }
    result = await db.maintenance_issues.insert_one(issue)
    if room and room.get("status") != "occupied":
        await db.rooms.update_one({"_id": room["_id"], "property_id": user["property_id"]}, {"$set": {"status": "maintenance"}})
    await log_action(user, "create_maintenance_issue", f"{body.title.strip()} ({issue['room_number'] or 'property'})")
    issue_label = body.title.strip()
    if issue["room_number"]:
        issue_label += f" · Room {issue['room_number']}"
    await notify_roles(user["property_id"], ["owner", "manager", "maintenance"], "maintenance", "Maintenance issue reported", issue_label, "/maintenance")
    return _shape(await db.maintenance_issues.find_one({"_id": result.inserted_id}), user)


@router.patch("/{issue_id}/assignment")
async def assign_issue(issue_id: str, body: AssignmentIn, user: dict = Depends(require("maintenance", ["full"]))):
    issue = await db.maintenance_issues.find_one({"_id": oid(issue_id), "property_id": user["property_id"]})
    if not issue:
        raise HTTPException(status_code=404, detail="Maintenance issue not found")
    assignee = await _assignee(user["property_id"], body.assigned_to)
    await db.maintenance_issues.update_one({"_id": issue["_id"]}, {"$set": {
        "assigned_to": body.assigned_to, "assigned_name": assignee["name"] if assignee else None,
        "updated_at": now_utc().isoformat(),
    }})
    await log_action(user, "assign_maintenance_issue", f"Assigned issue {issue.get('title')}")
    return serialize(await db.maintenance_issues.find_one({"_id": issue["_id"]}))


@router.patch("/{issue_id}")
async def update_issue(issue_id: str, body: IssueUpdate, user: dict = Depends(require("maintenance", ["full", "own"]))):
    if body.status not in ("open", "in_progress", "resolved"):
        raise HTTPException(status_code=400, detail="Invalid issue status")
    query = {"_id": oid(issue_id), "property_id": user["property_id"]}
    if user["role"] == "maintenance":
        query["assigned_to"] = user["id"]
    issue = await db.maintenance_issues.find_one(query)
    if not issue:
        raise HTTPException(status_code=404, detail="Maintenance issue not found")
    now = now_utc().isoformat()
    updates = {"status": body.status, "updated_at": now}
    if body.status == "resolved":
        updates["resolved_at"] = now
    if body.notes:
        updates["$push"] = {"notes": {"author": user["name"], "text": body.notes, "created_at": now}}
    update_doc = {"$set": {k: v for k, v in updates.items() if k != "$push"}}
    if "$push" in updates:
        update_doc["$push"] = updates["$push"]
    await db.maintenance_issues.update_one({"_id": issue["_id"]}, update_doc)
    if body.status == "resolved" and issue.get("room_id"):
        open_issue = await db.maintenance_issues.find_one({
            "_id": {"$ne": issue["_id"]}, "property_id": user["property_id"],
            "room_id": issue["room_id"], "status": {"$in": ["open", "in_progress"]},
        })
        active_tasks = await db.housekeeping_tasks.find({
            "property_id": user["property_id"], "room_id": issue["room_id"],
            "status": {"$in": ["pending", "in_progress"]},
        }).to_list(100)
        current_room = await db.rooms.find_one({"_id": oid(issue["room_id"]), "property_id": user["property_id"]})
        if current_room and current_room.get("status") != "occupied":
            previous_status = issue.get("room_status_before_issue")
            restore_status = (
                "maintenance" if open_issue else
                "out_of_order" if current_room.get("status") == "out_of_order" or previous_status == "out_of_order" else
                "cleaning" if any(task.get("status") == "in_progress" for task in active_tasks) else
                "dirty" if active_tasks or previous_status in ("dirty", "cleaning", "occupied") else
                "available"
            )
            await db.rooms.update_one({"_id": current_room["_id"], "property_id": user["property_id"]}, {"$set": {"status": restore_status}})
    await log_action(user, "update_maintenance_issue", f"{issue.get('title')} -> {body.status}")
    return _shape(await db.maintenance_issues.find_one({"_id": issue["_id"]}), user)
