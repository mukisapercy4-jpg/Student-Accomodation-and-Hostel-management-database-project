from audittrail.models import AuditEvent, BookingStatusHistory, PaymentStatusHistory
from backend.tests.base import SAHMSTestCase


class AuditAndHistoryTests(SAHMSTestCase):
    def test_booking_creation_records_audit_and_status_history(self):
        response = self.post_booking(self.s1)
        self.assertEqual(response.status_code, 201)
        booking_id = response.data["booking_id"]
        self.assertTrue(AuditEvent.objects.filter(
            resource="bookings", action="create", entity_id=str(booking_id)).exists())
        event = BookingStatusHistory.objects.get(booking_id=booking_id)
        self.assertEqual(event.old_status, "")
        self.assertEqual(event.new_status, "Active")
        self.assertEqual(event.actor, self.admin)

    def test_payment_status_change_is_historic_and_audited(self):
        booking = self.booking(self.s1, status="Active")
        payment = self.payment(booking, "100.00", status="Pending")
        response = self.client.patch(
            f"/api/payments/{payment.pk}/",
            {"payment_status": "Completed", "reason": "Receipt verified"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        event = PaymentStatusHistory.objects.get(payment_id=payment.pk)
        self.assertEqual((event.old_status, event.new_status), ("Pending", "Completed"))
        self.assertEqual(event.reason, "Receipt verified")
        self.assertTrue(AuditEvent.objects.filter(
            resource="payments", action="update", entity_id=str(payment.pk)).exists())

    def test_history_endpoints_are_read_only_and_admin_only(self):
        booking = self.booking(self.s1, status="Active")
        BookingStatusHistory.objects.create(booking_id=booking.pk, old_status="",
                                             new_status="Active", actor=self.admin)
        response = self.client.get("/api/booking-status-history/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.login(self.warden_u)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, 403)
        self.assertEqual(self.client.post("/api/audit-logs/", {}, format="json").status_code, 403)

    def test_audit_does_not_store_field_values(self):
        response = self.client.post("/api/students/", {
            "reg_number": "AUDIT1", "first_name": "Test", "last_name": "Student",
            "gender": "Male", "program": "CS", "email": "audit1@example.test",
            "national_id": "SECRET-NID",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        event = AuditEvent.objects.get(resource="students", action="create")
        self.assertNotIn("SECRET-NID", str(event.changed_fields))
        self.assertNotIn("national_id", event.changed_fields)
