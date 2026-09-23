from fastapi import APIRouter, Depends
from datetime import date, timedelta

from core import db, serialize, now_utc
from security import require, get_current_user, get_level

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(user: dict = Depends(require("dashboard"))):
    pid = user["property_id"]
    today = date.today().isoformat()
    role = user["role"]
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
        payments = await db.payments.find({"property_id": pid}).to_list(5000)
        today_revenue = sum(p.get("amount", 0) for p in payments if str(p.get("created_at", ""))[:10] == today)
        pending_amount = sum(r["balance"] for r in pending)
        result["today_revenue"] = round(today_revenue, 2)
        result["pending_amount"] = round(pending_amount, 2)
        result["pending_payments"] = pending
    return result
