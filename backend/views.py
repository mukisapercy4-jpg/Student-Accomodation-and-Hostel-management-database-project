from decimal import Decimal

from django.conf import settings
from django.contrib.auth import authenticate
from django.db import transaction
from django.db.models import Count, Exists, IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from . import services
from audittrail.models import AuditEvent, BookingStatusHistory, PaymentStatusHistory
from .models import (
    Booking, Hostel, MaintenanceRequest, Payment, Room, Staff, Student, Visitor,
)
from .roles import student_id_for, student_only, user_payload, user_roles
from .serializers import (
    AvailableRoomsQuerySerializer, MomoInitiateSerializer, ReassignRoomSerializer,
    BookingSerializer, HostelSerializer, MaintenanceRequestSerializer,
    PaymentSerializer, RoleTokenObtainPairSerializer, RoomSerializer, StaffSerializer, StudentSerializer,
    VisitorSerializer, AuditEventSerializer, BookingStatusHistorySerializer,
    PaymentStatusHistorySerializer,
)

NO_DELETE = ["get", "post", "put", "patch", "head", "options"]


class BaseViewSet(viewsets.ModelViewSet):
    """Filters via ?field=value, search via ?search=, delete guarded."""

    resource = None
    filter_params = {}      # query param -> ORM lookup
    search_fields = ()
    dependents = ()         # (queryset-factory, label) blocking a delete
    student_scope = None    # ORM path to student_id: a Student-role login only sees its own rows

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if self.student_scope and student_only(user):
            sid = student_id_for(user)
            qs = qs.filter(**{self.student_scope: sid}) if sid else qs.none()
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

    def _audit(self, action, obj, changed_fields=(), description=""):
        # Never persist field values: names only, avoiding passwords, IDs, phones,
        # national IDs, payment details, and other personal/financial information.
        request = getattr(self, "request", None)
        actor = getattr(request, "user", None)
        if not getattr(actor, "is_authenticated", False):
            actor = None
        meta = getattr(request, "META", {}) if request else {}
        sensitive_names = {"national_id", "phone", "email", "reference_number",
                           "amount", "password", "token", "secret"}
        safe_fields = sorted({str(name) for name in changed_fields
                              if str(name).casefold() not in sensitive_names})
        AuditEvent.objects.create(
            actor=actor, action=action, resource=self.resource or "unknown",
            entity_id=str(getattr(obj, "pk", "")),
            changed_fields=safe_fields,
            description=description[:255],
            request_id=str(meta.get("HTTP_X_REQUEST_ID", ""))[:64],
        )

    @transaction.atomic
    def perform_create(self, serializer):
        # one transaction: if the audit/history row cannot be written, the change is rolled back
        obj = serializer.save()
        self._audit("create", obj, serializer.validated_data.keys(), "Record created")
        if isinstance(obj, Booking):
            BookingStatusHistory.objects.create(
                booking_id=obj.pk, old_status="", new_status=obj.status,
                actor=self.request.user if self.request.user.is_authenticated else None,
                reason=str(self.request.data.get("reason", ""))[:255])
        elif isinstance(obj, Payment):
            PaymentStatusHistory.objects.create(
                payment_id=obj.pk, old_status="", new_status=obj.payment_status,
                actor=self.request.user if self.request.user.is_authenticated else None,
                reason=str(self.request.data.get("reason", ""))[:255])

    @transaction.atomic
    def perform_update(self, serializer):
        old = serializer.instance
        old_status = getattr(old, "status", getattr(old, "payment_status", None))
        old_values = {f.name: getattr(old, f.name, None) for f in old._meta.concrete_fields}
        obj = serializer.save()
        changed = [name for name, value in old_values.items()
                   if getattr(obj, name, None) != value]
        self._audit("update", obj, changed, "Record updated")
        actor = self.request.user if self.request.user.is_authenticated else None
        reason = str(self.request.data.get("reason", ""))[:255]
        if isinstance(obj, Booking) and old_status != obj.status:
            BookingStatusHistory.objects.create(booking_id=obj.pk, old_status=old_status or "",
                new_status=obj.status, actor=actor, reason=reason)
        elif isinstance(obj, Payment) and old_status != obj.payment_status:
            PaymentStatusHistory.objects.create(payment_id=obj.pk, old_status=old_status or "",
                new_status=obj.payment_status, actor=actor, reason=reason)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        for make_qs, label in self.dependents:
            n = make_qs(obj).count()
            if n:
                return Response(
                    {"detail": f"Cannot delete: {n} {label} still reference this record."},
                    status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)

    @transaction.atomic
    def perform_destroy(self, instance):
        # delete first (it may be refused by the database), then record it; pk is cleared by delete()
        snapshot = type("Gone", (), {"pk": instance.pk})()
        super().perform_destroy(instance)
        self._audit("delete", snapshot, (), "Record deleted")


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
        occupied_spaces=Count("bookings", filter=Q(bookings__status="Active")),
        has_blocking_maintenance=Exists(MaintenanceRequest.objects.filter(
            room=OuterRef("pk"),
            status__in=services.MAINTENANCE_OPEN_STATUSES,
            priority__in=services.MAINTENANCE_BLOCKING_PRIORITIES)),
    ).order_by("room_id")
    serializer_class = RoomSerializer
    filter_params = {"hostel": "hostel_id"}
    search_fields = ("room_number", "hostel__name")
    dependents = (
        (lambda o: Booking.objects.filter(room=o), "booking(s)"),
        (lambda o: MaintenanceRequest.objects.filter(room=o), "maintenance request(s)"),
    )

    @action(detail=False, methods=["get"])
    def available(self, request):
        """Rooms with at least one free space for the whole of start_date..end_date.

        Read-only (needs `rooms` read). Rooms under blocking maintenance are left out.
        """
        q = AvailableRoomsQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        rooms = Room.objects.select_related("hostel").order_by("room_id")
        if q.validated_data.get("hostel"):
            rooms = rooms.filter(hostel_id=q.validated_data["hostel"])
        start, end = q.validated_data["start_date"], q.validated_data["end_date"]
        rows = []
        for room in rooms:
            if services.blocking_maintenance_exists(room):
                continue
            free = services.free_spaces_in_window(room, start, end)
            if free > 0:
                data = RoomSerializer(room).data
                data["free_spaces_in_window"] = free
                rows.append(data)
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(page) if page is not None else Response(rows)


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
    student_scope = "student_id"
    # these POST actions modify an existing booking, so they need "update" (students only hold read+create)
    action_verbs = {"cancel": "update", "approve": "update", "reject": "update", "reassign": "update"}

    def create(self, request, *args, **kwargs):
        """Staff create as before. A student books for themselves: the student is taken from the
        login (never from the body), the booking starts Pending and the price is the room's price."""
        if not student_only(request.user):
            return super().create(request, *args, **kwargs)
        sid = student_id_for(request.user)
        if sid is None:
            raise PermissionDenied("This login is not linked to a student record.")
        data = {k: v for k, v in request.data.items()}
        data.pop("agreed_price", None)
        data.update(student=sid, status="Pending")
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        if services.blocking_maintenance_exists(serializer.validated_data["room"]):
            raise ValidationError({"room": "This room is under maintenance and cannot be booked."})
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        original = self.get_object()
        old_status = original.status
        booking, completed = services.cancel_booking(original)
        if old_status != booking.status:
            actor = request.user if request.user.is_authenticated else None
            BookingStatusHistory.objects.create(
                booking_id=booking.pk, old_status=old_status, new_status=booking.status,
                actor=actor, reason=str(request.data.get("reason", ""))[:255])
            AuditEvent.objects.create(actor=actor, action="update", resource="bookings",
                entity_id=str(booking.pk), changed_fields=["status"],
                description="Booking cancelled", request_id=str(request.META.get("HTTP_X_REQUEST_ID", ""))[:64])
        data = self.get_serializer(booking).data
        data["completed_payments_total"] = str(completed)
        data["refund_review_required"] = completed > 0
        return Response(data)

    def _history(self, booking, old_status, reason):
        actor = self.request.user if self.request.user.is_authenticated else None
        if old_status != booking.status:
            BookingStatusHistory.objects.create(
                booking_id=booking.pk, old_status=old_status, new_status=booking.status,
                actor=actor, reason=reason[:255])

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def approve(self, request, pk=None):
        """Pending -> Active (capacity and overlap rules apply). Audited in one transaction."""
        original = self.get_object()
        old_status = original.status
        booking = services.approve_booking(original)
        reason = str(request.data.get("reason", ""))
        self._history(booking, old_status, reason)
        self._audit("update", booking, ["status"], "Booking approved")
        return Response(self.get_serializer(self.get_queryset().get(pk=booking.pk)).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reject(self, request, pk=None):
        """Pending -> Cancelled with an optional reason."""
        original = self.get_object()
        old_status = original.status
        booking = services.reject_booking(original)
        self._history(booking, old_status, str(request.data.get("reason", "")))
        self._audit("update", booking, ["status"], "Booking rejected")
        return Response(self.get_serializer(self.get_queryset().get(pk=booking.pk)).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def reassign(self, request, pk=None):
        """Move a Pending/Active booking to another room. Body: {"room": <room_id>}."""
        original = self.get_object()
        body = ReassignRoomSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        booking, old_room_id = services.reassign_room(original, body.validated_data["room"])
        self._audit("update", booking, ["room"],
                    f"Room reassigned from room #{old_room_id} to room #{booking.room_id}")
        return Response(self.get_serializer(self.get_queryset().get(pk=booking.pk)).data)


class PaymentViewSet(BaseViewSet):
    """No DELETE: use payment_status Failed / Refunded."""

    resource = "payments"
    http_method_names = NO_DELETE
    queryset = Payment.objects.select_related("booking__student", "booking__room__hostel").order_by("-payment_id")
    serializer_class = PaymentSerializer
    filter_params = {"status": "payment_status", "booking": "booking_id",
                     "method": "payment_method"}
    search_fields = ("reference_number",)
    student_scope = "booking__student_id"
    # POST payments/momo/ and payments/<id>/momo-confirm/ are open to students for their own bookings
    action_resources = {"momo": "momo_payments", "momo_confirm": "momo_payments"}

    @action(detail=False, methods=["post"], url_path="momo")
    @transaction.atomic
    def momo(self, request):
        """Record a Pending Mobile Money payment (SIMULATED, no gateway call).

        Body: booking, amount, network (MTN|Airtel), phone. The phone is validated
        and never stored. Settle it afterwards with PATCH payment_status
        Completed/Failed, which writes the status history and audit entry.
        """
        body = MomoInitiateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        d = body.validated_data
        if student_only(request.user) and d["booking"].student_id != student_id_for(request.user):
            raise PermissionDenied("You can only pay for your own bookings.")
        payment, masked = services.initiate_momo_payment(
            d["booking"], d["amount"], d["phone"], d["network"])
        actor = request.user if request.user.is_authenticated else None
        PaymentStatusHistory.objects.create(
            payment_id=payment.pk, old_status="", new_status=payment.payment_status,
            actor=actor, reason=f"Mobile Money request ({d['network']})")
        self._audit("create", payment,
                    ["booking", "payment_method", "payment_status", "reference_number"],
                    f"Mobile Money payment initiated ({d['network']})")
        data = self.get_serializer(payment).data
        data.update({"network": d["network"], "phone_masked": masked, "simulated": True})
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="momo-confirm")
    @transaction.atomic
    def momo_confirm(self, request, pk=None):
        """SIMULATED gateway callback. Body: {"outcome": "success" | "failure"}.

        Settles a Pending Mobile Money payment (history + audit entry in the same transaction).
        Only works while settings.MOMO_SIMULATE is True; a real gateway would call a webhook instead.
        Students reach only their own payments (the queryset is scoped), so others 404.
        """
        if not settings.MOMO_SIMULATE:
            raise PermissionDenied("No Mobile Money gateway is connected, so this payment cannot be confirmed here.")
        outcome = request.data.get("outcome")
        if outcome not in ("success", "failure"):
            raise ValidationError({"outcome": "Use 'success' or 'failure'."})
        payment = self.get_object()
        old = payment.payment_status
        payment = services.settle_momo_payment(payment, "Completed" if outcome == "success" else "Failed")
        actor = request.user if request.user.is_authenticated else None
        PaymentStatusHistory.objects.create(
            payment_id=payment.pk, old_status=old, new_status=payment.payment_status,
            actor=actor, reason="Mobile Money callback (simulated)")
        self._audit("update", payment, ["payment_status"],
                    f"Mobile Money payment {payment.payment_status.lower()} (simulated)")
        return Response(self.get_serializer(payment).data)


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


class AuditEventViewSet(viewsets.ReadOnlyModelViewSet):
    resource = "audit_logs"
    queryset = AuditEvent.objects.select_related("actor").all()
    serializer_class = AuditEventSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        term = self.request.query_params.get("search", "").strip()
        if term:
            qs = qs.filter(Q(entity_id__icontains=term) | Q(description__icontains=term)
                           | Q(request_id__icontains=term))
        for key in ("action", "resource", "actor_id"):
            value = self.request.query_params.get(key)
            if value not in (None, ""):
                qs = qs.filter(**{key: value})
        return qs


class BookingStatusHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    resource = "booking_history"
    queryset = BookingStatusHistory.objects.select_related("actor").all()
    serializer_class = BookingStatusHistorySerializer
    def get_queryset(self):
        qs = super().get_queryset()
        for key in ("booking_id", "old_status", "new_status"):
            value = self.request.query_params.get(key)
            if value not in (None, ""):
                qs = qs.filter(**{key: value})
        return qs


class PaymentStatusHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    resource = "payment_history"
    queryset = PaymentStatusHistory.objects.select_related("actor").all()
    serializer_class = PaymentStatusHistorySerializer
    def get_queryset(self):
        qs = super().get_queryset()
        for key in ("payment_id", "old_status", "new_status"):
            value = self.request.query_params.get(key)
            if value not in (None, ""):
                qs = qs.filter(**{key: value})
        return qs


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
        role = str(request.data.get("role", "")).strip()
        # One generic message for every failure, so a caller cannot learn
        # which usernames exist or which roles an account holds.
        failed = Response({"detail": "Sign-in failed. Check your username, password and selected role."},
                          status=status.HTTP_400_BAD_REQUEST)
        from .roles import ROLES
        if user is None or not user.is_active or role not in ROLES:
            return failed
        if not (user.is_superuser or role in user_roles(user)):
            return failed
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "signed_in_as": role,
                         **_user_payload(user, signed_in_as=role)})


class RoleTokenObtainPairView(TokenObtainPairView):
    """POST /api/auth/token/  {username, password} -> {access, refresh, role, home, ...}.

    The role (STUDENT | MANAGER | SUPER_ADMIN | ...) is returned in the body and inside the JWT
    claims. Send the access token as `Authorization: Bearer <access>`.
    """
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle]
    serializer_class = RoleTokenObtainPairSerializer


class LogoutView(APIView):
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    def get(self, request):
        return Response(_user_payload(request.user))


_user_payload = user_payload


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
