from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date

from core import (db, oid, serialize, now_utc, nights_between, date_ranges_overlap,
                  claim_room_nights, release_room_nights, sync_room_nights)
from security import require, get_current_user, log_action
from notifications_service import notify_roles

router = APIRouter(prefix="/reservations", tags=["reservations"])

ACTIVE_STATUSES = ["confirmed", "checked_in"]
BOOKING_SOURCES = ["direct", "walk_in", "phone", "whatsapp", "ota", "other"]


class ReservationIn(BaseModel):
    guest_id: Optional[str] = None
    guest_name: Optional[str] = None
    guest_phone: Optional[str] = None
    guest_email: Optional[str] = ""
    room_id: str
    check_in: str
    check_out: str
    num_guests: int = 1
    source: str = "walk_in"
    special_requests: Optional[str] = ""
    notes: Optional[str] = ""


class ReservationUpdate(BaseModel):
    room_id: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    num_guests: Optional[int] = None
    special_requests: Optional[str] = None
    notes: Optional[str] = None


async def _room_type_price(property_id, room_id):
    room = await db.rooms.find_one({"_id": oid(room_id), "property_id": property_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    rt = await db.room_types.find_one({"_id": oid(room["room_type_id"]), "property_id": property_id})
    return room, (rt["base_price"] if rt else 0), (rt["name"] if rt else "—")


async def _calculate_total(property_id, room_charge):
    prop = await db.properties.find_one({"_id": oid(property_id)})
    tax_percent = (prop or {}).get("payment_settings", {}).get("tax_percent", 0) or 0
    tax = round(room_charge * tax_percent / 100, 2)
    return tax, round(room_charge + tax, 2)


async def _check_overlap(property_id, room_id, check_in, check_out, exclude_id=None):
    existing = await db.reservations.find({
        "property_id": property_id, "room_id": room_id, "status": {"$in": ACTIVE_STATUSES}}).to_list(500)
    for r in existing:
        if exclude_id and str(r["_id"]) == exclude_id:
            continue
        if date_ranges_overlap(check_in, check_out, r["check_in"], r["check_out"]):
            raise HTTPException(status_code=400,
                                detail=f"Room already booked from {r['check_in']} to {r['check_out']}")


async def _enrich(reservations, property_id):
    guests = {str(g["_id"]): g for g in await db.guests.find({"property_id": property_id}).to_list(1000)}
    rooms = {str(r["_id"]): r for r in await db.rooms.find({"property_id": property_id}).to_list(500)}
    out = []
    for r in reservations:
        s = serialize(r)
        g = guests.get(s.get("guest_id"))
        rm = rooms.get(s.get("room_id"))
        s["guest_name"] = g["name"] if g else s.get("guest_name", "—")
        s["guest_phone"] = g["phone"] if g else s.get("guest_phone", "")
        s["guest_email"] = g.get("email", "") if g else s.get("guest_email", "")
        s["room_number"] = rm["number"] if rm else "—"
        s["balance"] = round(s.get("total_amount", 0) - s.get("paid_amount", 0), 2)
        out.append(s)
    return out


@router.get("")
async def list_reservations(status: Optional[str] = None, day: Optional[str] = None,
                            user: dict = Depends(require("bookings", ["full"]))):
    query = {"property_id": user["property_id"]}
    if status:
        query["status"] = status
    reservations = await db.reservations.find(query).sort("check_in", -1).to_list(1000)
    data = await _enrich(reservations, user["property_id"])
    if day:
        data = [r for r in data if r["check_in"] == day or r["check_out"] == day]
    return data


@router.get("/calendar")
async def calendar(start: str, end: str, user: dict = Depends(require("bookings", ["full"]))):
    reservations = await db.reservations.find({
        "property_id": user["property_id"],
        "status": {"$in": ["confirmed", "checked_in", "checked_out"]},
    }).to_list(1000)
    reservations = [r for r in reservations if date_ranges_overlap(start, end, r["check_in"], r["check_out"])]
    return await _enrich(reservations, user["property_id"])


@router.get("/{res_id}")
async def get_reservation(res_id: str, user: dict = Depends(require("bookings", ["full"]))):
    r = await db.reservations.find_one({"_id": oid(res_id), "property_id": user["property_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Reservation not found")
    data = (await _enrich([r], user["property_id"]))[0]
    payments = await db.payments.find({"property_id": user["property_id"], "reservation_id": res_id}).sort("created_at", -1).to_list(200)
    data["payments"] = [serialize(p) for p in payments]
    return data


@router.post("")
async def create_reservation(body: ReservationIn, user: dict = Depends(require("bookings", ["full"]))):
    try:
        check_in = date.fromisoformat(body.check_in)
        check_out = date.fromisoformat(body.check_out)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Check-in and check-out must be valid dates")
    if check_out <= check_in:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")
    if body.num_guests < 1:
        raise HTTPException(status_code=400, detail="At least one guest is required")
    if body.source not in BOOKING_SOURCES:
        raise HTTPException(status_code=400, detail="Invalid booking source")

    guest_id = body.guest_id
    if not guest_id:
        if not body.guest_name or not body.guest_phone:
            raise HTTPException(status_code=400, detail="Guest name and phone are required")
        existing = await db.guests.find_one({"property_id": user["property_id"], "phone": body.guest_phone})
        if existing:
            guest_id = str(existing["_id"])
        else:
            gres = await db.guests.insert_one({
                "property_id": user["property_id"], "name": body.guest_name,
                "phone": body.guest_phone, "email": body.guest_email or "",
                "created_at": now_utc().isoformat()})
            guest_id = str(gres.inserted_id)
    elif not await db.guests.find_one({"_id": oid(guest_id), "property_id": user["property_id"]}):
        raise HTTPException(status_code=404, detail="Guest not found")

    await _check_overlap(user["property_id"], body.room_id, body.check_in, body.check_out)
    room, price, rt_name = await _room_type_price(user["property_id"], body.room_id)
    room_type = await db.room_types.find_one({"_id": oid(room["room_type_id"]), "property_id": user["property_id"]})
    if body.num_guests > (room_type or {}).get("capacity", 2):
        raise HTTPException(status_code=400, detail="Guest count exceeds room capacity")
    if room.get("status") in ("maintenance", "out_of_order"):
        raise HTTPException(status_code=400, detail="Room is unavailable for maintenance")
    nights = nights_between(body.check_in, body.check_out)
    room_charge = round(price * nights, 2)
    tax, total = await _calculate_total(user["property_id"], room_charge)

    doc = {
        "property_id": user["property_id"],
        "guest_id": guest_id,
        "room_id": body.room_id,
        "room_type_id": room["room_type_id"],
        "check_in": body.check_in,
        "check_out": body.check_out,
        "num_guests": body.num_guests,
        "source": body.source,
        "special_requests": body.special_requests,
        "notes": body.notes,
        "status": "confirmed",
        "nights": nights,
        "rate_per_night": price,
        "room_charge_amount": room_charge,
        "tax_amount": tax,
        "total_amount": total,
        "paid_amount": 0,
        "created_by": user["name"],
        "created_at": now_utc().isoformat(),
    }
    res = await db.reservations.insert_one(doc)
    try:
        await claim_room_nights(user["property_id"], body.room_id, body.check_in, body.check_out, str(res.inserted_id))
    except ValueError as exc:
        await db.reservations.delete_one({"_id": res.inserted_id, "property_id": user["property_id"]})
        raise HTTPException(status_code=409, detail=str(exc))
    await log_action(user, "create_reservation", f"Booked room {room['number']} for {body.check_in} to {body.check_out}")
    await notify_roles(user["property_id"], ["owner", "manager", "front_desk"], "reservation", "New reservation", f"Room {room['number']} · {body.check_in} to {body.check_out}", "/reservations")
    return (await _enrich([await db.reservations.find_one({"_id": res.inserted_id})], user["property_id"]))[0]


@router.put("/{res_id}")
async def update_reservation(res_id: str, body: ReservationUpdate, user: dict = Depends(require("bookings", ["full"]))):
    r = await db.reservations.find_one({"_id": oid(res_id), "property_id": user["property_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if r["status"] in ["checked_out", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot edit a completed or cancelled reservation")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if r["status"] == "checked_in" and any(key in updates for key in ("room_id", "check_in", "check_out")):
        raise HTTPException(status_code=400, detail="Room and stay dates cannot be changed after check-in")
    new_room = updates.get("room_id", r["room_id"])
    new_in = updates.get("check_in", r["check_in"])
    new_out = updates.get("check_out", r["check_out"])
    validation_room = await db.rooms.find_one({"_id": oid(new_room), "property_id": user["property_id"]})
    if not validation_room:
        raise HTTPException(status_code=404, detail="Room not found")
    validation_type = await db.room_types.find_one({"_id": oid(validation_room["room_type_id"]), "property_id": user["property_id"]})
    if updates.get("num_guests", r.get("num_guests", 1)) > (validation_type or {}).get("capacity", 2):
        raise HTTPException(status_code=400, detail="Guest count exceeds room capacity")
    try:
        parsed_in = date.fromisoformat(new_in)
        parsed_out = date.fromisoformat(new_out)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Check-in and check-out must be valid dates")
    if parsed_out <= parsed_in:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")
    await _check_overlap(user["property_id"], new_room, new_in, new_out, exclude_id=res_id)

    if "room_id" in updates or "check_in" in updates or "check_out" in updates:
        room, price, _ = await _room_type_price(user["property_id"], new_room)
        nights = nights_between(new_in, new_out)
        room_type = await db.room_types.find_one({"_id": oid(room["room_type_id"]), "property_id": user["property_id"]})
        if updates.get("num_guests", r.get("num_guests", 1)) > (room_type or {}).get("capacity", 2):
            raise HTTPException(status_code=400, detail="Guest count exceeds room capacity")
        if room.get("status") in ("maintenance", "out_of_order"):
            raise HTTPException(status_code=400, detail="Room is unavailable for maintenance")
        room_charge = round(price * nights, 2)
        tax, total = await _calculate_total(user["property_id"], room_charge)
        if total < r.get("paid_amount", 0):
            raise HTTPException(status_code=400, detail="Updated total cannot be lower than payments already recorded")
        updates["room_type_id"] = room["room_type_id"]
        updates["nights"] = nights
        updates["rate_per_night"] = price
        updates["room_charge_amount"] = room_charge
        updates["tax_amount"] = tax
        updates["total_amount"] = total

    inventory_changed = any(key in updates for key in ("room_id", "check_in", "check_out"))
    if inventory_changed:
        try:
            # Keep the old inventory locked until the new dates have been
            # claimed and the reservation update succeeds.
            await claim_room_nights(user["property_id"], new_room, new_in, new_out, res_id)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))

    updates["updated_at"] = now_utc().isoformat()
    result = await db.reservations.update_one({
        "_id": r["_id"], "property_id": user["property_id"],
        "room_id": r["room_id"], "check_in": r["check_in"],
        "check_out": r["check_out"], "status": r["status"],
    }, {"$set": updates})
    if not result.matched_count:
        latest = await db.reservations.find_one({"_id": r["_id"], "property_id": user["property_id"]})
        if latest and latest.get("status") in ACTIVE_STATUSES:
            try:
                await sync_room_nights(user["property_id"], latest["room_id"], latest["check_in"], latest["check_out"], res_id)
            except ValueError:
                # Preserve all extant locks if reconciliation detects another
                # reservation conflict; never make occupied inventory appear free.
                pass
        else:
            await release_room_nights(res_id)
        raise HTTPException(status_code=409, detail="Reservation changed. Refresh and try again.")
    if inventory_changed:
        await sync_room_nights(user["property_id"], new_room, new_in, new_out, res_id)
    await log_action(user, "update_reservation", f"Edited reservation {res_id}")
    return await get_reservation(res_id, user)


@router.post("/{res_id}/cancel")
async def cancel_reservation(res_id: str, user: dict = Depends(require("bookings", ["full"]))):
    r = await db.reservations.find_one({"_id": oid(res_id), "property_id": user["property_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if r["status"] == "checked_in":
        raise HTTPException(status_code=400, detail="Cannot cancel a checked-in guest")
    await db.reservations.update_one({"_id": r["_id"]}, {"$set": {"status": "cancelled", "cancelled_at": now_utc().isoformat()}})
    await release_room_nights(res_id)
    await log_action(user, "cancel_reservation", f"Cancelled reservation {res_id}")
    return {"ok": True}


@router.post("/{res_id}/checkin")
async def checkin(res_id: str, user: dict = Depends(require("bookings", ["full"]))):
    r = await db.reservations.find_one({"_id": oid(res_id), "property_id": user["property_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if r["status"] != "confirmed":
        raise HTTPException(status_code=400, detail=f"Cannot check in a reservation that is {r['status']}")
    room = await db.rooms.find_one({"_id": oid(r["room_id"]), "property_id": user["property_id"]})
    if not room or room.get("status") != "available":
        raise HTTPException(status_code=400, detail="Assigned room is not ready for check-in")
    checkin_update = await db.reservations.update_one({"_id": r["_id"], "status": "confirmed"}, {"$set": {
        "status": "checked_in", "actual_checkin": now_utc().isoformat()}})
    if not checkin_update.modified_count:
        raise HTTPException(status_code=409, detail="Reservation status changed. Refresh and try again.")
    await db.rooms.update_one({"_id": room["_id"], "property_id": user["property_id"]}, {"$set": {"status": "occupied"}})
    await log_action(user, "checkin", f"Checked in reservation {res_id}")
    return await get_reservation(res_id, user)


@router.post("/{res_id}/checkout")
async def checkout(res_id: str, user: dict = Depends(require("bookings", ["full"]))):
    r = await db.reservations.find_one({"_id": oid(res_id), "property_id": user["property_id"]})
    if not r:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if r["status"] != "checked_in":
        raise HTTPException(status_code=400, detail="Only checked-in guests can be checked out")
    checkout_update = await db.reservations.update_one({"_id": r["_id"], "property_id": user["property_id"], "status": "checked_in"}, {"$set": {
        "status": "checked_out", "actual_checkout": now_utc().isoformat()}})
    if not checkout_update.modified_count:
        raise HTTPException(status_code=409, detail="Reservation status changed. Refresh and try again.")
    room = await db.rooms.find_one({"_id": oid(r["room_id"]), "property_id": user["property_id"]})
    await db.rooms.update_one({"_id": oid(r["room_id"]), "property_id": user["property_id"]}, {"$set": {"status": "dirty"}})
    # Create housekeeping task automatically
    housekeeper = await db.users.find_one({"property_id": user["property_id"], "role": "housekeeping", "active": True})
    await db.housekeeping_tasks.insert_one({
        "property_id": user["property_id"],
        "room_id": r["room_id"],
        "room_number": room["number"] if room else "",
        "task_type": "checkout_cleaning",
        "type": "checkout_cleaning",
        "priority": "high",
        "status": "pending",
        "assigned_to": str(housekeeper["_id"]) if housekeeper else None,
        "assigned_name": housekeeper.get("name") if housekeeper else None,
        "created_by_id": user["id"],
        "created_by": user["name"],
        "created_at": now_utc().isoformat(),
    })
    recipient_roles = ["owner", "manager", "housekeeping"] if housekeeper else ["owner", "manager"]
    await notify_roles(user["property_id"], recipient_roles, "housekeeping", "Room needs cleaning", f"Room {room['number'] if room else ''} checked out and is ready for cleaning.", "/housekeeping")
    await log_action(user, "checkout", f"Checked out reservation {res_id}, room {room['number'] if room else ''} -> dirty")
    return await get_reservation(res_id, user)
