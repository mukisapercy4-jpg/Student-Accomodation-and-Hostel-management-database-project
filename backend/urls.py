from django.urls import path

from .views import (
    StaffListCreateAPIView,
    StudentListCreateAPIView,
    HostelListCreateAPIView,
    RoomListCreateAPIView,
    BookingListCreateAPIView,
    PaymentListCreateAPIView,
    MaintenanceRequestListCreateAPIView,
    VisitorListCreateAPIView,
)

urlpatterns = [
    path("staff/", StaffListCreateAPIView.as_view(), name="staff-list"),
    path("students/", StudentListCreateAPIView.as_view(), name="student-list"),
    path("hostels/", HostelListCreateAPIView.as_view(), name="hostel-list"),
    path("rooms/", RoomListCreateAPIView.as_view(), name="room-list"),
    path("bookings/", BookingListCreateAPIView.as_view(), name="booking-list"),
    path("payments/", PaymentListCreateAPIView.as_view(), name="payment-list"),
    path(
        "maintenance/",
        MaintenanceRequestListCreateAPIView.as_view(),
        name="maintenance-list",
    ),
    path("visitors/", VisitorListCreateAPIView.as_view(), name="visitor-list"),
]
