from datetime import date
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from core import db, oid, serialize, now_utc, nights_between, claim_room_nights
from notifications_service import notify_roles

router = APIRouter(prefix="/public", tags=["public-booking"])


class PublicBookingIn(BaseModel):
    room_type_id: str
    check_in: str
    check_out: str
    num_guests: int = Field(ge=1, le=12)
    guest_name: str = Field(min_length=2, max_length=120)
    guest_phone: str = Field(min_length=7, max_length=30)
    guest_email: Optional[EmailStr] = None
    special_requests: Optional[str] = ""


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


async def _property(slug: str):
    prop = await db.properties.find_one({"booking_slug": slug, "booking_website_enabled": True})
    if not prop:
        # Allow properties seeded before the public booking slug migration.
        candidates = await db.properties.find({"booking_website_enabled": {"$ne": False}}).to_list(1000)
        prop = next((p for p in candidates if _slug(p.get("name", "")) == slug), None)
    if not prop:
        raise HTTPException(status_code=404, detail="Booking page not found")
    return prop


def _valid_dates(check_in: str, check_out: str):
    try:
        start = date.fromisoformat(check_in)
        end = date.fromisoformat(check_out)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Choose valid check-in and check-out dates")
    if end <= start:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in")
    if start < date.today():
        raise HTTPException(status_code=400, detail="Check-in date must be today or later")
    return start, end


async def _available_rooms(prop, room_type_id: str, check_in: str, check_out: str, num_guests: int):
    property_id = str(prop["_id"])
    room_type = await db.room_types.find_one({
        "_id": oid(room_type_id), "property_id": property_id,
    })
    if not room_type:
        raise HTTPException(status_code=404, detail="Room type not found")
    if num_guests > room_type.get("capacity", 2):
        raise HTTPException(status_code=400, detail="Guest count exceeds this room type's capacity")
    rooms = await db.rooms.find({
        "property_id": property_id, "room_type_id": room_type_id,
        "status": {"$nin": ["maintenance", "out_of_order"]},
    }).to_list(500)
    if not rooms:
        return room_type, []
    room_ids = [str(room["_id"]) for room in rooms]
    overlaps = await db.reservations.find({
        "property_id": property_id, "room_id": {"$in": room_ids},
        "status": {"$in": ["confirmed", "checked_in"]},
        "check_in": {"$lt": check_out}, "check_out": {"$gt": check_in},
    }, {"room_id": 1}).to_list(1000)
    unavailable = {item["room_id"] for item in overlaps}
    locks = await db.room_inventory_locks.find({
        "property_id": property_id, "room_id": {"$in": room_ids},
        "night": {"$gte": check_in, "$lt": check_out},
    }, {"room_id": 1}).to_list(1000)
    unavailable.update(item["room_id"] for item in locks)
    return room_type, [room for room in rooms if str(room["_id"]) not in unavailable]


@router.get("/{slug}")
async def booking_page(slug: str):
    prop = await _property(slug)
    property_id = str(prop["_id"])
    types = await db.room_types.find({"property_id": property_id}).sort("base_price", 1).to_list(200)
    room_counts = await db.rooms.aggregate([
        {"$match": {"property_id": property_id}},
        {"$group": {"_id": "$room_type_id", "count": {"$sum": 1}}},
    ]).to_list(200)
    counts = {row["_id"]: row["count"] for row in room_counts}
    return {
        "name": prop.get("name", "Hotel"), "slug": prop.get("booking_slug") or _slug(prop.get("name", "hotel")),
        "address": prop.get("address", ""), "city": prop.get("city", ""), "state": prop.get("state", ""),
        "phone": prop.get("phone", ""), "email": prop.get("email", ""),
        "description": prop.get("booking_description", prop.get("description", "")),
        "headline": prop.get("booking_headline", "Book your stay"),
        "checkin_time": prop.get("checkin_time", "14:00"), "checkout_time": prop.get("checkout_time", "11:00"),
        "policies": prop.get("policies", {}),
        "tax_percent": prop.get("payment_settings", {}).get("tax_percent", 0),
        "room_types": [
            {"id": str(item["_id"]), "name": item["name"], "base_price": item.get("base_price", 0),
             "capacity": item.get("capacity", 2), "amenities": item.get("amenities", []),
             "photo": item.get("photo"), "description": item.get("description", ""),
             "room_count": counts.get(str(item["_id"]), 0)}
            for item in types
        ],
    }


@router.get("/{slug}/availability")
async def availability(slug: str, check_in: str, check_out: str, guests: int = 1):
    prop = await _property(slug)
    _valid_dates(check_in, check_out)
    if guests < 1 or guests > 12:
        raise HTTPException(status_code=400, detail="Guest count must be between 1 and 12")
    types = await db.room_types.find({"property_id": str(prop["_id"])}).sort("base_price", 1).to_list(200)
    tax_percent = (prop.get("payment_settings") or {}).get("tax_percent", 0) or 0
    results = []
    for item in types:
        if guests > item.get("capacity", 2):
            continue
        _, rooms = await _available_rooms(prop, str(item["_id"]), check_in, check_out, guests)
        charge = round(item.get("base_price", 0) * nights_between(check_in, check_out), 2)
        tax = round(charge * tax_percent / 100, 2)
        results.append({
            "room_type_id": str(item["_id"]), "room_type": item["name"],
            "available_rooms": len(rooms), "room_charge": charge,
            "tax": tax, "total": round(charge + tax, 2),
        })
    return results


@router.post("/{slug}/bookings")
async def create_public_booking(slug: str, body: PublicBookingIn):
    prop = await _property(slug)
    _valid_dates(body.check_in, body.check_out)
    property_id = str(prop["_id"])
    room_type, rooms = await _available_rooms(prop, body.room_type_id, body.check_in, body.check_out, body.num_guests)
    if not rooms:
        raise HTTPException(status_code=409, detail="This room type is no longer available for those dates")
    room = sorted(rooms, key=lambda item: item.get("number", ""))[0]
    phone = body.guest_phone.strip()
    guest = await db.guests.find_one({"property_id": property_id, "phone": phone})
    if guest:
        await db.guests.update_one({"_id": guest["_id"], "property_id": property_id}, {"$set": {
            "name": body.guest_name.strip(), "email": str(body.guest_email or ""),
        }})
        guest_id = str(guest["_id"])
    else:
        guest_result = await db.guests.insert_one({
            "property_id": property_id, "name": body.guest_name.strip(), "phone": phone,
            "email": str(body.guest_email or ""), "created_at": now_utc().isoformat(),
            "preferences": "", "notes": "",
        })
        guest_id = str(guest_result.inserted_id)
    nights = nights_between(body.check_in, body.check_out)
    room_charge = round(room_type.get("base_price", 0) * nights, 2)
    tax_percent = (prop.get("payment_settings") or {}).get("tax_percent", 0) or 0
    tax = round(room_charge * tax_percent / 100, 2)
    total = round(room_charge + tax, 2)
    reservation = {
        "property_id": property_id, "guest_id": guest_id, "room_id": str(room["_id"]),
        "room_type_id": str(room_type["_id"]), "check_in": body.check_in, "check_out": body.check_out,
        "num_guests": body.num_guests, "source": "direct", "special_requests": body.special_requests or "",
        "notes": "Created from the public booking website", "status": "confirmed",
        "nights": nights, "rate_per_night": room_type.get("base_price", 0),
        "room_charge_amount": room_charge, "tax_amount": tax, "total_amount": total,
        "paid_amount": 0, "payment_status": "pending", "created_by": "Public booking website",
        "created_at": now_utc().isoformat(),
    }
    inserted = await db.reservations.insert_one(reservation)
    reservation_id = str(inserted.inserted_id)
    try:
        await claim_room_nights(property_id, str(room["_id"]), body.check_in, body.check_out, reservation_id)
    except ValueError as exc:
        await db.reservations.delete_one({"_id": inserted.inserted_id, "property_id": property_id})
        raise HTTPException(status_code=409, detail=str(exc))
    await notify_roles(property_id, ["owner", "manager", "front_desk"], "reservation", "New direct booking", f"Room {room['number']} · {body.check_in} to {body.check_out}", "/reservations")
    return {
        "booking_id": reservation_id[-8:].upper(), "reservation_id": reservation_id,
        "hotel_name": prop.get("name", "Hotel"), "room_type": room_type["name"],
        "room_number": room["number"], "check_in": body.check_in, "check_out": body.check_out,
        "total_amount": total, "paid_amount": 0, "payment_status": "pending",
        "message": "Your reservation is confirmed. Payment is due directly to the hotel.",
    }
