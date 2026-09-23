from datetime import date
from typing import Iterable, Optional


def payment_cash_flow(payment: dict) -> float:
    """Return the signed cash movement represented by one ledger row."""
    amount = float(payment.get("amount", 0) or 0)
    if payment.get("status") == "completed":
        return amount
    if payment.get("status") == "refunded":
        return -amount
    return 0.0


def sum_payment_cash_flow(
    payments: Iterable[dict], *, day: Optional[date] = None,
) -> float:
    """Sum payment ledger rows, optionally for one transaction date."""
    total = 0.0
    for payment in payments:
        if day and str(payment.get("created_at", ""))[:10] != day.isoformat():
            continue
        total += payment_cash_flow(payment)
    return round(total, 2)
