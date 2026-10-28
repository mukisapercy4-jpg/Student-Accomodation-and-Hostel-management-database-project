from rest_framework.test import APIClient

from .base import SAHMSTestCase


class AuthRoleTests(SAHMSTestCase):
    def test_anonymous_is_rejected_everywhere(self):
        c = APIClient()
        for url in ("students", "hostels", "bookings", "payments", "dashboard"):
            self.assertEqual(c.get(f"/api/{url}/").status_code, 401, url)

    def test_login_returns_token_and_roles(self):
        c = APIClient()
        r = c.post("/api/auth/login/", {"username": "admin1", "password": "pw"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIn("token", r.data)
        self.assertEqual(r.data["roles"], ["Admin"])
        bad = c.post("/api/auth/login/", {"username": "admin1", "password": "no"}, format="json")
        self.assertEqual(bad.status_code, 400)
        c.credentials(HTTP_AUTHORIZATION="Token " + r.data["token"])
        self.assertEqual(c.get("/api/students/").status_code, 200)

    def test_readonly_cannot_write(self):
        self.login(self.ro)
        self.assertEqual(self.client.get("/api/students/").status_code, 200)
        r = self.client.post("/api/students/", {"reg_number": "N", "first_name": "a",
                                                "last_name": "b", "program": "CS"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_caretaker_has_no_payments_and_no_payment_totals(self):
        self.login(self.care)
        self.assertEqual(self.client.get("/api/payments/").status_code, 403)
        self.assertNotIn("payments", self.client.get("/api/dashboard/").data)

    def test_warden_cannot_delete_admin_can(self):
        self.login(self.warden_u)
        self.assertEqual(self.client.delete(f"/api/students/{self.s3.pk}/").status_code, 403)
        self.login(self.admin)
        self.assertEqual(self.client.delete(f"/api/students/{self.s3.pk}/").status_code, 204)

    def test_national_id_only_for_admin(self):
        self.assertIn("national_id", self.client.get("/api/students/").data["results"][0])
        self.login(self.warden_u)
        self.assertNotIn("national_id", self.client.get("/api/students/").data["results"][0])
