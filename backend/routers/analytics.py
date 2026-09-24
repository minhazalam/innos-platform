from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from core import db
from security import require

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def summary(period: str = "week", user: dict = Depends(require("analytics", ["full", "basic"]))):
    if period not in ("today", "week", "month"):
        raise HTTPException(status_code=400, detail="Period must be today, week, or month")
    end = date.today() + timedelta(days=1)
    start = end - timedelta(days=1 if period == "today" else 7 if period == "week" else 30)
    start_iso, end_iso = start.isoformat(), end.isoformat()
    property_id = user["property_id"]
    rooms = await db.rooms.find({
        "property_id": property_id,
        "status": {"$nin": ["maintenance", "out_of_order"]},
    }).to_list(1000)
    room_count = len(rooms)
    room_nights = 0
    room_revenue = 0.0
    reservations = await db.reservations.find({
        "property_id": property_id, "status": {"$in": ["confirmed", "checked_in", "checked_out"]},
        "check_in": {"$lt": end_iso}, "check_out": {"$gt": start_iso},
    }).to_list(5000)
    source_counts = {}
    daily = { (start + timedelta(days=i)).isoformat(): {"date": (start + timedelta(days=i)).isoformat(), "revenue": 0.0, "room_nights": 0} for i in range((end - start).days) }
    for reservation in reservations:
        ci = date.fromisoformat(reservation["check_in"])
        co = date.fromisoformat(reservation["check_out"])
        from_day, to_day = max(ci, start), min(co, end)
        nights = max((to_day - from_day).days, 0)
        room_nights += nights
        per_night = reservation.get("room_charge_amount", reservation.get("total_amount", 0)) / max(reservation.get("nights", nights or 1), 1)
        room_revenue += per_night * nights
        source = reservation.get("source", "other")
        source_counts[source] = source_counts.get(source, 0) + 1
        day = from_day
        while day < to_day:
            daily[day.isoformat()]["room_nights"] += 1
            day += timedelta(days=1)
    payments = await db.payments.find({
        "property_id": property_id, "created_at": {"$gte": start_iso, "$lt": end_iso},
        "status": {"$in": ["completed", "refunded"]},
    }).to_list(5000)
    collected = 0.0
    for payment in payments:
        amount = payment.get("amount", 0) * (-1 if payment.get("status") == "refunded" else 1)
        collected += amount
        day = str(payment.get("created_at", ""))[:10]
        if day in daily:
            daily[day]["revenue"] += amount
    cancellations = await db.reservations.count_documents({
        "property_id": property_id, "status": "cancelled", "cancelled_at": {"$gte": start_iso, "$lt": end_iso},
    })
    available_room_nights = room_count * (end - start).days
    occupancy = round(room_nights / available_room_nights * 100, 1) if available_room_nights else 0
    adr = round(room_revenue / room_nights, 2) if room_nights else 0
    revpar = round(room_revenue / available_room_nights, 2) if available_room_nights else 0
    for item in daily.values():
        item["occupancy_pct"] = round(item["room_nights"] / room_count * 100, 1) if room_count else 0
        item["revenue"] = round(item["revenue"], 2)
    return {
        "period": period, "start": start_iso, "end": (end - timedelta(days=1)).isoformat(),
        "occupancy_pct": occupancy, "room_nights": room_nights,
        "available_room_nights": available_room_nights, "adr": adr, "revpar": revpar,
        "collected_revenue": round(collected, 2), "booking_count": len(reservations),
        "cancellation_count": cancellations,
        "booking_sources": [{"source": key, "count": value} for key, value in sorted(source_counts.items())],
        "daily": list(daily.values()),
    }
