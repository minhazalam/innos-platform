from core import db, now_utc


async def notify_roles(property_id: str, roles: list[str], kind: str, title: str, message: str, link: str = "/"):
    users = await db.users.find({"property_id": property_id, "role": {"$in": roles}, "active": True}).to_list(500)
    if not users:
        return
    now = now_utc().isoformat()
    await db.notifications.insert_many([
        {
            "property_id": property_id, "recipient_id": str(user["_id"]),
            "kind": kind, "title": title, "message": message, "link": link,
            "read": False, "created_at": now,
        }
        for user in users
    ])
