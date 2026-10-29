"""POST /api/payments/momo/ (simulated Mobile Money) and settling it via the existing PATCH."""
from audittrail.models import AuditEvent, PaymentStatusHistory
from backend.models import Payment
from rest_framework.test import APIClient

from .base import SAHMSTestCase

URL = "/api/payments/momo/"


class MomoPaymentTests(SAHMSTestCase):
    def setUp(self):
        super().setUp()
        self.b = self.booking(status="Active")

    def body(self, **kw):
        d = {"booking": self.b.pk, "amount": "150000", "network": "MTN", "phone": "0772123456"}
        d.update(kw)
        return d

    def test_initiate_creates_pending_mobile_money_payment_with_audit(self):
        r = self.client.post(URL, self.body(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        p = Payment.objects.get(pk=r.json()["payment_id"])
        self.assertEqual((p.payment_method, p.payment_status), ("Mobile Money", "Pending"))
        self.assertTrue(p.reference_number.startswith("MOMO-MTN-"))
        self.assertEqual(r.json()["phone_masked"], "0772***456")
        self.assertTrue(r.json()["simulated"])
        h = PaymentStatusHistory.objects.get(payment_id=p.pk)
        self.assertEqual((h.old_status, h.new_status, h.actor), ("", "Pending", self.admin))
        ev = AuditEvent.objects.get(resource="payments", entity_id=str(p.pk))
        self.assertEqual((ev.action, ev.actor), ("create", self.admin))
        self.assertIsNotNone(ev.timestamp)

    def test_phone_number_is_never_stored_or_returned(self):
        r = self.client.post(URL, self.body(), format="json")
        self.assertNotIn("0772123456", r.content.decode())
        for ev in AuditEvent.objects.all():
            self.assertNotIn("772123456", ev.description + str(ev.changed_fields))
        self.assertNotIn("772123456", " ".join(Payment.objects.values_list("reference_number", flat=True)))

    def test_international_format_is_accepted_and_airtel_detected(self):
        r = self.client.post(URL, self.body(network="Airtel", phone="+256 705 123 456"), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.json()["reference_number"].startswith("MOMO-AIRTEL-"))

    def test_missing_fields_are_400(self):
        for field in ("booking", "amount", "network", "phone"):
            body = self.body()
            body.pop(field)
            r = self.client.post(URL, body, format="json")
            self.assertEqual(r.status_code, 400, field)
            self.assertIn(field, r.json())
        self.assertEqual(Payment.objects.count(), 0)

    def test_bad_input_is_400(self):
        cases = [
            self.body(phone="12345"),                 # not a Ugandan number
            self.body(phone="0412345678"),            # unknown network prefix
            self.body(network="Airtel"),              # 077 is MTN, not Airtel
            self.body(network="Vodafone"),            # unsupported network
            self.body(amount="0"), self.body(amount="-5"), self.body(amount="abc"),
            self.body(booking=99999),
        ]
        for body in cases:
            self.assertEqual(self.client.post(URL, body, format="json").status_code, 400, body)
        self.assertEqual(Payment.objects.count(), 0)

    def test_cancelled_booking_is_400(self):
        c = self.booking(student=self.s2, status="Cancelled")
        self.assertEqual(self.client.post(URL, self.body(booking=c.pk), format="json").status_code, 400)

    def test_settle_completed_and_failed_use_existing_transitions_and_audit(self):
        ok = self.client.post(URL, self.body(), format="json").json()["payment_id"]
        bad = self.client.post(URL, self.body(phone="0782000111"), format="json").json()["payment_id"]
        r1 = self.client.patch(f"/api/payments/{ok}/", {"payment_status": "Completed"}, format="json")
        r2 = self.client.patch(f"/api/payments/{bad}/", {"payment_status": "Failed"}, format="json")
        self.assertEqual((r1.status_code, r2.status_code), (200, 200))
        self.assertEqual(PaymentStatusHistory.objects.filter(payment_id=ok, new_status="Completed").count(), 1)
        self.assertEqual(PaymentStatusHistory.objects.filter(payment_id=bad, new_status="Failed").count(), 1)
        self.assertTrue(AuditEvent.objects.filter(resource="payments", entity_id=str(ok), action="update").exists())
        # a Failed payment is final
        self.assertEqual(
            self.client.patch(f"/api/payments/{bad}/", {"payment_status": "Completed"}, format="json").status_code, 400)

    def test_warden_allowed_caretaker_readonly_forbidden_anonymous_401(self):
        self.login(self.warden_u)
        self.assertEqual(self.client.post(URL, self.body(), format="json").status_code, 201)
        for user in (self.care, self.ro):
            self.login(user)
            self.assertEqual(self.client.post(URL, self.body(), format="json").status_code, 403, user.username)
        self.assertEqual(APIClient().post(URL, self.body(), format="json").status_code, 401)
        self.assertEqual(Payment.objects.count(), 1)
