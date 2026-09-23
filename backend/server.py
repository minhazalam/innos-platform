import os
import logging
import re
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from core import db, claim_room_nights
from security import get_current_user
from routers import (auth, setup, rooms, guests, reservations, payments, dashboard,
                     staff, housekeeping, maintenance, guest_requests, notifications)
from routers import audit
from routers import public_booking
from routers import analytics
from routers import ai_manager
from routers import search
import seed

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("innos")

app = FastAPI(title="Innos API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Innos API", "status": "ok"}


for r in (auth.router, setup.router, rooms.router, guests.router,
          reservations.router, payments.router, dashboard.router, staff.router,
          housekeeping.router, maintenance.router, guest_requests.router,
          notifications.router, audit.router, public_booking.router, analytics.router,
          ai_manager.router, search.router):
    api_router.include_router(r)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def cookie_origin_check(request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and (
        request.cookies.get("access_token") or request.cookies.get("refresh_token")
    ):
        origin = request.headers.get("origin")
        allowed = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
        if origin and origin.rstrip("/") != allowed:
            return JSONResponse({"detail": "Request origin is not allowed"}, status_code=403)
    return await call_next(request)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.rooms.create_index([("property_id", 1), ("number", 1)])
    await db.reservations.create_index([("property_id", 1), ("room_id", 1)])
    await db.room_inventory_locks.create_index(
        [("property_id", 1), ("room_id", 1), ("night", 1)], unique=True)
    await db.housekeeping_tasks.create_index([("property_id", 1), ("assigned_to", 1), ("status", 1)])
    await db.maintenance_issues.create_index([("property_id", 1), ("assigned_to", 1), ("status", 1)])
    await db.guest_requests.create_index([("property_id", 1), ("assigned_to", 1), ("status", 1)])
    await db.notifications.create_index([("property_id", 1), ("recipient_id", 1), ("created_at", -1)])
    await db.payment_reconciliations.create_index([("property_id", 1), ("created_at", -1)])
    # Backfill and de-duplicate public slugs before enforcing uniqueness. This
    # also keeps older property records addressable after the public-booking
    # feature is introduced.
    try:
        if os.environ.get("SEED_DEMO", "false").lower() in ("1", "true", "yes"):
            await seed.seed_demo()
            await seed.seed_admin()
        used_slugs = set()
        async for prop in db.properties.find({}).sort("created_at", 1):
            base = re.sub(r"[^a-z0-9]+", "-", prop.get("booking_slug") or prop.get("name", "hotel").lower()).strip("-") or "hotel"
            slug = base
            suffix = 2
            while slug in used_slugs:
                slug = f"{base}-{suffix}"
                suffix += 1
            used_slugs.add(slug)
            updates = {}
            if prop.get("booking_slug") != slug:
                updates["booking_slug"] = slug
            if "booking_website_enabled" not in prop:
                updates["booking_website_enabled"] = True
            if updates:
                await db.properties.update_one({"_id": prop["_id"]}, {"$set": updates})
        await db.properties.create_index("booking_slug", unique=True, sparse=True)
        active = db.reservations.find({"status": {"$in": ["confirmed", "checked_in"]}}).sort("created_at", 1)
        async for reservation in active:
            try:
                await claim_room_nights(
                    reservation["property_id"], reservation["room_id"],
                    reservation["check_in"], reservation["check_out"], str(reservation["_id"]),
                )
            except ValueError as exc:
                logger.warning("Could not backfill inventory for reservation %s: %s", reservation["_id"], exc)
        logger.info("Seed complete")
    except Exception as e:
        logger.error(f"Seed error: {e}")


@app.on_event("shutdown")
async def shutdown():
    from core import client
    client.close()
