from .base import SAHMSTestCase


class BookingRuleTests(SAHMSTestCase):
    def test_capacity_enforced_for_active_only(self):
        self.assertEqual(self.post_booking(self.s1).status_code, 201)
        self.assertEqual(self.post_booking(self.s2).status_code, 201)
        r = self.post_booking(self.s3)
        self.assertEqual(r.status_code, 400)
        self.assertIn("capacity", str(r.data["room"]))

    def test_pending_and_cancelled_do_not_count(self):
        self.booking(self.s1, status="Pending")
        self.booking(self.s2, status="Cancelled")
        self.booking(self.s3, status="Completed")
        s4 = self.student("S4")
        self.assertEqual(self.post_booking(s4).status_code, 201)

    def test_non_overlapping_dates_allowed_in_full_room(self):
        self.booking(self.s1, start="2026-01-01", end="2026-05-31")
        self.booking(self.s2, start="2026-01-01", end="2026-05-31")
        self.assertEqual(self.post_booking(self.s3, start_date="2026-06-01").status_code, 201)

    def test_peak_not_sum_of_overlaps(self):
        # A and B never share a day, so a capacity-2 room can still take C.
        self.booking(self.s1, start="2026-01-01", end="2026-03-31")
        self.booking(self.s2, start="2026-04-01", end="2026-06-30")
        r = self.post_booking(self.s3, start_date="2026-02-01", end_date="2026-05-01")
        self.assertEqual(r.status_code, 201)

    def test_student_cannot_hold_two_overlapping_active(self):
        room2 = self.room.__class__.objects.create(hostel=self.hostel, room_number="A2",
                                                   capacity=2, price_per_semester=1)
        self.booking(self.s1)
        r = self.post_booking(self.s1, room=room2, start_date="2026-12-01", end_date="2027-02-01")
        self.assertEqual(r.status_code, 400)
        ok = self.post_booking(self.s1, room=room2, start_date="2026-12-16", end_date="2027-02-01")
        self.assertEqual(ok.status_code, 201)

    def test_activating_pending_rechecks_rules(self):
        self.booking(self.s1)
        self.booking(self.s2)
        p = self.booking(self.s3, status="Pending")
        r = self.client.patch(f"/api/bookings/{p.pk}/", {"status": "Active"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_defaults_price_and_date(self):
        r = self.post_booking(self.s1, status="Pending")
        self.assertEqual(r.data["agreed_price"], "500000.00")
        self.assertTrue(r.data["booking_date"])

    def test_end_before_start_rejected(self):
        r = self.post_booking(self.s1, end_date="2026-08-01")
        self.assertEqual(r.status_code, 400)

    def test_new_booking_cannot_start_completed(self):
        self.assertEqual(self.post_booking(self.s1, status="Completed").status_code, 400)

    def test_status_transitions_and_terminal_states(self):
        b = self.booking(self.s1, status="Pending")
        url = f"/api/bookings/{b.pk}/"
        self.assertEqual(self.client.patch(url, {"status": "Completed"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"status": "Active"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(url, {"status": "Completed"}, format="json").status_code, 200)
        self.assertEqual(self.client.patch(url, {"status": "Active"}, format="json").status_code, 400)

    def test_cancel_endpoint_flags_refund_review(self):
        b = self.booking(self.s1)
        self.payment(b, "100000.00")
        r = self.client.post(f"/api/bookings/{b.pk}/cancel/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "Cancelled")
        self.assertTrue(r.data["refund_review_required"])
        self.assertEqual(self.client.post(f"/api/bookings/{b.pk}/cancel/").status_code, 400)

    def test_bookings_cannot_be_deleted(self):
        b = self.booking(self.s1)
        self.assertEqual(self.client.delete(f"/api/bookings/{b.pk}/").status_code, 405)

    def test_price_below_completed_payments_is_kept_and_flagged(self):
        b = self.booking(self.s1)
        self.payment(b, "400000.00")
        r = self.client.patch(f"/api/bookings/{b.pk}/", {"agreed_price": "100000.00"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["overpaid_by"], "300000.00")
        self.assertTrue(r.data["review_reasons"])

    def test_room_capacity_cannot_drop_below_active(self):
        self.booking(self.s1)
        self.booking(self.s2)
        r = self.client.patch(f"/api/rooms/{self.room.pk}/", {"capacity": 1}, format="json")
        self.assertEqual(r.status_code, 400)


class LockingTests(SAHMSTestCase):
    """SQLite ignores row locks, so assert the code requests them (MySQL honours them)."""

    def test_student_then_room_rows_locked(self):
        from unittest import mock
        from django.db.models.query import QuerySet
        calls = []
        orig = QuerySet.select_for_update

        def spy(qs, *a, **k):
            calls.append(qs.model.__name__)
            return orig(qs, *a, **k)

        with mock.patch.object(QuerySet, "select_for_update", spy):
            self.assertEqual(self.post_booking(self.s1).status_code, 201)
        self.assertEqual(calls[:2], ["Student", "Room"])


class MaleOnlyTests(SAHMSTestCase):
    """Every hostel is male-only; gender is free text in MySQL, so the API enforces it."""

    def test_non_male_and_blank_rejected_for_any_status(self):
        f = self.student("F1", gender="Female")
        n = self.student("N1", gender=None)
        for st in (f, n):
            for status in ("Pending", "Active"):
                r = self.post_booking(st, status=status)
                self.assertEqual(r.status_code, 400, (st.gender, status))
                self.assertIn("male students only", str(r.data["student"]))

    def test_male_values_case_and_space_insensitive(self):
        for i, g in enumerate(["Male", "male", " MALE ", "M", "m"]):
            st = self.student(f"M{i}", gender=g)
            self.assertEqual(self.post_booking(st, status="Pending").status_code, 201, g)

    def test_can_be_switched_off_deliberately(self):
        from django.test import override_settings
        f = self.student("F1", gender="Female")
        with override_settings(MALE_ONLY_ENFORCED=False):
            self.assertEqual(self.post_booking(f).status_code, 201)

    def test_activation_rechecks_gender(self):
        f = self.student("F1", gender="Female")
        b = self.booking(f, status="Pending")  # legacy row created outside the API
        r = self.client.patch(f"/api/bookings/{b.pk}/", {"status": "Active"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_gender_cannot_be_changed_away_while_booked(self):
        self.booking(self.s1, status="Pending")
        r = self.client.patch(f"/api/students/{self.s1.pk}/", {"gender": "Female"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.client.patch(f"/api/students/{self.s2.pk}/", {"gender": "Female"}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_check_student_gender_command_is_read_only_report(self):
        import io
        from django.core.management import call_command
        from backend.models import Student
        self.student("F1", gender="Female")
        self.student("N1", gender=None)
        before = list(Student.objects.values_list("pk", "gender"))
        out = io.StringIO()
        call_command("check_student_gender", stdout=out)
        text = out.getvalue()
        self.assertIn("'Female'", text)
        self.assertIn("NOT accepted", text)
        self.assertIn("2 student(s) would be rejected", text)
        self.assertEqual(before, list(Student.objects.values_list("pk", "gender")))
