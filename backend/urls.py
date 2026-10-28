from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("staff", views.StaffViewSet, basename="staff")
router.register("students", views.StudentViewSet, basename="student")
router.register("hostels", views.HostelViewSet, basename="hostel")
router.register("rooms", views.RoomViewSet, basename="room")
router.register("bookings", views.BookingViewSet, basename="booking")
router.register("payments", views.PaymentViewSet, basename="payment")
router.register("maintenance", views.MaintenanceViewSet, basename="maintenance")
router.register("visitors", views.VisitorViewSet, basename="visitor")

urlpatterns = [
    path("health/", views.HealthView.as_view(), name="health"),
    path("auth/login/", views.LoginView.as_view(), name="login"),
    path("auth/logout/", views.LogoutView.as_view(), name="logout"),
    path("auth/me/", views.MeView.as_view(), name="me"),
    path("dashboard/", views.DashboardView.as_view(), name="dashboard"),
    path("", include(router.urls)),
]
