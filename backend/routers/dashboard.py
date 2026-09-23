from fastapi import APIRouter, Depends
from datetime import date, timedelta

from core import db, serialize, now_utc, oid
from security import require, get_current_user, get_level
from finance import sum_payment_cash_flow

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(user: dict = Depends(require("dashboard"))):
    pid = user["property_id"]
    today = date.today().isoformat()
    role = user["role"]

    if role == "accounts":
        payments = await db.payments.find({"property_id": pid, "status": {"$in": ["completed", "refunded"]}}).to_list(5000)
        reservations = await db.reservations.find({
            "property_id": pid, "status": {"$in": ["confirmed", "checked_in"]},
        }, {"total_amount": 1, "paid_amount": 1}).to_list(5000)
        runs = await db.payment_reconciliations.find({"property_id": pid}).sort("created_at", -1).limit(5).to_list(5)
        pending = [max(0, round(r.get("total_amount", 0) - r.get("paid_amount", 0), 2)) for r in reservations]
        return {
            "accounts_mode": True,
            "today_revenue": sum_payment_cash_flow(payments, day=date.today()),
            "period_revenue": sum_payment_cash_flow(payments),
            "pending_amount": round(sum(pending), 2),
            "pending_payments_count": sum(1 for amount in pending if amount > 0),
            "recent_reconciliations": [serialize(run) for run in runs],
        }

    # Mobile operational roles receive only assigned task/room data. In
    # particular, never enrich their dashboard with arrival guest identities.
    if role in ("housekeeping", "maintenance"):
        if role == "housekeeping":
            tasks = await db.housekeeping_tasks.find({"property_id": pid, "assigned_to": user["id"]}).sort("created_at", 1).to_list(500)
            rooms = []
            for task in tasks:
                if task.get("status") in ("pending", "in_progress"):
                    room = await db.rooms.find_one({"_id": oid(task.get("room_id")), "property_id": pid})
                    if room:
                        rooms.append({"id": str(room["_id"]), "number": room["number"], "status": room.get("status", "dirty")})
            shaped_tasks = [{key: value for key, value in serialize(task).items()
                             if key in {"id", "room_id", "room_number", "task_type", "type", "priority", "status", "notes", "staff_notes", "created_at"}}
                            for task in tasks]
            return {"staff_work_mode": True, "rooms_need_cleaning": rooms, "maintenance_rooms": [], "tasks": shaped_tasks}

        issues = await db.maintenance_issues.find({"property_id": pid, "assigned_to": user["id"]}).sort("created_at", -1).to_list(500)
        issue_rooms = []
        for issue in issues:
            if issue.get("status") in ("open", "in_progress") and issue.get("room_id"):
                room = await db.rooms.find_one({"_id": oid(issue["room_id"]), "property_id": pid})
                if room:
                    issue_rooms.append({"id": str(room["_id"]), "number": room["number"], "status": room.get("status", "maintenance")})
        shaped_issues = [{key: value for key, value in serialize(issue).items()
                          if key in {"id", "room_id", "room_number", "title", "description", "priority", "status", "notes", "created_at"}}
                         for issue in issues]
        return {"staff_work_mode": True, "rooms_need_cleaning": [], "maintenance_rooms": issue_rooms, "issues": shaped_issues}

    can_revenue = get_level(role, "revenue") not in (None, "no")

    rooms = await db.rooms.find({"property_id": pid}).to_list(500)
    total_rooms = len(rooms)
    occupied = len([r for r in rooms if r.get("status") == "occupied"])
    available = len([r for r in rooms if r.get("status") == "available"])
    dirty = [r for r in rooms if r.get("status") in ("dirty", "cleaning")]
    maintenance_rooms = [r for r in rooms if r.get("status") in ("maintenance", "out_of_order")]

    reservations = await db.reservations.find({"property_id": pid}).to_list(2000)
    guests = {str(g["_id"]): g for g in await db.guests.find({"property_id": pid}).to_list(2000)}
    rooms_map = {str(r["_id"]): r for r in rooms}

    def enrich(r):
        s = serialize(r)
        g = guests.get(s.get("guest_id"))
        rm = rooms_map.get(s.get("room_id"))
        s["guest_name"] = g["name"] if g else "—"
        s["room_number"] = rm["number"] if rm else "—"
        s["balance"] = round(s.get("total_amount", 0) - s.get("paid_amount", 0), 2)
        return s

    arrivals = [enrich(r) for r in reservations if r.get("check_in") == today and r.get("status") == "confirmed"]
    departures = [enrich(r) for r in reservations if r.get("check_out") == today and r.get("status") == "checked_in"]
    pending = [enrich(r) for r in reservations
               if r.get("status") in ("confirmed", "checked_in")
               and (r.get("total_amount", 0) - r.get("paid_amount", 0)) > 0]

    occupancy_pct = round(occupied / total_rooms * 100) if total_rooms else 0

    result = {
        "occupancy_pct": occupancy_pct,
        "occupied_rooms": occupied,
        "total_rooms": total_rooms,
        "available_rooms": available,
        "arrivals": arrivals,
        "departures": departures,
        "rooms_need_cleaning": [serialize(r) for r in dirty],
        "maintenance_rooms": [serialize(r) for r in maintenance_rooms],
        "pending_payments_count": len(pending),
        "arrivals_count": len(arrivals),
        "departures_count": len(departures),
    }

    if can_revenue:
        payments = await db.payments.find({"property_id": pid, "status": {"$in": ["completed", "refunded"]}}).to_list(5000)
        today_revenue = sum_payment_cash_flow(payments, day=date.today())
        pending_amount = sum(r["balance"] for r in pending)
        result["today_revenue"] = round(today_revenue, 2)
        result["pending_amount"] = round(pending_amount, 2)
        result["pending_payments"] = pending
    return result
