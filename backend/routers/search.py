import re
from typing import Optional

from fastapi import APIRouter, Depends

from core import db, oid
from security import get_current_user, get_level

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def global_search(q: str, user: dict = Depends(get_current_user)):
    term = q.strip()
    if len(term) < 2:
        return []
    pid = user["property_id"]
    role = user["role"]
    pattern = re.compile(re.escape(term), re.IGNORECASE)
    results = []

    if get_level(role, "guests") in ("full", "operational"):
        guests = await db.guests.find({
            "property_id": pid,
            "$or": [{"name": pattern}, {"phone": pattern}, {"email": pattern}],
        }).limit(8).to_list(8)
        results.extend({"type": "Guest", "id": str(g["_id"]), "label": g.get("name", "Guest"),
                        "detail": g.get("phone", ""), "href": f"/guests?guest={g['_id']}"} for g in guests)

    if get_level(role, "rooms") in ("full", "operational", "assigned"):
        room_query = {"property_id": pid, "number": pattern}
        if role == "housekeeping":
            assigned = await db.housekeeping_tasks.find({"property_id": pid, "assigned_to": user["id"]}).to_list(500)
            room_query["_id"] = {"$in": [oid(t["room_id"]) for t in assigned if t.get("room_id")]}
        if role == "maintenance":
            assigned = await db.maintenance_issues.find({"property_id": pid, "assigned_to": user["id"]}).to_list(500)
            room_query["_id"] = {"$in": [oid(i["room_id"]) for i in assigned if i.get("room_id")]}
        rooms = await db.rooms.find(room_query).limit(8).to_list(8)
        results.extend({"type": "Room", "id": str(r["_id"]), "label": f"Room {r['number']}",
                        "detail": r.get("status", ""), "href": f"/rooms?room={r['_id']}"} for r in rooms)

    if get_level(role, "bookings") == "full":
        guest_docs = await db.guests.find({"property_id": pid}).to_list(3000)
        rooms = await db.rooms.find({"property_id": pid}).to_list(1000)
        guests_by_id = {str(g["_id"]): g for g in guest_docs}
        rooms_by_id = {str(r["_id"]): r for r in rooms}
        reservations = await db.reservations.find({"property_id": pid}).sort("check_in", -1).to_list(3000)
        for reservation in reservations:
            guest = guests_by_id.get(reservation.get("guest_id"), {})
            room = rooms_by_id.get(reservation.get("room_id"), {})
            values = (str(reservation.get("_id")), guest.get("name", ""), guest.get("phone", ""), room.get("number", ""))
            if any(pattern.search(value) for value in values):
                results.append({"type": "Reservation", "id": str(reservation["_id"]),
                                "label": guest.get("name", "Reservation"),
                                "detail": f"Room {room.get('number', '—')} · {reservation.get('check_in', '')}",
                                "href": f"/reservations?id={reservation['_id']}"})
                if len([r for r in results if r["type"] == "Reservation"]) >= 8:
                    break

    task_level = get_level(role, "housekeeping")
    if task_level in ("full", "own"):
        task_query = {"property_id": pid, "$or": [{"room_number": pattern}, {"task_type": pattern}, {"type": pattern}]}
        if role == "housekeeping":
            task_query["assigned_to"] = user["id"]
        tasks = await db.housekeeping_tasks.find(task_query).limit(8).to_list(8)
        results.extend({"type": "Housekeeping", "id": str(t["_id"]), "label": f"Room {t.get('room_number', '—')} cleaning",
                        "detail": t.get("status", ""), "href": "/housekeeping"} for t in tasks)

    maintenance_level = get_level(role, "maintenance")
    if maintenance_level in ("full", "own", "create"):
        issue_query = {"property_id": pid, "$or": [{"title": pattern}, {"description": pattern}, {"room_number": pattern}]}
        if role == "maintenance":
            issue_query["assigned_to"] = user["id"]
        elif role == "front_desk":
            issue_query["reported_by_id"] = user["id"]
        elif role == "housekeeping":
            issue_query["reported_by_id"] = user["id"]
        issues = await db.maintenance_issues.find(issue_query).limit(8).to_list(8)
        results.extend({"type": "Maintenance", "id": str(i["_id"]),
                        "label": i.get("title", "Maintenance issue"),
                        "detail": f"Room {i.get('room_number', '—')} · {i.get('status', '')}",
                        "href": "/maintenance"} for i in issues)

    request_level = get_level(role, "guest_requests")
    if request_level in ("full", "relevant"):
        request_query = {"property_id": pid, "$or": [{"category": pattern}, {"description": pattern}, {"room_number": pattern}]}
        if role in ("housekeeping", "maintenance"):
            request_query["assigned_to"] = user["id"]
        requests = await db.guest_requests.find(request_query).limit(8).to_list(8)
        results.extend({"type": "Guest request", "id": str(i["_id"]),
                        "label": i.get("category", "Request").replace("_", " ").title(),
                        "detail": f"Room {i.get('room_number', '—')} · {i.get('status', '')}",
                        "href": "/guest-requests"} for i in requests)

    return results[:30]
