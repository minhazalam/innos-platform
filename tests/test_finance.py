import unittest
from datetime import date
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from finance import payment_cash_flow, sum_payment_cash_flow


class PaymentCashFlowTests(unittest.TestCase):
    def test_refunds_are_negative_cash_movements(self):
        self.assertEqual(payment_cash_flow({"status": "completed", "amount": 1250}), 1250)
        self.assertEqual(payment_cash_flow({"status": "refunded", "amount": 250}), -250)
        self.assertEqual(payment_cash_flow({"status": "pending", "amount": 40}), 0)

    def test_period_and_all_time_totals_count_refund_on_its_own_date(self):
        rows = [
            {"status": "completed", "amount": 1250, "created_at": "2026-09-24T09:00:00+00:00"},
            {"status": "refunded", "amount": 250, "created_at": "2026-09-25T10:00:00+00:00"},
            {"status": "completed", "amount": 500, "created_at": "2026-09-25T11:00:00+00:00"},
        ]
        self.assertEqual(sum_payment_cash_flow(rows), 1500)
        self.assertEqual(sum_payment_cash_flow(rows, day=date(2026, 9, 24)), 1250)
        self.assertEqual(sum_payment_cash_flow(rows, day=date(2026, 9, 25)), 250)


if __name__ == "__main__":
    unittest.main()
