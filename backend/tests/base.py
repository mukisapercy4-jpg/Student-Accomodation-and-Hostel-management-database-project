import io
from datetime import date
from decimal import Decimal

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from rest_framework.test import APIClient, APITestCase

from backend.models import Booking, Hostel, Payment, Room, Staff, Student


class SAHMSTestCase(APITestCase):
    """All data here is created in the throw-away in-memory SQLite database."""

    def setUp(self):
        call_command("seed_roles", stdout=io.StringIO())
        self.admin = self.user("admin1", "Admin")
        self.warden_u = self.user("warden1", "Warden")
        self.care = self.user("care1", "Caretaker")
        self.ro = self.user("ro1", "ReadOnly")
        self.login(self.admin)
        self.staff = Staff.objects.create(first_name="Wan", last_name="Warden", role="Warden", email="w@x.ug")
        self.hostel = Hostel.objects.create(name="Pearl", address="A", warden=self.staff)
        self.room = Room.objects.create(hostel=self.hostel, room_number="A1", capacity=2,
                                        price_per_semester=Decimal("500000.00"))
        self.s1 = self.student("S1")
        self.s2 = self.student("S2")
        self.s3 = self.student("S3")

    def user(self, name, group):
        u = User.objects.create_user(name, password="pw")
        u.groups.add(Group.objects.get(name=group))
        return u

    def login(self, user):
        self.client = APIClient()
        self.client.force_authenticate(user)

    def student(self, reg, gender="Male"):
        return Student.objects.create(reg_number=reg, first_name=reg, last_name="X",
                                      gender=gender, program="CS", email=f"{reg}@x.ug",
                                      national_id=f"NID{reg}")

    def booking(self, student=None, room=None, start="2026-09-01", end="2026-12-15",
                status="Active", price="500000.00"):
        return Booking.objects.create(
            student=student or self.s1, room=room or self.room,
            booking_date=date(2026, 8, 1), academic_year="2026/2027", semester=1,
            start_date=start, end_date=end, status=status, agreed_price=Decimal(price))

    def payment(self, booking, amount, status="Completed", ref=None):
        return Payment.objects.create(booking=booking, amount=Decimal(amount),
                                      payment_date=date(2026, 9, 2), payment_method="Cash",
                                      payment_status=status, reference_number=ref)

    def post_booking(self, student, room=None, **kw):
        body = {"student": student.pk, "room": (room or self.room).pk,
                "academic_year": "2026/2027", "semester": 1,
                "start_date": "2026-09-01", "end_date": "2026-12-15", "status": "Active"}
        body.update(kw)
        return self.client.post("/api/bookings/", body, format="json")
