from fastapi import APIRouter, Depends
from typing import Optional

from core import db, serialize
from security import require

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("")
async def list_audit_logs(action: Optional[str] = None, limit: int = 100,
                          user: dict = Depends(require("audit", ["full", "limited"]))):
    query = {"property_id": user["property_id"]}
    if action:
        query["action"] = action
    logs = await db.audit_logs.find(query).sort("timestamp", -1).limit(max(1, min(limit, 500))).to_list(max(1, min(limit, 500)))
    return [serialize(log) for log in logs]
