"""Backend support for the Stitch screens: hostel filters, student maintenance/visitors,
the payment breakdown on the dashboard, and the profile/staff context in /auth/me/."""
from django.contrib.auth.models import Group, User

from accounts.models import StudentAccount
from backend.models import Hostel, MaintenanceRequest, Room, Staff, Visitor

from .base import SAHMSTestCase


class DesignWiringBase(SAHMSTestCase):
    def setUp(self):
        super().setUp()
        self.stu_user = User.objects.create_user("stu1", password="pw")
        self.stu_user.groups.add(Group.objects.get(name="Student"))
        StudentAccount.objects.create(user=self.stu_user, student_id=self.s1.pk)
        # a second hostel so that filters have something to exclude
        self.staff2 = Staff.objects.create(first_name="Two", last_name="Warden", role="Warden", email="w2@x.ug")
        self.hostel2 = Hostel.objects.create(name="Nile", address="B", warden=self.staff2)
        self.room2 = Room.objects.create(hostel=self.hostel2, room_number="B1", capacity=1, price_per_semester="400000.00")


class HostelFilterTests(DesignWiringBase):
    def test_lists_filter_by_hostel(self):
        b1 = self.booking(student=self.s1, room=self.room)
        b2 = self.booking(student=self.s2, room=self.room2)
        self.payment(b1, "1000", ref="R1")
        self.payment(b2, "2000", ref="R2")
        MaintenanceRequest.objects.create(room=self.room, reported_by_student=self.s1, description="a", request_date="2026-09-01")
        MaintenanceRequest.objects.create(room=self.room2, reported_by_student=self.s2, description="b", request_date="2026-09-01")
        Visitor.objects.create(booking=b1, visitor_name="V1", visit_date="2026-09-02", check_in_time="10:00")
        Visitor.objects.create(booking=b2, visitor_name="V2", visit_date="2026-09-02", check_in_time="10:00")
        for path, n in (("bookings", 1), ("payments", 1), ("maintenance", 1), ("visitors", 1)):
            r = self.client.get(f"/api/{path}/?hostel={self.hostel.pk}")
            self.assertEqual(r.status_code, 200, path)
            self.assertEqual(r.data["count"], n, path)
            r = self.client.get(f"/api/{path}/")
            self.assertEqual(r.data["count"], 2, path)


class StudentMaintenanceTests(DesignWiringBase):
    def test_student_reports_fault_in_own_room_only(self):
        self.booking(student=self.s1, room=self.room)
        self.login(self.stu_user)
        r = self.client.post("/api/maintenance/", {"room": self.room.pk, "description": "Leaking tap",
                             "priority": "Urgent", "status": "Completed", "reported_by_student": self.s2.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        m = MaintenanceRequest.objects.get(pk=r.data["request_id"])
        # reporter, status and priority are not the student's to choose
        self.assertEqual((m.reported_by_student_id, m.status, m.priority), (self.s1.pk, "Pending", "Medium"))
        r = self.client.post("/api/maintenance/", {"room": self.room2.pk, "description": "x"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_student_sees_only_own_requests_and_cannot_edit(self):
        self.booking(student=self.s1, room=self.room)
        mine = MaintenanceRequest.objects.create(room=self.room, reported_by_student=self.s1, description="a", request_date="2026-09-01")
        MaintenanceRequest.objects.create(room=self.room, reported_by_student=self.s2, description="b", request_date="2026-09-01")
        self.login(self.stu_user)
        r = self.client.get("/api/maintenance/")
        self.assertEqual([x["request_id"] for x in r.data["results"]], [mine.pk])
        self.assertEqual(self.client.patch(f"/api/maintenance/{mine.pk}/", {"status": "Completed"}, format="json").status_code, 403)

    def test_student_without_active_booking_cannot_report(self):
        self.login(self.stu_user)
        r = self.client.post("/api/maintenance/", {"room": self.room.pk, "description": "x"}, format="json")
        self.assertEqual(r.status_code, 400)


class StudentVisitorTests(DesignWiringBase):
    def test_student_registers_visitor_for_own_booking_only(self):
        mine = self.booking(student=self.s1, room=self.room)
        other = self.booking(student=self.s2, room=self.room)
        self.login(self.stu_user)
        ok = self.client.post("/api/visitors/", {"booking": mine.pk, "visitor_name": "Mum", "check_in_time": "14:00",
                              "check_out_time": "15:00"}, format="json")
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertIsNone(Visitor.objects.get(pk=ok.data["visitor_id"]).check_out_time)
        bad = self.client.post("/api/visitors/", {"booking": other.pk, "visitor_name": "X", "check_in_time": "14:00"}, format="json")
        self.assertEqual(bad.status_code, 403)
        self.assertEqual(self.client.get("/api/visitors/").data["count"], 1)


class DashboardBreakdownTests(DesignWiringBase):
    def test_payment_breakdown(self):
        full = self.booking(student=self.s1, price="500000.00")
        part = self.booking(student=self.s2, price="500000.00")
        self.booking(student=self.s3, room=self.room2, price="400000.00")
        self.payment(full, "500000", ref="F")
        self.payment(part, "100000", ref="P")
        r = self.client.get("/api/dashboard/")
        p = r.data["payments"]
        self.assertEqual(p["settlement"], {"fully_paid": 1, "partial": 1, "unpaid": 1, "bookings": 3})
        self.assertEqual(p["channels"]["Cash"], "600000.00")
        self.assertEqual(p["cleared_percent"], round(600000 * 100 / 1400000, 1))


class MeContextTests(DesignWiringBase):
    def test_student_payload_has_profile_but_not_national_id(self):
        self.login(self.stu_user)
        st = self.client.get("/api/auth/me/").data["student"]
        self.assertEqual(st["program"], "CS")
        self.assertNotIn("national_id", st)

    def test_staff_payload_links_by_email_for_display(self):
        self.warden_u.email = "W@X.ug"
        self.warden_u.save()
        self.login(self.warden_u)
        me = self.client.get("/api/auth/me/").data
        self.assertEqual(me["hostel"]["name"], "Pearl")
        self.assertEqual(me["staff"]["name"], "Wan Warden")
        self.login(self.care)  # no matching staff e-mail
        me = self.client.get("/api/auth/me/").data
        self.assertIsNone(me["hostel"])
