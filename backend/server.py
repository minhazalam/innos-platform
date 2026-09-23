import os
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core import db
from security import get_current_user
from routers import auth, setup, rooms, guests, reservations, payments, dashboard, staff
import seed

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("hotelos")

app = FastAPI(title="HotelOS API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "HotelOS API", "status": "ok"}


for r in (auth.router, setup.router, rooms.router, guests.router,
          reservations.router, payments.router, dashboard.router, staff.router):
    api_router.include_router(r)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.rooms.create_index([("property_id", 1), ("number", 1)])
    await db.reservations.create_index([("property_id", 1), ("room_id", 1)])
    try:
        await seed.seed_demo()
        await seed.seed_admin()
        logger.info("Seed complete")
    except Exception as e:
        logger.error(f"Seed error: {e}")


@app.on_event("shutdown")
async def shutdown():
    from core import client
    client.close()
