"""Role code + home route in the login/me payload, and the DEBUG-only demo accounts."""
import io

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from rest_framework.test import APIClient

from backend.management.commands.seed_demo_users import DEMO_PASSWORD

from .base import SAHMSTestCase

LOGIN = "/api/auth/login/"


class LoginRoleCodeTests(SAHMSTestCase):
    def sign_in(self, user, pw, role):
        return APIClient().post(LOGIN, {"username": user, "password": pw, "role": role}, format="json")

    def test_each_role_gets_its_code_and_home(self):
        cases = (("admin1", "Admin", "SUPER_ADMIN", "/admin/dashboard"),
                 ("warden1", "Warden", "MANAGER", "/manager/dashboard"),
                 ("care1", "Caretaker", "CARETAKER", "/staff/dashboard"),
                 ("ro1", "ReadOnly", "READ_ONLY", "/staff/dashboard"))
        for user, role, code, home in cases:
            r = self.sign_in(user, "pw", role)
            self.assertEqual(r.status_code, 200, user)
            self.assertEqual((r.data["role"], r.data["home"]), (code, home), user)

    def test_me_returns_the_same_role_code(self):
        self.login(self.warden_u)
        r = self.client.get("/api/auth/me/")
        self.assertEqual((r.data["role"], r.data["home"]), ("MANAGER", "/manager/dashboard"))

    def test_superuser_is_super_admin(self):
        User.objects.create_superuser("root1", password="pw")
        self.assertEqual(self.sign_in("root1", "pw", "Admin").data["role"], "SUPER_ADMIN")

    def test_missing_fields_and_wrong_role_are_400_with_no_role_leak(self):
        for body in ({"password": "pw", "role": "Admin"}, {"username": "admin1", "role": "Admin"},
                     {"username": "admin1", "password": "pw"}, {}):
            r = APIClient().post(LOGIN, body, format="json")
            self.assertEqual(r.status_code, 400, body)
            self.assertNotIn("role_code", r.data)
            self.assertNotIn("token", r.data)
        self.assertEqual(self.sign_in("warden1", "pw", "Admin").status_code, 400)


class SeedDemoUsersTests(SAHMSTestCase):
    @override_settings(DEBUG=False)
    def test_refuses_outside_debug_and_creates_nothing(self):
        with self.assertRaises(CommandError):
            call_command("seed_demo_users", stdout=io.StringIO())
        self.assertFalse(User.objects.filter(username__startswith="demo_").exists())

    @override_settings(DEBUG=True)
    def test_creates_working_demo_accounts_and_is_repeatable(self):
        for _ in range(2):
            call_command("seed_demo_users", stdout=io.StringIO())
        self.assertEqual(User.objects.filter(username__startswith="demo_").count(), 4)
        for user, role, code in (("demo_manager", "Warden", "MANAGER"), ("demo_admin", "Admin", "SUPER_ADMIN"),
                                 ("demo_readonly", "ReadOnly", "READ_ONLY")):
            r = APIClient().post(LOGIN, {"username": user, "password": DEMO_PASSWORD, "role": role}, format="json")
            self.assertEqual((r.status_code, r.data["role"]), (200, code), user)
