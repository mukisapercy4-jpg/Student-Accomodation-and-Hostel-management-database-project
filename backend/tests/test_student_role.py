"""STUDENT role: JWT login with role claim, own-data scoping, booking, Mobile Money, audit."""
import jwt
from django.contrib.auth.models import Group, User
from django.test import override_settings

from accounts.models import StudentAccount
from audittrail.models import AuditEvent, PaymentStatusHistory
from backend.models import Booking, Payment
from .base import SAHMSTestCase

TOKEN, REFRESH = "/api/auth/token/", "/api/auth/token/refresh/"
BOOK = {"room": None, "academic_year": "2026/2027", "semester": 1,
        "start_date": "2026-09-01", "end_date": "2026-12-15"}


class StudentBase(SAHMSTestCase):
    def setUp(self):
        super().setUp()
        self.stu_user = self.user("stu1", "Student")
        StudentAccount.objects.create(user=self.stu_user, student_id=self.s1.pk)
        self.other_user = self.user("stu2", "Student")
        StudentAccount.objects.create(user=self.other_user, student_id=self.s2.pk)

    def body(self, **kw):
        return {**BOOK, "room": self.room.pk, **kw}


class JwtLoginTests(StudentBase):
    def test_login_returns_role_in_body_and_claims_and_routes_home(self):
        r = self.client.__class__().post(TOKEN, {"username": "stu1", "password": "pw"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data["role"], r.data["home"]), ("STUDENT", "/student/dashboard"))
        self.assertEqual(r.data["student"]["reg_number"], "S1")
        claims = jwt.decode(r.data["access"], options={"verify_signature": False})
        self.assertEqual(claims["role"], "STUDENT")
        for user, role, home in (("warden1", "MANAGER", "/manager/dashboard"),
                                 ("admin1", "SUPER_ADMIN", "/admin/dashboard")):
            d = self.client.__class__().post(TOKEN, {"username": user, "password": "pw"}, format="json").data
            self.assertEqual((d["role"], d["home"]), (role, home))

    def test_login_with_email_or_student_reg_number(self):
        self.stu_user.email = "stu1@uni.ac.ug"
        self.stu_user.save()
        c = self.client.__class__()
        for ident in ("stu1@uni.ac.ug", "STU1@UNI.AC.UG", "S1", "s1"):
            r = c.post(TOKEN, {"username": ident, "password": "pw"}, format="json")
            self.assertEqual((r.status_code, r.data.get("username")), (200, "stu1"), ident)
        self.assertEqual(c.post(TOKEN, {"username": "S1", "password": "wrong"}, format="json").status_code, 401)
        self.assertEqual(c.post(TOKEN, {"username": "S3", "password": "pw"}, format="json").status_code, 401)  # no login linked

    def test_access_token_works_as_bearer(self):
        c = self.client.__class__()
        access = c.post(TOKEN, {"username": "stu1", "password": "pw"}, format="json").data["access"]
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        self.assertEqual(c.get("/api/auth/me/").data["role"], "STUDENT")

    def test_bad_credentials_and_missing_fields(self):
        c = self.client.__class__()
        self.assertEqual(c.post(TOKEN, {"username": "stu1", "password": "nope"}, format="json").status_code, 401)
        self.assertEqual(c.post(TOKEN, {"username": "stu1"}, format="json").status_code, 400)
        self.assertEqual(c.post(TOKEN, {}, format="json").status_code, 400)

    def test_account_without_role_or_student_link_is_refused(self):
        User.objects.create_user("norole", password="pw")
        lone = self.user("lone", "Student")  # Student group but no StudentAccount
        c = self.client.__class__()
        self.assertEqual(c.post(TOKEN, {"username": "norole", "password": "pw"}, format="json").status_code, 401)
        self.assertEqual(c.post(TOKEN, {"username": lone.username, "password": "pw"}, format="json").status_code, 401)

    def test_refresh(self):
        c = self.client.__class__()
        refresh = c.post(TOKEN, {"username": "stu1", "password": "pw"}, format="json").data["refresh"]
        ok = c.post(REFRESH, {"refresh": refresh}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertIn("access", ok.data)
        self.assertEqual(c.post(REFRESH, {}, format="json").status_code, 400)
        self.assertEqual(c.post(REFRESH, {"refresh": "garbage"}, format="json").status_code, 401)


class StudentPermissionTests(StudentBase):
    def test_student_sees_rooms_but_not_staff_data(self):
        self.login(self.stu_user)
        self.assertEqual(self.client.get("/api/rooms/").status_code, 200)
        self.assertEqual(self.client.get("/api/rooms/available/?start_date=2026-09-01&end_date=2026-12-15").status_code, 200)
        # maintenance and visitors are open to students too, but only for their own rows
        # (see test_design_wiring.py), so they are no longer in this list.
        for path in ("/api/students/", "/api/staff/", "/api/audit-logs/", "/api/dashboard/"):
            self.assertEqual(self.client.get(path).status_code, 403, path)

    def test_student_cannot_write_rooms_or_approve_or_edit(self):
        b = self.booking(student=self.s1, status="Pending")
        self.login(self.stu_user)
        self.assertEqual(self.client.post("/api/rooms/", {}, format="json").status_code, 403)
        for verb in ("approve", "reject", "cancel"):
            self.assertEqual(self.client.post(f"/api/bookings/{b.pk}/{verb}/").status_code, 403, verb)
        self.assertEqual(self.client.post(f"/api/bookings/{b.pk}/reassign/", {"room": self.room.pk}, format="json").status_code, 403)
        self.assertEqual(Booking.objects.get(pk=b.pk).status, "Pending")
        self.assertEqual(self.client.patch(f"/api/bookings/{b.pk}/", {"status": "Active"}, format="json").status_code, 403)
        self.assertEqual(self.client.patch("/api/payments/1/", {"payment_status": "Completed"}, format="json").status_code, 403)

    def test_student_only_sees_own_bookings_and_payments(self):
        mine, theirs = self.booking(self.s1, status="Pending"), self.booking(self.s2, status="Pending")
        p_mine, p_theirs = self.payment(mine, "1000"), self.payment(theirs, "2000")
        self.login(self.stu_user)
        ids = [r["booking_id"] for r in self.client.get("/api/bookings/").data["results"]]
        self.assertEqual(ids, [mine.pk])
        pids = [r["payment_id"] for r in self.client.get("/api/payments/").data["results"]]
        self.assertEqual(pids, [p_mine.pk])
        self.assertEqual(self.client.get(f"/api/bookings/{theirs.pk}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/payments/{p_theirs.pk}/").status_code, 404)


class StudentBookingTests(StudentBase):
    def test_student_creates_own_pending_booking_and_it_is_audited(self):
        self.login(self.stu_user)
        # trying to book as someone else / Active / with a custom price is overridden
        r = self.client.post("/api/bookings/", self.body(student=self.s2.pk, status="Active", agreed_price="1.00"), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        b = Booking.objects.get(pk=r.data["booking_id"])
        self.assertEqual((b.student_id, b.status, b.agreed_price), (self.s1.pk, "Pending", self.room.price_per_semester))
        ev = AuditEvent.objects.filter(resource="bookings", entity_id=str(b.pk), action="create").first()
        self.assertEqual(ev.actor_id, self.stu_user.pk)

    def test_missing_field_is_400(self):
        self.login(self.stu_user)
        body = self.body()
        del body["start_date"]
        r = self.client.post("/api/bookings/", body, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("start_date", r.data)

    def test_unlinked_student_and_readonly_cannot_book(self):
        lone = self.user("lone", "Student")
        self.login(lone)
        self.assertEqual(self.client.post("/api/bookings/", self.body(), format="json").status_code, 403)
        self.login(self.ro)
        self.assertEqual(self.client.post("/api/bookings/", self.body(student=self.s1.pk), format="json").status_code, 403)


@override_settings(MOMO_SIMULATE=True)
class MomoStudentTests(StudentBase):
    MOMO = {"amount": "100000", "network": "MTN", "phone": "0772123456"}

    def start(self, user, booking):
        self.login(user)
        return self.client.post("/api/payments/momo/", {**self.MOMO, "booking": booking.pk}, format="json")

    def test_student_pays_for_own_booking_only(self):
        mine, theirs = self.booking(self.s1, status="Pending"), self.booking(self.s2, status="Pending")
        self.assertEqual(self.start(self.stu_user, mine).status_code, 201)
        self.assertEqual(self.start(self.stu_user, theirs).status_code, 403)

    def test_missing_field_is_400_and_readonly_is_403(self):
        mine = self.booking(self.s1, status="Pending")
        self.login(self.stu_user)
        self.assertEqual(self.client.post("/api/payments/momo/", {"booking": mine.pk}, format="json").status_code, 400)
        self.assertEqual(self.start(self.ro, mine).status_code, 403)

    def test_confirm_success_failure_audit_and_guards(self):
        mine = self.booking(self.s1, status="Pending")
        pay_id = self.start(self.stu_user, mine).data["payment_id"]
        url = f"/api/payments/{pay_id}/momo-confirm/"
        self.assertEqual(self.client.post(url, {"outcome": "maybe"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 400)
        # another student cannot touch it (404: it is outside their scope), nor can read-only staff
        self.login(self.other_user)
        self.assertEqual(self.client.post(url, {"outcome": "success"}, format="json").status_code, 404)
        self.login(self.ro)
        self.assertEqual(self.client.post(url, {"outcome": "success"}, format="json").status_code, 403)
        self.login(self.stu_user)
        ok = self.client.post(url, {"outcome": "success"}, format="json")
        self.assertEqual((ok.status_code, ok.data["payment_status"]), (200, "Completed"))
        self.assertTrue(PaymentStatusHistory.objects.filter(payment_id=pay_id, new_status="Completed", actor=self.stu_user).exists())
        self.assertTrue(AuditEvent.objects.filter(resource="payments", entity_id=str(pay_id), action="update", actor=self.stu_user).exists())
        # already settled
        self.assertEqual(self.client.post(url, {"outcome": "failure"}, format="json").status_code, 400)

    def test_confirm_failure_outcome(self):
        mine = self.booking(self.s1, status="Pending")
        pay_id = self.start(self.stu_user, mine).data["payment_id"]
        r = self.client.post(f"/api/payments/{pay_id}/momo-confirm/", {"outcome": "failure"}, format="json")
        self.assertEqual(r.data["payment_status"], "Failed")

    def test_cash_payment_cannot_be_confirmed_as_momo(self):
        cash = self.payment(self.booking(self.s1, status="Pending"), "5000", status="Pending")
        self.login(self.stu_user)
        r = self.client.post(f"/api/payments/{cash.pk}/momo-confirm/", {"outcome": "success"}, format="json")
        self.assertEqual(r.status_code, 400)

    @override_settings(MOMO_SIMULATE=False)
    def test_confirm_is_refused_without_simulation(self):
        mine = self.booking(self.s1, status="Pending")
        pay_id = self.start(self.stu_user, mine).data["payment_id"]
        r = self.client.post(f"/api/payments/{pay_id}/momo-confirm/", {"outcome": "success"}, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Payment.objects.get(pk=pay_id).payment_status, "Pending")


class AuditAliasTests(StudentBase):
    def test_audit_log_exposes_user_action_table_timestamp(self):
        self.login(self.stu_user)
        self.client.post("/api/bookings/", self.body(), format="json")
        self.login(self.admin)
        row = self.client.get("/api/audit-logs/?resource=bookings").data["results"][0]
        self.assertEqual((row["user_id"], row["action_type"], row["table_name"]),
                         (self.stu_user.pk, "create", "bookings"))
        self.assertTrue(row["timestamp"])
        self.login(self.stu_user)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, 403)


class SeedDemoStudentTests(SAHMSTestCase):
    @override_settings(DEBUG=True)
    def test_seed_creates_a_linked_demo_student_who_can_log_in(self):
        from django.core.management import call_command
        import io
        call_command("seed_demo_users", stdout=io.StringIO())
        call_command("seed_demo_users", stdout=io.StringIO())  # idempotent
        r = self.client.__class__().post(TOKEN, {"username": "demo_student", "password": "demo-pass-123"}, format="json")
        self.assertEqual((r.status_code, r.data["role"]), (200, "STUDENT"))
        self.assertEqual(StudentAccount.objects.filter(user__username="demo_student").count(), 1)

    @override_settings(DEBUG=False)
    def test_seed_refuses_outside_debug(self):
        from django.core.management import call_command, CommandError
        with self.assertRaises(CommandError):
            call_command("seed_demo_users")
