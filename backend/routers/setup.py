from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

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
    tax_percent: Optional[float] = 12.0


async def get_property_for(user):
    prop = await db.properties.find_one({"_id": oid(user.get("property_id"))})
    if not prop:
        raise HTTPException(status_code=404, detail="Hotel not configured")
    return prop


@router.get("/property")
async def get_property(user: dict = Depends(get_current_user)):
    prop = await get_property_for(user)
    return serialize(prop)


@router.put("/property")
async def update_hotel(body: HotelInfo, user: dict = Depends(require("settings", ["full", "limited"]))):
    prop = await get_property_for(user)
    data = body.model_dump()
    data["setup_completed"] = True
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
