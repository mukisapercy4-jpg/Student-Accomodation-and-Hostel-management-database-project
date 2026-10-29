from rest_framework.test import APIClient

from .base import SAHMSTestCase


class AuthRoleTests(SAHMSTestCase):
    def test_anonymous_is_rejected_everywhere(self):
        c = APIClient()
        for url in ("students", "hostels", "bookings", "payments", "dashboard"):
            self.assertEqual(c.get(f"/api/{url}/").status_code, 401, url)

    def test_login_returns_token_and_roles(self):
        c = APIClient()
        r = c.post("/api/auth/login/", {"username": "admin1", "password": "pw", "role": "Admin"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["signed_in_as"], "Admin")
        self.assertIn("token", r.data)
        self.assertEqual(r.data["roles"], ["Admin"])
        bad = c.post("/api/auth/login/", {"username": "admin1", "password": "no", "role": "Admin"}, format="json")
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


class HealthTests(SAHMSTestCase):
    def test_health_is_open_but_data_is_not(self):
        c = APIClient()
        self.assertEqual(c.get("/api/health/").status_code, 200)
        self.assertEqual(c.get("/api/staff/").status_code, 401)
  
    def test_me_flags_superuser(self):
        from django.contrib.auth.models import User
        User.objects.create_superuser("root1", password="pw")
        c = APIClient()
        r = c.post("/api/auth/login/", {"username": "root1", "password": "pw", "role": "Admin"}, format="json")
        self.assertTrue(r.data["is_superuser"])
        c.credentials(HTTP_AUTHORIZATION="Token " + r.data["token"])
        self.assertTrue(c.get("/api/auth/me/").data["is_superuser"])

    def test_login_requires_the_matching_role(self):
        c = APIClient()
        post = lambda u, role: c.post("/api/auth/login/", {"username": u, "password": "pw", "role": role}, format="json")
        self.assertEqual(post("warden1", "Warden").status_code, 200)
        self.assertEqual(post("warden1", "Admin").status_code, 400)     # not in that group
        self.assertEqual(post("ro1", "Warden").status_code, 400)
        self.assertEqual(post("warden1", "").status_code, 400)          # role is mandatory
        self.assertEqual(post("warden1", "Nonsense").status_code, 400)
        self.assertEqual(post("care1", "Caretaker").status_code, 200)

    def test_role_failure_message_is_generic(self):
        c = APIClient()
        wrong_role = c.post("/api/auth/login/", {"username": "warden1", "password": "pw", "role": "Admin"}, format="json")
        wrong_pw = c.post("/api/auth/login/", {"username": "warden1", "password": "x", "role": "Warden"}, format="json")
        self.assertEqual(wrong_role.data, wrong_pw.data)
