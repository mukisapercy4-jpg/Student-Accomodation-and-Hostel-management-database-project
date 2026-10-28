from django.db import connection

from .base import SAHMSTestCase


class PaymentRuleTests(SAHMSTestCase):
    def pay(self, b, amount, **kw):
        body = {"booking": b.pk, "amount": amount, "payment_method": "Cash", **kw}
        return self.client.post("/api/payments/", body, format="json")

    def test_completed_payments_can_exceed_price_and_are_preserved(self):
        b = self.booking(self.s1, price="500000.00")
        self.assertEqual(self.pay(b, "300000.00", payment_status="Completed").status_code, 201)
        self.assertEqual(self.pay(b, "300000.00", payment_status="Completed").status_code, 201)
        self.assertEqual(self.pay(b, "200000.00", payment_status="Completed").status_code, 201)
        dashboard = self.client.get("/api/dashboard/").data
        self.assertEqual(dashboard["payments"]["outstanding_balance"], "0.00")
        self.assertEqual(dashboard["payments"]["overpayment_total"], "300000.00")
        self.assertEqual(dashboard["payments"]["overpaid_bookings_count"], 1)

    def test_pending_does_not_count_until_completed(self):
        b = self.booking(self.s1)
        p1 = self.pay(b, "500000.00").data
        p2 = self.pay(b, "500000.00").data
        url = "/api/payments/%s/"
        self.assertEqual(self.client.patch(url % p1["payment_id"], {"payment_status": "Completed"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(url % p2["payment_id"], {"payment_status": "Completed"}, format="json").status_code, 200)
        dashboard = self.client.get("/api/dashboard/").data
        self.assertEqual(dashboard["payments"]["outstanding_balance"], "0.00")
        self.assertEqual(dashboard["payments"]["overpayment_total"], "500000.00")

    def test_no_payment_on_cancelled_booking(self):
        b = self.booking(self.s1, status="Cancelled")
        self.assertEqual(self.pay(b, "1.00").status_code, 400)

    def test_refund_workflow_and_immutability(self):
        b = self.booking(self.s1)
        p = self.payment(b, "100000.00")
        url = f"/api/payments/{p.pk}/"
        self.assertEqual(self.client.patch(url, {"amount": "5.00"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"payment_status": "Pending"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"payment_status": "Refunded"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(url, {"payment_status": "Completed"}, format="json").status_code, 400)

    def test_payments_cannot_be_deleted(self):
        p = self.payment(self.booking(self.s1), "1.00")
        self.assertEqual(self.client.delete(f"/api/payments/{p.pk}/").status_code, 405)

    def test_amount_must_be_positive_and_reference_unique(self):
        b = self.booking(self.s1)
        self.assertEqual(self.pay(b, "0").status_code, 400)
        self.assertEqual(self.pay(b, "5.00", reference_number="R1").status_code, 201)
        self.assertEqual(self.pay(b, "5.00", reference_number="R1").status_code, 400)


class DashboardTests(SAHMSTestCase):
    def dash(self):
        return self.client.get("/api/dashboard/").data

    def test_empty_database_gives_zeros(self):
        from backend.models import Room
        Room.objects.all().delete()
        d = self.dash()
        self.assertEqual(d["occupancy"]["rate_percent"], 0)
        self.assertEqual(d["payments"]["outstanding_balance"], "0.00")

    def test_outstanding_balance_min_zero_and_excludes_cancelled(self):
        b1 = self.booking(self.s1, price="500000.00")
        self.payment(b1, "200000.00")                       # owes 300000
        b2 = self.booking(self.s2, price="100000.00")
        self.payment(b2, "100000.00")                       # settled -> 0
        b3 = self.booking(self.s3, status="Cancelled", price="900000.00")  # ignored
        self.payment(b1, "999999.00", status="Pending")     # pending is not paid
        self.payment(b1, "50000.00", status="Refunded")     # refunded is not paid
        p = self.dash()["payments"]
        self.assertEqual(p["outstanding_balance"], "300000.00")
        self.assertEqual(p["outstanding_balance_label"], "Outstanding Balance")
        self.assertEqual(p["completed_total"], "300000.00")
        self.assertEqual(p["pending_records_total"], "999999.00")
        self.assertEqual(p["pending_records_count"], 1)
        self.assertEqual(p["overpayment_total"], "0.00")
        self.assertEqual(p["overpaid_bookings_count"], 0)

    def test_overpaid_legacy_booking_never_negative(self):
        b = self.booking(self.s1, price="100000.00")
        self.payment(b, "150000.00")
        self.assertEqual(self.dash()["payments"]["outstanding_balance"], "0.00")

    def test_occupancy_counts_active_only_and_matches_view_logic(self):
        self.booking(self.s1, status="Active")
        self.booking(self.s2, status="Pending")
        self.booking(self.s3, status="Cancelled")
        occ = self.dash()["occupancy"]
        self.assertEqual((occ["capacity"], occ["occupied_spaces"], occ["rate_percent"]), (2, 1, 50.0))
        with connection.cursor() as c:  # same SQL as MySQL room_occupancy_view
            c.execute("""SELECT r.capacity,
                count(case when b.status='Active' then b.booking_id end)
                FROM room r LEFT JOIN booking b ON r.room_id=b.room_id GROUP BY r.room_id""")
            cap, occupied = c.fetchone()
        self.assertEqual((cap, occupied), (occ["capacity"], occ["occupied_spaces"]))
        self.assertEqual(occ["by_hostel"][0]["occupied_spaces"], 1)


class DeleteGuardTests(SAHMSTestCase):
    def test_blocked_with_dependents_allowed_without(self):
        self.booking(self.s1)
        a = self.client
        self.assertEqual(a.delete(f"/api/students/{self.s1.pk}/").status_code, 409)
        self.assertEqual(a.delete(f"/api/rooms/{self.room.pk}/").status_code, 409)
        self.assertEqual(a.delete(f"/api/hostels/{self.hostel.pk}/").status_code, 409)
        self.assertEqual(a.delete(f"/api/staff/{self.staff.pk}/").status_code, 409)
        self.assertEqual(a.delete(f"/api/students/{self.s3.pk}/").status_code, 204)


class ValidatorTests(SAHMSTestCase):
    def test_warden_role_checked(self):
        from backend.models import Staff
        cook = Staff.objects.create(first_name="C", last_name="K", role="Cleaner")
        r = self.client.post("/api/hostels/", {"name": "New", "warden": cook.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_duplicate_staff_email_and_room_number(self):
        r = self.client.post("/api/staff/", {"first_name": "a", "last_name": "b", "role": "Warden",
                                              "email": "w@x.ug"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/api/rooms/", {"hostel": self.hostel.pk, "room_number": "A1",
                                              "capacity": 1, "price_per_semester": "1"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_maintenance_and_visitor_rules(self):
        r = self.client.post("/api/maintenance/", {"room": self.room.pk, "reported_by_student": self.s1.pk,
                             "description": "tap", "request_date": "2026-10-01", "status": "Completed"}, format="json")
        self.assertEqual(r.status_code, 400)
        b = self.booking(self.s1, status="Pending")
        v = {"booking": b.pk, "visitor_name": "V", "visit_date": "2026-10-01", "check_in_time": "10:00"}
        self.assertEqual(self.client.post("/api/visitors/", v, format="json").status_code, 400)
        b.status = "Active"; b.save()
        self.assertEqual(self.client.post("/api/visitors/", v, format="json").status_code, 201)

    def test_list_is_paginated(self):
        self.assertIn("results", self.client.get("/api/students/").data)
