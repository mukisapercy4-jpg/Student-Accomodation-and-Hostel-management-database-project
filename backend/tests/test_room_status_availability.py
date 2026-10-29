"""Derived room status/available_spaces and GET /api/rooms/available/."""
from backend.models import MaintenanceRequest, Room
from rest_framework.test import APIClient

from .base import SAHMSTestCase


class RoomStatusTests(SAHMSTestCase):
    def room_row(self, room):
        rows = self.client.get("/api/rooms/").json()["results"]
        return next(r for r in rows if r["room_id"] == room.pk)

    def maintenance(self, room, priority, status="Pending"):
        return MaintenanceRequest.objects.create(
            room=room, reported_by_student=self.s1, description="x",
            request_date="2026-10-01", priority=priority, status=status)

    def test_available_partial_and_full(self):
        row = self.room_row(self.room)
        self.assertEqual((row["status"], row["occupied_spaces"], row["available_spaces"]), ("Available", 0, 2))
        self.booking(student=self.s1, status="Active")
        row = self.room_row(self.room)
        self.assertEqual((row["status"], row["available_spaces"]), ("Available", 1))
        self.booking(student=self.s2, status="Active")
        row = self.room_row(self.room)
        self.assertEqual((row["status"], row["available_spaces"]), ("Occupied", 0))

    def test_pending_and_cancelled_bookings_do_not_occupy(self):
        self.booking(student=self.s1, status="Pending")
        self.booking(student=self.s2, status="Cancelled")
        self.assertEqual(self.room_row(self.room)["occupied_spaces"], 0)

    def test_maintenance_beats_occupied_only_for_high_or_urgent_open_requests(self):
        self.maintenance(self.room, "Low")
        self.assertEqual(self.room_row(self.room)["status"], "Available")
        self.maintenance(self.room, "Medium", status="In Progress")
        self.assertEqual(self.room_row(self.room)["status"], "Available")
        self.maintenance(self.room, "Urgent", status="Completed")
        self.assertEqual(self.room_row(self.room)["status"], "Available")
        self.maintenance(self.room, "High", status="In Progress")
        self.assertEqual(self.room_row(self.room)["status"], "Maintenance")

    def test_multiple_maintenance_rows_do_not_inflate_occupancy(self):
        self.booking(student=self.s1, status="Active")
        self.maintenance(self.room, "Urgent")
        self.maintenance(self.room, "High")
        row = self.room_row(self.room)
        self.assertEqual((row["occupied_spaces"], row["status"]), (1, "Maintenance"))

    def test_status_fields_present_on_create_response(self):
        r = self.client.post("/api/rooms/", {"hostel": self.hostel.pk, "room_number": "Z9",
                                             "capacity": 3, "price_per_semester": "100000"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["status"], r.json()["available_spaces"]), ("Available", 3))


class AvailableRoomsTests(SAHMSTestCase):
    URL = "/api/rooms/available/"
    Q = {"start_date": "2026-09-01", "end_date": "2026-12-15"}

    def test_lists_rooms_with_free_space_in_window(self):
        self.booking(student=self.s1, status="Active")
        r = self.client.get(self.URL, self.Q)
        self.assertEqual(r.status_code, 200, r.content)
        row = r.json()["results"][0]
        self.assertEqual((row["room_id"], row["free_spaces_in_window"]), (self.room.pk, 1))

    def test_full_room_is_excluded_but_non_overlapping_dates_are_free(self):
        self.booking(student=self.s1, status="Active")
        self.booking(student=self.s2, status="Active")
        self.assertEqual(self.client.get(self.URL, self.Q).json()["results"], [])
        later = {"start_date": "2027-02-01", "end_date": "2027-05-15"}
        self.assertEqual(len(self.client.get(self.URL, later).json()["results"]), 1)

    def test_maintenance_room_and_hostel_filter(self):
        MaintenanceRequest.objects.create(room=self.room, reported_by_student=self.s1, description="x",
                                          request_date="2026-10-01", priority="Urgent", status="Pending")
        self.assertEqual(self.client.get(self.URL, self.Q).json()["results"], [])
        other = Room.objects.create(hostel=self.hostel, room_number="B1", capacity=1,
                                    price_per_semester="1.00")
        rows = self.client.get(self.URL, {**self.Q, "hostel": self.hostel.pk}).json()["results"]
        self.assertEqual([r["room_id"] for r in rows], [other.pk])
        self.assertEqual(self.client.get(self.URL, {**self.Q, "hostel": 9999}).json()["results"], [])

    def test_missing_or_bad_dates_are_400(self):
        for q in ({}, {"start_date": "2026-09-01"}, {"end_date": "2026-12-15"},
                  {"start_date": "nope", "end_date": "2026-12-15"},
                  {"start_date": "2026-12-15", "end_date": "2026-09-01"}):
            self.assertEqual(self.client.get(self.URL, q).status_code, 400, q)

    def test_all_staff_roles_can_read_and_anonymous_cannot(self):
        for u in (self.warden_u, self.care, self.ro):
            self.login(u)
            self.assertEqual(self.client.get(self.URL, self.Q).status_code, 200, u.username)
        self.assertEqual(APIClient().get(self.URL, self.Q).status_code, 401)
