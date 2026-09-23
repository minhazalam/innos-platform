import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from security import get_level


class RolePermissionTests(unittest.TestCase):
    def test_accounts_role_can_review_finances_without_guest_or_booking_access(self):
        self.assertEqual(get_level("accounts", "dashboard"), "accounts")
        self.assertEqual(get_level("accounts", "payments"), "accounts")
        self.assertEqual(get_level("accounts", "analytics"), "basic")
        self.assertEqual(get_level("accounts", "guests"), "no")
        self.assertEqual(get_level("accounts", "bookings"), "no")
        self.assertEqual(get_level("accounts", "staff"), "no")
        self.assertEqual(get_level("accounts", "settings"), "no")

    def test_unknown_roles_fail_closed(self):
        self.assertEqual(get_level("unknown", "payments"), "no")


if __name__ == "__main__":
    unittest.main()
