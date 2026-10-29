from unittest import mock

from django.db import DatabaseError

from audittrail.models import AuditEvent
from backend.models import Booking, Student

from .base import SAHMSTestCase


class AuditIntegrityTests(SAHMSTestCase):
    """The audit row and the business change commit together or not at all."""

    def _break_audit(self):
        return mock.patch.object(AuditEvent.objects, "create", side_effect=DatabaseError("boom"))

    def test_create_is_rolled_back_if_audit_fails(self):
        with self._break_audit():
            r = self.client.post("/api/students/", {"reg_number": "Z1", "first_name": "a",
                                                    "last_name": "b", "program": "CS"}, format="json")
        self.assertEqual(r.status_code, 500)
        self.assertFalse(Student.objects.filter(reg_number="Z1").exists())

    def test_cancel_is_rolled_back_if_audit_fails(self):
        b = self.booking(self.s1)
        with self._break_audit():
            r = self.client.post(f"/api/bookings/{b.pk}/cancel/")
        self.assertEqual(r.status_code, 500)
        b.refresh_from_db()
        self.assertEqual(b.status, "Active")

    def test_delete_is_audited_with_the_deleted_id(self):
        pk = self.s3.pk
        self.assertEqual(self.client.delete(f"/api/students/{pk}/").status_code, 204)
        ev = AuditEvent.objects.get(action="delete", resource="students")
        self.assertEqual(ev.entity_id, str(pk))

    def test_blocked_delete_leaves_no_audit_row(self):
        self.booking(self.s1)
        self.assertEqual(self.client.delete(f"/api/students/{self.s1.pk}/").status_code, 409)
        self.assertFalse(AuditEvent.objects.filter(action="delete").exists())

    def test_audit_search_and_admin_only(self):
        self.client.post("/api/students/", {"reg_number": "Q9", "first_name": "a",
                                            "last_name": "b", "program": "CS"}, format="json")
        r = self.client.get("/api/audit-logs/?search=created")
        self.assertGreaterEqual(r.json()["count"], 1)
        self.login(self.warden_u)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, 403)
