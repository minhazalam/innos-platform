import os
import random
from datetime import date, timedelta
from pathlib import Path

from core import db, now_utc
from security import hash_password

MEMORY = Path("/app/memory/test_credentials.md")

ROOM_TYPES = [
    {"name": "Standard", "base_price": 2800, "capacity": 2,
     "amenities": ["Wi-Fi", "TV", "Room Heater", "Attached Bath"],
     "photo": "https://images.unsplash.com/photo-1711059985570-4c32ed12a12c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"},
    {"name": "Deluxe", "base_price": 4500, "capacity": 2,
     "amenities": ["Wi-Fi", "Smart TV", "Room Heater", "Mountain View", "Mini Bar"],
     "photo": "https://images.unsplash.com/photo-1670915198844-51975abf6955?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"},
    {"name": "Premium", "base_price": 6500, "capacity": 3,
     "amenities": ["Wi-Fi", "Smart TV", "Balcony", "Mountain View", "Mini Bar", "Bathtub"],
     "photo": "https://images.unsplash.com/photo-1689729739836-7fcc2c84d788?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"},
    {"name": "Family Suite", "base_price": 9000, "capacity": 4,
     "amenities": ["Wi-Fi", "2 Bedrooms", "Living Area", "Mountain View", "Kitchenette", "Balcony"],
     "photo": "https://images.unsplash.com/photo-1711059985570-4c32ed12a12c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"},
]

GUEST_NAMES = [
    ("Aarav Sharma", "+919812300011"), ("Priya Menon", "+919812300022"),
    ("Rohan Gupta", "+919812300033"), ("Ananya Iyer", "+919812300044"),
    ("Vikram Singh", "+919812300055"), ("Neha Kapoor", "+919812300066"),
    ("Arjun Reddy", "+919812300077"), ("Isha Verma", "+919812300088"),
    ("Kabir Malhotra", "+919812300099"), ("Sara Khan", "+919812300100"),
    ("Dev Patel", "+919812300111"), ("Meera Nair", "+919812300122"),
]

SOURCES = ["direct", "walk_in", "phone", "whatsapp", "ota"]


async def seed_admin():
    """Ensure the owner account exists with the .env password."""
    email = os.environ.get("ADMIN_EMAIL", "owner@example.com").lower()
    password = os.environ.get("ADMIN_PASSWORD", "Owner@123")
    prop = await db.properties.find_one({"name": "Dharamshala Heights"})
    if not prop:
        return  # seed_demo will create everything
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "name": "Minhaz Alam", "email": email, "password_hash": hash_password(password),
            "role": "owner", "property_id": str(prop["_id"]), "active": True,
            "created_at": now_utc().isoformat()})


async def seed_demo():
    if await db.properties.find_one({"name": "Dharamshala Heights"}):
        return

    prop_doc = {
        "name": "Dharamshala Heights",
        "logo": None,
        "address": "Naddi Road, McLeod Ganj",
        "city": "Dharamshala",
        "state": "Himachal Pradesh",
        "phone": "+91 1892 220 100",
        "email": "stay@dharamshalaheights.in",
        "description": "A boutique mountain retreat overlooking the Dhauladhar range, offering warm Himachali hospitality with modern comfort.",
        "checkin_time": "14:00",
        "checkout_time": "11:00",
        "currency": "INR",
        "setup_completed": True,
        "policies": {
            "cancellation": "Free cancellation up to 48 hours before check-in. 1 night charged thereafter.",
            "checkin": "Check-in from 2:00 PM. Valid government ID required.",
            "checkout": "Check-out by 11:00 AM. Late checkout subject to availability.",
            "extra_guest": "Extra adult charged at ₹800/night including breakfast.",
            "child": "Children below 6 years stay free. 6-12 years charged at ₹500/night.",
        },
        "payment_settings": {
            "upi_id": "dharamshalaheights@okhdfcbank",
            "upi_name": "Dharamshala Heights",
            "methods": ["upi", "cash", "card", "bank_transfer"],
            "tax_percent": 12.0,
        },
        "created_at": now_utc().isoformat(),
    }
    prop_res = await db.properties.insert_one(prop_doc)
    pid = str(prop_res.inserted_id)

    # Users
    owner_email = os.environ.get("ADMIN_EMAIL", "owner@example.com").lower()
    owner_password = os.environ.get("ADMIN_PASSWORD", "Owner@123")
    users = [
        {"name": "Minhaz Alam", "email": owner_email, "password": owner_password, "role": "owner"},
        {"name": "Rahul Thakur", "email": "manager@dharamshalaheights.in", "password": "Manager@123", "role": "manager"},
        {"name": "Sunita Devi", "email": "frontdesk@dharamshalaheights.in", "password": "Frontdesk@123", "role": "front_desk"},
        {"name": "Ramesh Kumar", "email": "housekeeping@dharamshalaheights.in", "password": "House@123", "role": "housekeeping"},
        {"name": "Bhupender Rana", "email": "maintenance@dharamshalaheights.in", "password": "Maint@123", "role": "maintenance"},
    ]
    for u in users:
        await db.users.insert_one({
            "name": u["name"], "email": u["email"], "password_hash": hash_password(u["password"]),
            "role": u["role"], "property_id": pid, "phone": "+91 98123 45678",
            "active": True, "created_at": now_utc().isoformat()})

    # Room types + rooms (30 rooms)
    type_ids = []
    for rt in ROOM_TYPES:
        doc = {**rt, "property_id": pid, "created_at": now_utc().isoformat()}
        r = await db.room_types.insert_one(doc)
        type_ids.append(str(r.inserted_id))

    # distribution: Standard 10, Deluxe 10, Premium 6, Family Suite 4
    layout = [
        (type_ids[0], ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110"], "1"),
        (type_ids[1], ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210"], "2"),
        (type_ids[2], ["301", "302", "303", "304", "305", "306"], "3"),
        (type_ids[3], ["401", "402", "403", "404"], "4"),
    ]
    room_ids = {}
    for tid, numbers, floor in layout:
        for n in numbers:
            r = await db.rooms.insert_one({
                "property_id": pid, "room_type_id": tid, "number": n, "floor": floor,
                "status": "available", "created_at": now_utc().isoformat()})
            room_ids[n] = (str(r.inserted_id), tid)

    # Guests
    guest_ids = []
    for name, phone in GUEST_NAMES:
        g = await db.guests.insert_one({
            "property_id": pid, "name": name, "phone": phone,
            "email": name.split()[0].lower() + "@example.com",
            "address": "India", "preferences": "", "notes": "",
            "created_at": now_utc().isoformat()})
        guest_ids.append(str(g.inserted_id))

    type_price = {tid: rt["base_price"] for tid, rt in zip(type_ids, ROOM_TYPES)}
    today = date.today()

    async def make_res(guest_id, room_num, ci, co, status, source, paid_ratio):
        rid, tid = room_ids[room_num]
        nights = max((co - ci).days, 1)
        rate = type_price[tid]
        total = rate * nights
        paid = round(total * paid_ratio, 2)
        await db.reservations.insert_one({
            "property_id": pid, "guest_id": guest_id, "room_id": rid, "room_type_id": tid,
            "check_in": ci.isoformat(), "check_out": co.isoformat(), "num_guests": random.randint(1, 3),
            "source": source, "special_requests": "", "notes": "", "status": status,
            "nights": nights, "rate_per_night": rate, "total_amount": total, "paid_amount": paid,
            "created_by": "System", "created_at": now_utc().isoformat()})
        if status == "checked_in":
            await db.rooms.update_one({"_id": __import__("bson").ObjectId(rid)}, {"$set": {"status": "occupied"}})
        if paid > 0:
            await db.payments.insert_one({
                "property_id": pid, "reservation_id": None, "guest_id": guest_id,
                "amount": paid, "method": random.choice(["upi", "cash", "card"]),
                "reference": "", "status": "completed", "recorded_by": "System",
                "created_at": now_utc().isoformat()})

    # Currently checked-in guests (occupying rooms) - departing over next days
    checked_in_rooms = ["101", "103", "202", "204", "205", "301", "302", "401"]
    for i, rn in enumerate(checked_in_rooms):
        ci = today - timedelta(days=random.randint(1, 3))
        co = today + timedelta(days=random.randint(0, 3))
        ratio = random.choice([0.5, 1.0, 0.3])
        await make_res(guest_ids[i % len(guest_ids)], rn, ci, co, "checked_in", random.choice(SOURCES), ratio)

    # Departures today (checked_in, checkout == today)
    for rn in ["105", "206"]:
        ci = today - timedelta(days=2)
        await make_res(guest_ids[random.randint(0, len(guest_ids) - 1)], rn, ci, today, "checked_in",
                       random.choice(SOURCES), 0.5)

    # Arrivals today (confirmed, checkin == today)
    for rn in ["106", "207", "303", "402"]:
        co = today + timedelta(days=random.randint(1, 3))
        await make_res(guest_ids[random.randint(0, len(guest_ids) - 1)], rn, today, co, "confirmed",
                       random.choice(SOURCES), random.choice([0.0, 0.3]))

    # Future confirmed bookings
    for rn in ["102", "203", "304", "403"]:
        ci = today + timedelta(days=random.randint(2, 8))
        co = ci + timedelta(days=random.randint(1, 4))
        await make_res(guest_ids[random.randint(0, len(guest_ids) - 1)], rn, ci, co, "confirmed",
                       random.choice(SOURCES), random.choice([0.0, 0.5]))

    # Past completed stays
    for rn in ["107", "208"]:
        ci = today - timedelta(days=random.randint(8, 14))
        co = ci + timedelta(days=random.randint(1, 3))
        await make_res(guest_ids[random.randint(0, len(guest_ids) - 1)], rn, ci, co, "checked_out",
                       random.choice(SOURCES), 1.0)

    # Room states for realism
    await db.rooms.update_one({"property_id": pid, "number": "104"}, {"$set": {"status": "dirty"}})
    await db.rooms.update_one({"property_id": pid, "number": "209"}, {"$set": {"status": "cleaning"}})
    await db.rooms.update_one({"property_id": pid, "number": "305"}, {"$set": {"status": "maintenance"}})

    await write_credentials(users)


async def write_credentials(users):
    lines = ["# Test Credentials — HotelOS\n",
             "\nAll accounts belong to the demo hotel **Dharamshala Heights**.\n",
             "\n| Role | Email | Password |",
             "\n|------|-------|----------|"]
    for u in users:
        lines.append(f"\n| {u['role']} | {u['email']} | {u['password']} |")
    lines.append("\n\n## Auth endpoints\n")
    lines.append("- POST /api/auth/login  (body: {email, password})\n")
    lines.append("- POST /api/auth/logout\n")
    lines.append("- GET  /api/auth/me\n")
    lines.append("\nLogin sets httpOnly cookies (access_token, refresh_token).\n")
    MEMORY.parent.mkdir(parents=True, exist_ok=True)
    MEMORY.write_text("".join(lines))
