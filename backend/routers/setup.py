from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import re

from core import db, oid, serialize
from security import require, get_current_user, log_action, get_level

router = APIRouter(prefix="/setup", tags=["setup"])


class HotelInfo(BaseModel):
    name: str
    logo: Optional[str] = None
    address: Optional[str] = ""
    city: Optional[str] = "Dharamshala"
    state: Optional[str] = "Himachal Pradesh"
    phone: Optional[str] = ""
    email: Optional[str] = ""
    checkin_time: Optional[str] = "14:00"
    checkout_time: Optional[str] = "11:00"
    description: Optional[str] = ""


class Policies(BaseModel):
    cancellation: Optional[str] = ""
    checkin: Optional[str] = ""
    checkout: Optional[str] = ""
    extra_guest: Optional[str] = ""
    child: Optional[str] = ""


class PaymentSettings(BaseModel):
    upi_id: Optional[str] = ""
    upi_name: Optional[str] = ""
    methods: List[str] = ["upi", "cash", "card", "bank_transfer"]
    tax_percent: Optional[float] = Field(default=12.0, ge=0, le=100)


class BookingWebsiteSettings(BaseModel):
    enabled: bool = True
    slug: str
    headline: Optional[str] = "Book your stay"
    public_description: Optional[str] = ""


async def get_property_for(user):
    prop = await db.properties.find_one({"_id": oid(user.get("property_id"))})
    if not prop:
        raise HTTPException(status_code=404, detail="Hotel not configured")
    return prop


@router.get("/property")
async def get_property(user: dict = Depends(get_current_user)):
    prop = await get_property_for(user)
    data = serialize(prop)
    if user["role"] == "manager":
        data.pop("payment_settings", None)
        return data
    if user["role"] != "owner":
        # Frontline users need the property's name and operating hours, not
        # payment configuration or owner contact details.
        return {key: data.get(key) for key in ("id", "name", "city", "state", "checkin_time", "checkout_time", "description", "setup_completed")}
    return data


@router.put("/property")
async def update_hotel(body: HotelInfo, user: dict = Depends(require("settings", ["full", "limited"]))):
    prop = await get_property_for(user)
    data = body.model_dump()
    await db.properties.update_one({"_id": prop["_id"]}, {"$set": data})
    await log_action(user, "update_hotel", "Updated hotel information")
    return serialize(await db.properties.find_one({"_id": prop["_id"]}))


@router.put("/policies")
async def update_policies(body: Policies, user: dict = Depends(require("settings", ["full", "limited"]))):
    prop = await get_property_for(user)
    await db.properties.update_one({"_id": prop["_id"]}, {"$set": {"policies": body.model_dump()}})
    await log_action(user, "update_policies", "Updated hotel policies")
    return serialize(await db.properties.find_one({"_id": prop["_id"]}))


@router.put("/payment-settings")
async def update_payment_settings(body: PaymentSettings, user: dict = Depends(require("payment_settings", ["full"]))):
    prop = await get_property_for(user)
    await db.properties.update_one({"_id": prop["_id"]}, {"$set": {"payment_settings": body.model_dump()}})
    await log_action(user, "update_payment_settings", "Updated payment settings")
    return serialize(await db.properties.find_one({"_id": prop["_id"]}))


@router.get("/booking-website")
async def get_booking_website(user: dict = Depends(require("booking_website", ["full", "limited"]))):
    prop = await get_property_for(user)
    slug = prop.get("booking_slug") or re.sub(r"[^a-z0-9]+", "-", prop.get("name", "hotel").lower()).strip("-")
    return {"enabled": prop.get("booking_website_enabled", True), "slug": slug,
            "headline": prop.get("booking_headline", "Book your stay"),
            "public_description": prop.get("booking_description", prop.get("description", ""))}


@router.put("/booking-website")
async def update_booking_website(body: BookingWebsiteSettings, user: dict = Depends(require("booking_website", ["full", "limited"]))):
    prop = await get_property_for(user)
    slug = body.slug.strip().lower()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise HTTPException(status_code=400, detail="Use lowercase letters, numbers and single hyphens in the booking URL")
    collision = await db.properties.find_one({"booking_slug": slug, "_id": {"$ne": prop["_id"]}})
    if collision:
        raise HTTPException(status_code=409, detail="That booking URL is already in use")
    updates = {
        "booking_slug": slug, "booking_website_enabled": body.enabled,
        "booking_headline": body.headline, "booking_description": body.public_description,
    }
    await db.properties.update_one({"_id": prop["_id"]}, {"$set": updates})
    await log_action(user, "update_booking_website", f"Updated booking website /book/{slug}")
    return {"enabled": body.enabled, "slug": slug, "headline": body.headline,
            "public_description": body.public_description}


@router.post("/complete")
async def complete_setup(user: dict = Depends(require("settings", ["full"]))):
    prop = await get_property_for(user)
    room_count = await db.rooms.count_documents({"property_id": user["property_id"]})
    type_count = await db.room_types.count_documents({"property_id": user["property_id"]})
    if not room_count or not type_count:
        raise HTTPException(status_code=400, detail="Add at least one room type and one room before finishing setup")
    await db.properties.update_one({"_id": prop["_id"]}, {"$set": {"setup_completed": True}})
    await log_action(user, "complete_property_setup", "Completed hotel setup")
    return serialize(await db.properties.find_one({"_id": prop["_id"]}))
