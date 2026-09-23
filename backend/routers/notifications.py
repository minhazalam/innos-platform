from fastapi import APIRouter, Depends, HTTPException

from core import db, oid, serialize, now_utc
from security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(unread_only: bool = False, user: dict = Depends(get_current_user)):
    query = {"property_id": user["property_id"], "recipient_id": user["id"]}
    if unread_only:
        query["read"] = False
    items = await db.notifications.find(query).sort("created_at", -1).limit(100).to_list(100)
    return [serialize(item) for item in items]


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one({
        "_id": oid(notification_id), "property_id": user["property_id"],
        "recipient_id": user["id"],
    }, {"$set": {"read": True, "read_at": now_utc().isoformat()}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}
