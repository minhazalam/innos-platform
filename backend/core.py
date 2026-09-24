import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, date, timedelta
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return now_utc().isoformat()


def oid(v):
    """Coerce a value into an ObjectId, returning None if invalid."""
    try:
        return ObjectId(v)
    except Exception:
        return None


def serialize(doc):
    """Convert a Mongo document into a JSON-safe dict (_id -> id, ObjectId -> str)."""
    if doc is None:
        return None
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d.pop("_id"))
    for k, v in list(d.items()):
        if isinstance(v, ObjectId):
            d[k] = str(v)
    d.pop("password_hash", None)
    return d


def nights_between(check_in: str, check_out: str) -> int:
    ci = date.fromisoformat(check_in)
    co = date.fromisoformat(check_out)
    return max((co - ci).days, 1)


def date_ranges_overlap(a_in: str, a_out: str, b_in: str, b_out: str) -> bool:
    return not (a_out <= b_in or a_in >= b_out)


async def claim_room_nights(property_id: str, room_id: str, check_in: str, check_out: str, reservation_id: str):
    """Atomically claim every occupied night using a unique inventory index."""
    first = date.fromisoformat(check_in)
    last = date.fromisoformat(check_out)
    locks = []
    current = first
    while current < last:
        locks.append({
            "property_id": property_id, "room_id": room_id,
            "night": current.isoformat(), "reservation_id": reservation_id,
        })
        current += timedelta(days=1)
    if not locks:
        raise ValueError("Reservation must include at least one night")
    newly_claimed = []
    for lock in locks:
        unique = {key: lock[key] for key in ("property_id", "room_id", "night")}
        try:
            await db.room_inventory_locks.insert_one(lock)
            newly_claimed.append(lock["night"])
        except DuplicateKeyError as exc:
            existing = await db.room_inventory_locks.find_one(unique)
            if existing and existing.get("reservation_id") == reservation_id:
                continue
            if newly_claimed:
                await db.room_inventory_locks.delete_many({
                    **unique, "night": {"$in": newly_claimed}, "reservation_id": reservation_id,
                })
            raise ValueError("Room is no longer available for the selected dates") from exc
        except Exception:
            if newly_claimed:
                await db.room_inventory_locks.delete_many({
                    "property_id": property_id, "room_id": room_id,
                    "night": {"$in": newly_claimed}, "reservation_id": reservation_id,
                })
            raise


async def release_room_nights(reservation_id: str):
    await db.room_inventory_locks.delete_many({"reservation_id": reservation_id})


async def sync_room_nights(property_id: str, room_id: str, check_in: str, check_out: str, reservation_id: str):
    """Ensure an active reservation owns exactly the nights in its saved stay."""
    first = date.fromisoformat(check_in)
    last = date.fromisoformat(check_out)
    nights = []
    current = first
    while current < last:
        nights.append(current.isoformat())
        current += timedelta(days=1)
    if not nights:
        raise ValueError("Reservation must include at least one night")
    # Claim the current range before dropping stale nights. If claiming fails,
    # the previously persisted inventory remains protected.
    await claim_room_nights(property_id, room_id, check_in, check_out, reservation_id)
    await db.room_inventory_locks.delete_many({
        "reservation_id": reservation_id,
        "$nor": [{"room_id": room_id, "night": {"$in": nights}}],
    })
