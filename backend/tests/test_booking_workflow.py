"""approve / reject / reassign: success, 403, 400, state errors and audit rows."""
from rest_framework.test import APIClient

from audittrail.models import AuditEvent, BookingStatusHistory
from backend.models import Booking, Room

from .base import SAHMSTestCase


class BookingWorkflowTests(SAHMSTestCase):
    def setUp(self):
        super().setUp()
        self.room2 = Room.objects.create(hostel=self.hostel, room_number="A2", capacity=1,
                                         price_per_semester=self.room.price_per_semester)

    # ---------------------------------------------------------------- approve
    def test_warden_approves_pending_booking_and_it_is_audited(self):
        b = self.booking(status="Pending")
        self.login(self.warden_u)
        r = self.client.post(f"/api/bookings/{b.pk}/approve/", {"reason": "Fees confirmed"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        b.refresh_from_db()
        self.assertEqual(b.status, "Active")
        ev = AuditEvent.objects.get(resource="bookings", entity_id=str(b.pk), description="Booking approved")
        self.assertEqual(ev.actor, self.warden_u)
        self.assertEqual(ev.action, "update")
        self.assertIsNotNone(ev.timestamp)
        h = BookingStatusHistory.objects.get(booking_id=b.pk)
        self.assertEqual((h.old_status, h.new_status, h.reason), ("Pending", "Active", "Fees confirmed"))

    def test_approve_blocked_when_room_is_full(self):
        self.booking(student=self.s1, status="Active")
        self.booking(student=self.s2, status="Active")
        pending = self.booking(student=self.s3, status="Pending")
        r = self.client.post(f"/api/bookings/{pending.pk}/approve/")
        self.assertEqual(r.status_code, 400)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "Pending")
        self.assertFalse(AuditEvent.objects.filter(description="Booking approved").exists())

    def test_approve_non_pending_is_400(self):
        b = self.booking(status="Active")
        self.assertEqual(self.client.post(f"/api/bookings/{b.pk}/approve/").status_code, 400)

    # ----------------------------------------------------------------- reject
    def test_reject_pending_cancels_and_records_reason(self):
        b = self.booking(status="Pending")
        r = self.client.post(f"/api/bookings/{b.pk}/reject/", {"reason": "No documents"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        b.refresh_from_db()
        self.assertEqual(b.status, "Cancelled")
        self.assertEqual(BookingStatusHistory.objects.get(booking_id=b.pk).reason, "No documents")
        self.assertTrue(AuditEvent.objects.filter(description="Booking rejected", entity_id=str(b.pk)).exists())

    def test_reject_active_booking_is_400(self):
        b = self.booking(status="Active")
        self.assertEqual(self.client.post(f"/api/bookings/{b.pk}/reject/").status_code, 400)
        b.refresh_from_db()
        self.assertEqual(b.status, "Active")

    # --------------------------------------------------------------- reassign
    def test_reassign_moves_booking_keeps_price_and_audits(self):
        b = self.booking(status="Active", price="450000.00")
        r = self.client.post(f"/api/bookings/{b.pk}/reassign/", {"room": self.room2.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        b.refresh_from_db()
        self.assertEqual(b.room_id, self.room2.pk)
        self.assertEqual(str(b.agreed_price), "450000.00")
        ev = AuditEvent.objects.get(resource="bookings", entity_id=str(b.pk), changed_fields=["room"])
        self.assertEqual(ev.actor, self.admin)
        self.assertIn(f"#{self.room.pk}", ev.description)

    def test_reassign_missing_room_is_400(self):
        b = self.booking(status="Active")
        r = self.client.post(f"/api/bookings/{b.pk}/reassign/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("room", r.json())

    def test_reassign_unknown_room_is_400(self):
        b = self.booking(status="Active")
        self.assertEqual(
            self.client.post(f"/api/bookings/{b.pk}/reassign/", {"room": 99999}, format="json").status_code, 400)

    def test_reassign_into_full_room_is_400_and_nothing_changes(self):
        self.booking(student=self.s2, room=self.room2, status="Active")  # room2 capacity 1 now full
        b = self.booking(student=self.s1, status="Active")
        r = self.client.post(f"/api/bookings/{b.pk}/reassign/", {"room": self.room2.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        b.refresh_from_db()
        self.assertEqual(b.room_id, self.room.pk)
        self.assertFalse(AuditEvent.objects.filter(changed_fields=["room"]).exists())

    def test_reassign_same_room_and_cancelled_booking_are_400(self):
        b = self.booking(status="Active")
        self.assertEqual(
            self.client.post(f"/api/bookings/{b.pk}/reassign/", {"room": self.room.pk}, format="json").status_code, 400)
        c = self.booking(student=self.s2, status="Cancelled")
        self.assertEqual(
            self.client.post(f"/api/bookings/{c.pk}/reassign/", {"room": self.room2.pk}, format="json").status_code, 400)

    def test_reassign_into_room_with_urgent_maintenance_is_400(self):
        from backend.models import MaintenanceRequest
        MaintenanceRequest.objects.create(room=self.room2, reported_by_student=self.s2,
                                          description="Ceiling", request_date="2026-10-01",
                                          priority="Urgent", status="Pending")
        b = self.booking(status="Active")
        r = self.client.post(f"/api/bookings/{b.pk}/reassign/", {"room": self.room2.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    # ------------------------------------------------------------ permissions
    def test_caretaker_and_readonly_get_403_on_every_action(self):
        b = self.booking(status="Pending")
        for user in (self.care, self.ro):
            self.login(user)
            for path, body in ((f"approve/", {}), (f"reject/", {}), (f"reassign/", {"room": self.room2.pk})):
                r = self.client.post(f"/api/bookings/{b.pk}/{path}", body, format="json")
                self.assertEqual(r.status_code, 403, f"{user.username} {path}")
        b.refresh_from_db()
        self.assertEqual((b.status, b.room_id), ("Pending", self.room.pk))

    def test_anonymous_gets_401(self):
        b = self.booking(status="Pending")
        r = APIClient().post(f"/api/bookings/{b.pk}/approve/")
        self.assertEqual(r.status_code, 401)
