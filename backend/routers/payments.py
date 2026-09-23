from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
import io
import base64
import urllib.parse

import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from core import db, oid, serialize, now_utc, nights_between
from security import require, get_current_user, log_action
from notifications_service import notify_roles

router = APIRouter(prefix="/payments", tags=["payments"])

PAYMENT_METHODS = ["upi", "card", "cash", "bank_transfer", "online"]


class PaymentIn(BaseModel):
    reservation_id: str
    amount: float
    method: str
    reference: Optional[str] = ""


class UPIRequest(BaseModel):
    reservation_id: str
    amount: float


class RefundIn(BaseModel):
    payment_id: str
    amount: float = Field(gt=0)
    reason: str = ""


class ReconciliationRow(BaseModel):
    reference: str = Field(min_length=1, max_length=160)
    amount: float = Field(gt=0)
    date: Optional[str] = ""
    method: Optional[str] = ""


class ReconciliationIn(BaseModel):
    rows: List[ReconciliationRow] = Field(min_length=1, max_length=500)


@router.get("")
async def list_payments(user: dict = Depends(require("payments", ["full", "operational", "accounts"]))):
    query = {"property_id": user["property_id"]}
    if user["role"] == "front_desk":
        active = await db.reservations.find({
            "property_id": user["property_id"], "status": {"$in": ["confirmed", "checked_in"]},
        }, {"_id": 1}).to_list(2000)
        query["reservation_id"] = {"$in": [str(r["_id"]) for r in active]}
    payments = await db.payments.find(query).sort("created_at", -1).to_list(1000)
    guests = {} if user["role"] == "accounts" else {str(g["_id"]): g for g in await db.guests.find({"property_id": user["property_id"]}).to_list(1000)}
    out = []
    for p in payments:
        s = serialize(p)
        if user["role"] == "accounts":
            s.pop("guest_id", None)
            s["guest_name"] = f"Reservation · {str(s.get('reservation_id', ''))[-6:]}"
        else:
            g = guests.get(s.get("guest_id"))
            s["guest_name"] = g["name"] if g else "—"
        out.append(s)
    return out


@router.post("")
async def record_payment(body: PaymentIn, user: dict = Depends(require("payments", ["full", "operational"]))):
    if body.method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Invalid payment method")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    res = await db.reservations.find_one({"_id": oid(body.reservation_id), "property_id": user["property_id"]})
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found")

    amount = round(body.amount, 2)
    balance = round(res.get("total_amount", 0) - res.get("paid_amount", 0), 2)
    if amount > balance:
        raise HTTPException(status_code=400, detail=f"Payment exceeds the remaining balance of ₹{balance:.2f}")

    # Conditional increment prevents two concurrent staff actions from
    # collecting more than the current balance.
    update = await db.reservations.update_one({
        "_id": res["_id"], "property_id": user["property_id"],
        "paid_amount": {"$lte": round(res.get("total_amount", 0) - amount, 2)},
    }, {"$inc": {"paid_amount": amount}})
    if not update.modified_count:
        raise HTTPException(status_code=409, detail="Balance changed. Refresh the reservation and try again.")

    doc = {
        "property_id": user["property_id"],
        "reservation_id": body.reservation_id,
        "guest_id": res.get("guest_id"),
        "amount": amount,
        "method": body.method,
        "reference": body.reference,
        "status": "completed",
        "recorded_by": user["name"],
        "created_at": now_utc().isoformat(),
    }
    try:
        p = await db.payments.insert_one(doc)
    except Exception as exc:
        await db.reservations.update_one({"_id": res["_id"], "property_id": user["property_id"]}, {"$inc": {"paid_amount": -amount}})
        raise HTTPException(status_code=500, detail="Could not save payment record; the balance was restored") from exc
    current = await db.reservations.find_one({"_id": res["_id"], "property_id": user["property_id"]})
    payment_status = "paid" if current.get("paid_amount", 0) >= current.get("total_amount", 0) else "partially_paid"
    await db.reservations.update_one({"_id": res["_id"], "property_id": user["property_id"]}, {"$set": {"payment_status": payment_status}})
    await log_action(user, "record_payment", f"Recorded ₹{body.amount} ({body.method}) for reservation {body.reservation_id}")
    await notify_roles(user["property_id"], ["owner", "manager"], "payment", "Payment recorded", f"₹{amount:.2f} recorded for reservation {body.reservation_id[-6:]}.", "/payments")
    return serialize(await db.payments.find_one({"_id": p.inserted_id}))


@router.post("/refund")
async def refund_payment(body: RefundIn, user: dict = Depends(require("payments", ["full"]))):
    if user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the property owner can issue a refund")
    payment = await db.payments.find_one({
        "_id": oid(body.payment_id), "property_id": user["property_id"], "status": "completed",
    })
    if not payment:
        raise HTTPException(status_code=404, detail="Completed payment not found")
    already_refunded = payment.get("refunded_amount", 0)
    refundable = round(payment["amount"] - already_refunded, 2)
    amount = round(body.amount, 2)
    if amount > refundable:
        raise HTTPException(status_code=400, detail=f"Refund exceeds the remaining refundable amount of ₹{refundable:.2f}")
    res = await db.reservations.find_one({
        "_id": oid(payment.get("reservation_id")), "property_id": user["property_id"],
    })
    if not res:
        raise HTTPException(status_code=404, detail="Reservation for this payment was not found")
    conditional = await db.payments.update_one({
        "_id": payment["_id"], "property_id": user["property_id"], "status": "completed",
        "$or": [{"refunded_amount": {"$exists": False}}, {"refunded_amount": {"$lte": round(payment["amount"] - amount, 2)}}],
    }, {"$inc": {"refunded_amount": amount}})
    if not conditional.modified_count:
        raise HTTPException(status_code=409, detail="Refundable amount changed. Refresh and try again.")
    balance_update = await db.reservations.update_one({
        "_id": res["_id"], "property_id": user["property_id"], "paid_amount": {"$gte": amount},
    }, {"$inc": {"paid_amount": -amount}})
    if not balance_update.modified_count:
        await db.payments.update_one({"_id": payment["_id"]}, {"$inc": {"refunded_amount": -amount}})
        raise HTTPException(status_code=409, detail="Reservation payment balance changed. Refresh and try again.")
    refund = {
        "property_id": user["property_id"], "reservation_id": payment["reservation_id"],
        "guest_id": payment.get("guest_id"), "amount": amount, "method": payment.get("method", ""),
        "reference": body.reason, "status": "refunded", "parent_payment_id": str(payment["_id"]),
        "recorded_by": user["name"], "created_at": now_utc().isoformat(),
    }
    try:
        result = await db.payments.insert_one(refund)
    except Exception as exc:
        await db.reservations.update_one({"_id": res["_id"], "property_id": user["property_id"]}, {"$inc": {"paid_amount": amount}})
        await db.payments.update_one({"_id": payment["_id"]}, {"$inc": {"refunded_amount": -amount}})
        raise HTTPException(status_code=500, detail="Could not save refund record; the reservation balance was restored") from exc
    current = await db.reservations.find_one({"_id": res["_id"], "property_id": user["property_id"]})
    status = "paid" if current.get("paid_amount", 0) >= current.get("total_amount", 0) else "partially_paid" if current.get("paid_amount", 0) else "pending"
    await db.reservations.update_one({"_id": res["_id"], "property_id": user["property_id"]}, {"$set": {"payment_status": status}})
    await log_action(user, "refund_payment", f"Refunded ₹{amount:.2f} for reservation {payment['reservation_id']}; reason: {body.reason}")
    await notify_roles(user["property_id"], ["owner", "manager"], "refund", "Payment refunded", f"₹{amount:.2f} refunded for reservation {payment['reservation_id'][-6:]}.", "/payments")
    return serialize(await db.payments.find_one({"_id": result.inserted_id}))


@router.get("/reconciliations")
async def list_reconciliations(user: dict = Depends(require("payments", ["full", "accounts"]))):
    runs = await db.payment_reconciliations.find({"property_id": user["property_id"]}).sort("created_at", -1).limit(50).to_list(50)
    return [serialize(run) for run in runs]


@router.post("/reconciliations")
async def reconcile_statement(body: ReconciliationIn, user: dict = Depends(require("payments", ["full", "accounts"]))):
    """Match manually imported bank/UPI statement rows to recorded payments.

    This records reconciliation only. It does not import funds or verify a
    payment provider's settlement on its own.
    """
    run_result = await db.payment_reconciliations.insert_one({
        "property_id": user["property_id"], "source": "manual_statement_import",
        "created_by": user["name"], "created_by_id": user["id"],
        "created_at": now_utc().isoformat(), "row_count": len(body.rows),
        "matched_count": 0, "unmatched_count": 0, "rows": [],
    })
    run_id = str(run_result.inserted_id)
    matched_count = 0
    results = []
    for row in body.rows:
        reference = row.reference.strip()
        rounded_amount = round(row.amount, 2)
        payment = await db.payments.find_one({
            "property_id": user["property_id"], "status": "completed",
            "reference": reference, "amount": rounded_amount,
            "reconciliation_id": {"$exists": False},
        }, sort=[("created_at", -1)])
        if payment:
            claimed = await db.payments.update_one({
                "_id": payment["_id"], "property_id": user["property_id"],
                "status": "completed", "reconciliation_id": {"$exists": False},
            }, {"$set": {"reconciliation_id": run_id, "reconciled_at": now_utc().isoformat()}})
            if claimed.modified_count:
                matched_count += 1
                results.append({"reference": reference, "amount": rounded_amount,
                                "date": row.date or "", "method": row.method or "",
                                "status": "matched", "payment_id": str(payment["_id"]),
                                "reservation_id": payment.get("reservation_id")})
                continue
        results.append({"reference": reference, "amount": rounded_amount,
                        "date": row.date or "", "method": row.method or "", "status": "unmatched"})
    unmatched_count = len(results) - matched_count
    await db.payment_reconciliations.update_one({"_id": run_result.inserted_id, "property_id": user["property_id"]}, {"$set": {
        "matched_count": matched_count, "unmatched_count": unmatched_count, "rows": results,
    }})
    await log_action(user, "reconcile_payments", f"Matched {matched_count} of {len(results)} statement rows")
    return serialize(await db.payment_reconciliations.find_one({"_id": run_result.inserted_id}))


@router.post("/upi-qr")
async def upi_qr(body: UPIRequest, user: dict = Depends(require("payments", ["full", "operational"]))):
    reservation = await db.reservations.find_one({"_id": oid(body.reservation_id), "property_id": user["property_id"]})
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    balance = round(reservation.get("total_amount", 0) - reservation.get("paid_amount", 0), 2)
    if round(body.amount, 2) > balance:
        raise HTTPException(status_code=400, detail=f"QR amount exceeds the remaining balance of ₹{balance:.2f}")
    prop = await db.properties.find_one({"_id": oid(user["property_id"])})
    ps = (prop or {}).get("payment_settings", {})
    upi_id = ps.get("upi_id")
    if not upi_id:
        raise HTTPException(status_code=400, detail="UPI ID not configured. Set it in Settings.")
    payee = ps.get("upi_name") or (prop or {}).get("name", "Hotel")
    note = f"Booking {body.reservation_id[-6:]}"
    params = urllib.parse.urlencode({
        "pa": upi_id, "pn": payee, "am": f"{body.amount:.2f}", "cu": "INR", "tn": note})
    upi_string = f"upi://pay?{params}"
    img = qrcode.make(upi_string)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"upi_string": upi_string, "qr_data_url": data_url, "amount": body.amount,
            "upi_id": upi_id, "payee": payee}


@router.get("/invoice/{res_id}")
async def invoice(res_id: str, user: dict = Depends(require("invoice", ["yes"]))):
    res = await db.reservations.find_one({"_id": oid(res_id), "property_id": user["property_id"]})
    if not res:
        raise HTTPException(status_code=404, detail="Reservation not found")
    prop = await db.properties.find_one({"_id": oid(user["property_id"])})
    guest = await db.guests.find_one({"_id": oid(res.get("guest_id")), "property_id": user["property_id"]})
    room = await db.rooms.find_one({"_id": oid(res.get("room_id")), "property_id": user["property_id"]})
    payments = await db.payments.find({"reservation_id": res_id, "property_id": user["property_id"]}).to_list(200)
    ps = (prop or {}).get("payment_settings", {})
    tax_percent = ps.get("tax_percent", 12.0)

    room_charge = res.get("room_charge_amount", res.get("total_amount", 0))
    tax = res.get("tax_amount", round(room_charge * tax_percent / 100, 2))
    grand_total = res.get("total_amount", round(room_charge + tax, 2))
    paid = res.get("paid_amount", 0)
    balance = round(grand_total - paid, 2)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    green = colors.HexColor("#356859")
    dark = colors.HexColor("#1a1f2b")
    grey = colors.HexColor("#6b7280")

    y = h - 30 * mm
    c.setFillColor(dark)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, y, (prop or {}).get("name", "Innos"))
    c.setFont("Helvetica", 10)
    c.setFillColor(grey)
    y -= 7 * mm
    c.drawString(20 * mm, y, f"{(prop or {}).get('address','')}, {(prop or {}).get('city','')}, {(prop or {}).get('state','')}")
    y -= 5 * mm
    c.drawString(20 * mm, y, f"Phone: {(prop or {}).get('phone','')}   Email: {(prop or {}).get('email','')}")

    c.setFillColor(green)
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(w - 20 * mm, h - 30 * mm, "TAX INVOICE")
    c.setFont("Helvetica", 9)
    c.setFillColor(grey)
    c.drawRightString(w - 20 * mm, h - 37 * mm, f"Invoice #: INV-{res_id[-6:].upper()}")
    c.drawRightString(w - 20 * mm, h - 42 * mm, f"Date: {now_utc().strftime('%d %b %Y')}")

    y -= 14 * mm
    c.setStrokeColor(colors.HexColor("#e5e7eb"))
    c.line(20 * mm, y, w - 20 * mm, y)

    y -= 10 * mm
    c.setFillColor(dark)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, y, "Bill To")
    c.setFont("Helvetica", 10)
    c.setFillColor(grey)
    y -= 6 * mm
    c.drawString(20 * mm, y, (guest or {}).get("name", "—"))
    y -= 5 * mm
    c.drawString(20 * mm, y, f"Phone: {(guest or {}).get('phone','')}")

    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(dark)
    c.drawString(110 * mm, y + 11 * mm, "Stay Details")
    c.setFont("Helvetica", 10)
    c.setFillColor(grey)
    c.drawString(110 * mm, y + 5 * mm, f"Room: {(room or {}).get('number','—')}")
    c.drawString(110 * mm, y, f"Check-in: {res.get('check_in')}  Check-out: {res.get('check_out')}")

    y -= 16 * mm
    c.setFillColor(green)
    c.rect(20 * mm, y, w - 40 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(23 * mm, y + 2.5 * mm, "Description")
    c.drawRightString(w - 23 * mm, y + 2.5 * mm, "Amount (INR)")

    def row(label, value, bold=False):
        nonlocal y
        y -= 8 * mm
        c.setFillColor(dark)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 10)
        c.drawString(23 * mm, y, label)
        c.drawRightString(w - 23 * mm, y, value)

    row(f"Room charges ({res.get('nights',1)} night(s) x Rs {res.get('rate_per_night',0):,.0f})", f"Rs {room_charge:,.2f}")
    row(f"Tax (GST {tax_percent}%)", f"Rs {tax:,.2f}")
    y -= 3 * mm
    c.line(20 * mm, y, w - 20 * mm, y)
    row("Grand Total", f"Rs {grand_total:,.2f}", bold=True)
    row("Amount Paid", f"Rs {paid:,.2f}")
    row("Balance Due", f"Rs {balance:,.2f}", bold=True)

    y -= 14 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(dark)
    c.drawString(20 * mm, y, "Payments")
    c.setFont("Helvetica", 9)
    c.setFillColor(grey)
    if payments:
        for p in payments:
            y -= 5 * mm
            if p.get("status") == "refunded":
                label = f"{p.get('created_at','')[:10]} - REFUND ({p.get('method','').upper()}) - Rs -{p.get('amount',0):,.2f}"
            else:
                label = f"{p.get('created_at','')[:10]} - {p.get('method','').upper()} - Rs {p.get('amount',0):,.2f}"
            c.drawString(20 * mm, y, label)
    else:
        y -= 5 * mm
        c.drawString(20 * mm, y, "No payments recorded.")

    c.setFont("Helvetica-Oblique", 9)
    c.setFillColor(grey)
    c.drawCentredString(w / 2, 20 * mm, "Thank you for staying with us. Powered by Innos.")
    c.showPage()
    c.save()
    buf.seek(0)
    await log_action(user, "generate_invoice", f"Generated invoice for reservation {res_id}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice-{res_id[-6:]}.pdf"})
