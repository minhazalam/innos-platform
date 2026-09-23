import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, date
from bson import ObjectId

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
