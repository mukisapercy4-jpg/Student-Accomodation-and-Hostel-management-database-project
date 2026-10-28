from decimal import Decimal

from django.contrib.auth import authenticate
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from . import services
from .models import (
    Booking, Hostel, MaintenanceRequest, Payment, Room, Staff, Student, Visitor,
)
from .roles import MATRIX, user_roles
from .serializers import (
    BookingSerializer, HostelSerializer, MaintenanceRequestSerializer,
    PaymentSerializer, RoomSerializer, StaffSerializer, StudentSerializer,
    VisitorSerializer,
)

NO_DELETE = ["get", "post", "put", "patch", "head", "options"]


class BaseViewSet(viewsets.ModelViewSet):
    """Filters via ?field=value, search via ?search=, delete guarded."""

    resource = None
    filter_params = {}      # query param -> ORM lookup
    search_fields = ()
    dependents = ()         # (queryset-factory, label) blocking a delete

    def get_queryset(self):
        qs = super().get_queryset()
        for param, lookup in self.filter_params.items():
            value = self.request.query_params.get(param)
            if value not in (None, ""):
                qs = qs.filter(**{lookup: value})
        term = self.request.query_params.get("search", "").strip()
        if term and self.search_fields:
            q = Q()
            for f in self.search_fields:
                q |= Q(**{f"{f}__icontains": term})
            qs = qs.filter(q)
        return qs

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        for make_qs, label in self.dependents:
            n = make_qs(obj).count()
            if n:
                return Response(
                    {"detail": f"Cannot delete: {n} {label} still reference this record."},
                    status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)


class StaffViewSet(BaseViewSet):
    resource = "staff"
    queryset = Staff.objects.order_by("staff_id")
    serializer_class = StaffSerializer
    search_fields = ("first_name", "last_name", "email", "role")
    dependents = (
        (lambda o: Hostel.objects.filter(warden=o), "hostel(s)"),
        (lambda o: MaintenanceRequest.objects.filter(assigned_to=o), "maintenance request(s)"),
    )


class StudentViewSet(BaseViewSet):
    resource = "students"
    queryset = Student.objects.order_by("student_id")
    serializer_class = StudentSerializer
    search_fields = ("reg_number", "first_name", "last_name", "email")
    dependents = (
        (lambda o: Booking.objects.filter(student=o), "booking(s)"),
        (lambda o: MaintenanceRequest.objects.filter(reported_by_student=o), "maintenance request(s)"),
    )


def _hostel_qs():
    cap = (Room.objects.filter(hostel=OuterRef("pk")).values("hostel")
           .annotate(t=Sum("capacity")).values("t"))
    occ = (Booking.objects.filter(room__hostel=OuterRef("pk"), status="Active")
           .values("room__hostel").annotate(t=Count("pk")).values("t"))
    return Hostel.objects.select_related("warden").annotate(
        capacity=Coalesce(Subquery(cap, output_field=IntegerField()), 0),
        occupied_spaces=Coalesce(Subquery(occ, output_field=IntegerField()), 0),
    ).order_by("hostel_id")


class HostelViewSet(BaseViewSet):
    resource = "hostels"
    queryset = _hostel_qs()
    serializer_class = HostelSerializer
    search_fields = ("name", "address")
    dependents = ((lambda o: Room.objects.filter(hostel=o), "room(s)"),)


class RoomViewSet(BaseViewSet):
    resource = "rooms"
    queryset = Room.objects.select_related("hostel").annotate(
        occupied_spaces=Count("bookings", filter=Q(bookings__status="Active"))
    ).order_by("room_id")
    serializer_class = RoomSerializer
    filter_params = {"hostel": "hostel_id"}
    search_fields = ("room_number", "hostel__name")
    dependents = (
        (lambda o: Booking.objects.filter(room=o), "booking(s)"),
        (lambda o: MaintenanceRequest.objects.filter(room=o), "maintenance request(s)"),
    )


class BookingViewSet(BaseViewSet):
    """No DELETE: bookings are cancelled, never removed."""

    resource = "bookings"
    http_method_names = NO_DELETE
    queryset = Booking.objects.select_related("student", "room__hostel").annotate(
        paid=Sum("payments__amount", filter=Q(payments__payment_status="Completed"))
    ).order_by("-booking_id")
    serializer_class = BookingSerializer
    filter_params = {"status": "status", "student": "student_id", "room": "room_id",
                     "academic_year": "academic_year", "semester": "semester"}
    search_fields = ("student__reg_number", "student__first_name",
                     "student__last_name", "room__room_number")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        booking, completed = services.cancel_booking(self.get_object())
        data = self.get_serializer(booking).data
        data["completed_payments_total"] = str(completed)
        data["refund_review_required"] = completed > 0
        return Response(data)


class PaymentViewSet(BaseViewSet):
    """No DELETE: use payment_status Failed / Refunded."""

    resource = "payments"
    http_method_names = NO_DELETE
    queryset = Payment.objects.select_related("booking__student", "booking__room__hostel").order_by("-payment_id")
    serializer_class = PaymentSerializer
    filter_params = {"status": "payment_status", "booking": "booking_id",
                     "method": "payment_method"}
    search_fields = ("reference_number",)


class MaintenanceViewSet(BaseViewSet):
    resource = "maintenance"
    queryset = MaintenanceRequest.objects.select_related(
        "room__hostel", "reported_by_student", "assigned_to").order_by("-request_id")
    serializer_class = MaintenanceRequestSerializer
    filter_params = {"status": "status", "priority": "priority", "room": "room_id"}
    search_fields = ("description",)


class VisitorViewSet(BaseViewSet):
    resource = "visitors"
    queryset = Visitor.objects.select_related("booking__student", "booking__room__hostel").order_by("-visitor_id")
    serializer_class = VisitorSerializer
    filter_params = {"booking": "booking_id"}
    search_fields = ("visitor_name",)


class HealthView(APIView):
    """Unauthenticated liveness probe: lets the UI tell 'Django is down' from 'not signed in'."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"status": "ok"})


# ------------------------------------------------------------------- auth
class LoginThrottle(AnonRateThrottle):
    scope = "login"


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle]

    def post(self, request):
        user = authenticate(request,
                            username=request.data.get("username", ""),
                            password=request.data.get("password", ""))
        if user is None or not user.is_active:
            return Response({"detail": "Invalid username or password."},
                            status=status.HTTP_400_BAD_REQUEST)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, **_user_payload(user)})


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(_user_payload(request.user))


def _user_payload(user):
    from .roles import ROLES
    roles = sorted(user_roles(user))
    if user.is_superuser:
        roles = list(ROLES)
    return {"username": user.get_username(), "roles": roles,
            "permissions": {res: sorted(a for a in ("read", "create", "update", "delete")
                                        if _can(user, res, a))
                            for res in MATRIX}}


def _can(user, res, act):
    from .roles import can
    return can(user, res, act)


# -------------------------------------------------------------- dashboard
class DashboardView(APIView):
    resource = "dashboard"

    def get(self, request):
        from .roles import can
        hostels = list(_hostel_qs())
        capacity = sum(h.capacity for h in hostels)
        occupied = sum(h.occupied_spaces for h in hostels)
        by_status = dict(Booking.objects.values_list("status").annotate(n=Count("pk")))
        data = {
            "totals": {
                "students": Student.objects.count(),
                "hostels": len(hostels),
                "rooms": Room.objects.count(),
            },
            "occupancy": {
                "basis": "Active bookings only",
                "capacity": capacity,
                "occupied_spaces": occupied,
                "available_spaces": capacity - occupied,
                "rate_percent": round(occupied * 100 / capacity, 1) if capacity else 0,
                "overbooked_rooms": Room.objects.annotate(
                    n=Count("bookings", filter=Q(bookings__status="Active"))
                ).filter(n__gt=models_capacity()).count(),
                "by_hostel": HostelSerializer(hostels, many=True).data,
            },
            "bookings_by_status": {s: by_status.get(s, 0) for s in
                                   ("Pending", "Active", "Completed", "Cancelled")},
            "open_maintenance": MaintenanceRequest.objects.filter(
                status__in=("Pending", "In Progress")).count(),
            "recent_bookings": BookingSerializer(
                Booking.objects.select_related("student", "room__hostel").annotate(
                    paid=Sum("payments__amount", filter=Q(payments__payment_status="Completed")))
                .order_by("-booking_id")[:5], many=True).data,
        }
        if can(request.user, "payments", "read"):
            pend = Payment.objects.filter(payment_status="Pending")
            comp = Payment.objects.filter(payment_status="Completed")
            data["payments"] = {
                "completed_total": str(_money(comp.aggregate(t=Sum("amount"))["t"])),
                "outstanding_balance": str(_money(services.outstanding_balance())),
                "outstanding_balance_label": "Outstanding Balance",
                "pending_records_total": str(_money(pend.aggregate(t=Sum("amount"))["t"])),
                "pending_records_count": pend.count(),
            }
            flagged = services.bookings_needing_review()
            data["payments"]["review"] = {
                "flagged_bookings_count": len(flagged),
                "overpaid_total": str(_money(sum((Decimal(f["overpaid_by"]) for f in flagged), Decimal(0)))),
                "items": flagged[:20],
            }
        return Response(data)


def _money(value):
    return Decimal(value or 0).quantize(Decimal('0.01'))


def models_capacity():
    from django.db.models import F
    return F("capacity")
