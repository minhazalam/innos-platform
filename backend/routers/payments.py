from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
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


@router.get("")
async def list_payments(user: dict = Depends(require("payments", ["full", "operational"]))):
    payments = await db.payments.find({"property_id": user["property_id"]}).sort("created_at", -1).to_list(1000)
    guests = {str(g["_id"]): g for g in await db.guests.find({"property_id": user["property_id"]}).to_list(1000)}
    out = []
    for p in payments:
        s = serialize(p)
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

    doc = {
        "property_id": user["property_id"],
        "reservation_id": body.reservation_id,
        "guest_id": res.get("guest_id"),
        "amount": round(body.amount, 2),
        "method": body.method,
        "reference": body.reference,
        "status": "completed",
        "recorded_by": user["name"],
        "created_at": now_utc().isoformat(),
    }
    p = await db.payments.insert_one(doc)
    new_paid = round(res.get("paid_amount", 0) + body.amount, 2)
    await db.reservations.update_one({"_id": res["_id"]}, {"$set": {"paid_amount": new_paid}})
    await log_action(user, "record_payment", f"Recorded ₹{body.amount} ({body.method}) for reservation {body.reservation_id}")
    return serialize(await db.payments.find_one({"_id": p.inserted_id}))


@router.post("/upi-qr")
async def upi_qr(body: UPIRequest, user: dict = Depends(require("payments", ["full", "operational"]))):
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
    guest = await db.guests.find_one({"_id": oid(res.get("guest_id"))})
    room = await db.rooms.find_one({"_id": oid(res.get("room_id"))})
    payments = await db.payments.find({"reservation_id": res_id}).to_list(200)
    ps = (prop or {}).get("payment_settings", {})
    tax_percent = ps.get("tax_percent", 12.0)

    room_charge = res.get("total_amount", 0)
    tax = round(room_charge * tax_percent / 100, 2)
    grand_total = round(room_charge + tax, 2)
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
    c.drawString(20 * mm, y, (prop or {}).get("name", "HotelOS"))
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
            c.drawString(20 * mm, y, f"{p.get('created_at','')[:10]} - {p.get('method','').upper()} - Rs {p.get('amount',0):,.2f}")
    else:
        y -= 5 * mm
        c.drawString(20 * mm, y, "No payments recorded.")

    c.setFont("Helvetica-Oblique", 9)
    c.setFillColor(grey)
    c.drawCentredString(w / 2, 20 * mm, "Thank you for staying with us. Powered by HotelOS.")
    c.showPage()
    c.save()
    buf.seek(0)
    await log_action(user, "generate_invoice", f"Generated invoice for reservation {res_id}")
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice-{res_id[-6:]}.pdf"})
