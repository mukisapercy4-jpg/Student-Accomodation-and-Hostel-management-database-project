from datetime import date
from decimal import Decimal

from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from . import services
from .models import (
    Booking, Hostel, MaintenanceRequest, Payment, Room, Staff, Student, Visitor,
)
from .roles import is_admin, role_code, user_payload


class StaffSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(
        max_length=100, required=False, allow_null=True, allow_blank=False,
        validators=[UniqueValidator(queryset=Staff.objects.all(),
                                    message="A staff member with this email already exists.")],
    )

    class Meta:
        model = Staff
        fields = ["staff_id", "first_name", "last_name", "phone", "email",
                  "role", "employment_date"]


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ["student_id", "reg_number", "first_name", "last_name", "gender",
                  "phone", "email", "program", "year_of_study", "national_id"]

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        # national_id is personal data: only Admin may read or write it.
        if request is not None and not is_admin(request.user):
            fields.pop("national_id", None)
        return fields


class HostelSerializer(serializers.ModelSerializer):
    warden_name = serializers.SerializerMethodField()
    capacity = serializers.IntegerField(read_only=True, default=0)
    occupied_spaces = serializers.IntegerField(read_only=True, default=0)
    occupancy = serializers.SerializerMethodField()

    class Meta:
        model = Hostel
        fields = ["hostel_id", "name", "address", "warden", "warden_name",
                  "capacity", "occupied_spaces", "occupancy"]

    def get_warden_name(self, obj):
        return str(obj.warden)

    def get_occupancy(self, obj):
        cap = getattr(obj, "capacity", 0) or 0
        occ = getattr(obj, "occupied_spaces", 0) or 0
        return round(occ * 100 / cap, 1) if cap else 0

    def validate_warden(self, staff):
        if staff.role.strip().casefold() != "warden":
            raise serializers.ValidationError(
                "The selected staff member's role is not 'warden'.")
        return staff


class RoomSerializer(serializers.ModelSerializer):
    hostel_name = serializers.CharField(source="hostel.name", read_only=True)
    occupied_spaces = serializers.IntegerField(read_only=True, default=0)
    # Derived, read-only: the room table has no status column (see services.room_status).
    status = serializers.SerializerMethodField()
    available_spaces = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ["room_id", "hostel", "hostel_name", "room_number", "capacity",
                  "price_per_semester", "occupied_spaces", "available_spaces", "status"]

    def _occupied(self, obj):
        occ = getattr(obj, "occupied_spaces", None)
        if occ is None:
            occ = Booking.objects.filter(room=obj, status="Active").count()
        return occ

    def get_available_spaces(self, obj):
        return max(obj.capacity - self._occupied(obj), 0)

    def get_status(self, obj):
        return services.room_status(
            obj, occupied=self._occupied(obj),
            blocked=getattr(obj, "has_blocking_maintenance", None))

    def validate(self, attrs):
        hostel = attrs.get("hostel") or (self.instance.hostel if self.instance else None)
        number = attrs.get("room_number") or (
            self.instance.room_number if self.instance else None)
        if self.instance and "hostel" in attrs and attrs["hostel"] != self.instance.hostel:
            raise serializers.ValidationError(
                {"hostel": "A room cannot be moved to another hostel."})
        clash = Room.objects.filter(hostel=hostel, room_number=number)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(
                {"room_number": "This hostel already has a room with this number."})
        if self.instance and "capacity" in attrs:
            active = Booking.objects.filter(room=self.instance, status="Active").count()
            if attrs["capacity"] < active:
                raise serializers.ValidationError(
                    {"capacity": f"Capacity cannot be below the {active} Active booking(s) in this room."})
        return attrs


class BookingSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_reg_number = serializers.CharField(source="student.reg_number", read_only=True)
    room_number = serializers.CharField(source="room.room_number", read_only=True)
    hostel_name = serializers.CharField(source="room.hostel.name", read_only=True)
    completed_payments = serializers.SerializerMethodField()
    overpaid_by = serializers.SerializerMethodField()
    review_reasons = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ["booking_id", "student", "student_name", "student_reg_number",
                  "room", "room_number", "hostel_name", "booking_date",
                  "academic_year", "semester", "start_date", "end_date",
                  "status", "agreed_price", "completed_payments", "overpaid_by",
                  "review_reasons"]

        extra_kwargs = {
            "booking_date": {"required": False},
            "agreed_price": {"required": False},
        }

    def _paid(self, obj):
        paid = getattr(obj, "paid", None)  # annotated by the list queryset
        return services.completed_total(obj) if paid is None and not hasattr(obj, "paid") else (paid or services.ZERO)

    def get_completed_payments(self, obj):
        return str(self._paid(obj))

    def get_overpaid_by(self, obj):
        return str(services.overpaid_by(obj, self._paid(obj)))

    def get_review_reasons(self, obj):
        return services.review_reasons(obj, self._paid(obj))

    def get_student_name(self, obj):
        return f"{obj.student.first_name} {obj.student.last_name}"

    def validate(self, attrs):
        inst = self.instance
        if inst is None:
            if attrs.get("status", "Pending") not in ("Pending", "Active"):
                raise serializers.ValidationError(
                    {"status": "A new booking must start as Pending or Active."})
            attrs.setdefault("booking_date", date.today())
            attrs.setdefault("agreed_price", attrs["room"].price_per_semester)
        else:
            if inst.status in ("Completed", "Cancelled"):
                raise serializers.ValidationError(
                    f"A {inst.status} booking can no longer be changed.")
            if "student" in attrs and attrs["student"] != inst.student:
                raise serializers.ValidationError(
                    {"student": "The student of a booking cannot be changed."})
            new = attrs.get("status", inst.status)
            if new != inst.status and new not in services.BOOKING_TRANSITIONS[inst.status]:
                raise serializers.ValidationError(
                    {"status": f"Cannot change a booking from {inst.status} to {new}."})
        start = attrs.get("start_date", inst.start_date if inst else None)
        end = attrs.get("end_date", inst.end_date if inst else None)
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "The booking end date cannot precede the start date."})
        return attrs

    def create(self, validated_data):
        return services.create_booking(
            lambda: serializers.ModelSerializer.create(self, validated_data),
            validated_data)

    def update(self, instance, validated_data):
        return services.update_booking(
            lambda: serializers.ModelSerializer.update(self, instance, validated_data),
            instance, validated_data)


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    booking_label = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ["payment_id", "booking", "booking_label", "student_name", "amount",
                  "payment_date", "payment_method", "reference_number", "payment_status"]
        extra_kwargs = {"payment_date": {"required": False}}

    def get_student_name(self, obj):
        st = obj.booking.student
        return f"{st.first_name} {st.last_name}"

    def get_booking_label(self, obj):
        b = obj.booking
        return f"#{b.booking_id} · {b.room.hostel.name} {b.room.room_number}"

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Flag only; the payment itself is never rejected or changed.
        data["booking_overpaid_by"] = str(services.overpaid_by(instance.booking))
        return data

    def validate(self, attrs):
        inst = self.instance
        if inst is None:
            attrs.setdefault("payment_date", date.today())
            return attrs
        if "booking" in attrs and attrs["booking"] != inst.booking:
            raise serializers.ValidationError(
                {"booking": "A payment cannot be moved to another booking."})
        new = attrs.get("payment_status", inst.payment_status)
        if new != inst.payment_status and new not in services.PAYMENT_TRANSITIONS[inst.payment_status]:
            raise serializers.ValidationError(
                {"payment_status": f"Cannot change a payment from {inst.payment_status} to {new}."})
        if inst.payment_status != "Pending":
            locked = {"amount", "payment_date", "payment_method", "reference_number"}
            changed = [f for f in locked if f in attrs and attrs[f] != getattr(inst, f)]
            if changed:
                raise serializers.ValidationError(
                    {f: "Only a Pending payment can be edited; use a refund/reversal status instead."
                     for f in changed})
        return attrs

    def create(self, validated_data):
        return services.create_payment(
            lambda: serializers.ModelSerializer.create(self, validated_data),
            validated_data)

    def update(self, instance, validated_data):
        return services.update_payment(
            lambda: serializers.ModelSerializer.update(self, instance, validated_data),
            instance, validated_data)


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    room_label = serializers.SerializerMethodField()
    reported_by_name = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRequest
        fields = ["request_id", "room", "room_label", "reported_by_student",
                  "reported_by_name", "description", "request_date", "priority",
                  "status", "assigned_to", "assigned_to_name", "completion_date"]
        extra_kwargs = {"request_date": {"required": False}}

    def get_room_label(self, obj):
        return f"{obj.room.hostel.name} {obj.room.room_number}"

    def get_reported_by_name(self, obj):
        st = obj.reported_by_student
        return f"{st.first_name} {st.last_name}" if st else None

    def get_assigned_to_name(self, obj):
        return str(obj.assigned_to) if obj.assigned_to else None

    def validate(self, attrs):
        if self.instance is None:
            attrs.setdefault("request_date", date.today())
        g = lambda k: attrs.get(k, getattr(self.instance, k, None) if self.instance else None)
        errors = {}
        if g("status") == "Completed" and not g("completion_date"):
            errors["completion_date"] = "A Completed request needs a completion date."
        if g("completion_date") and g("request_date") and g("completion_date") < g("request_date"):
            errors["completion_date"] = "Completion date cannot precede the request date."
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class VisitorSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    room_label = serializers.SerializerMethodField()

    class Meta:
        model = Visitor
        fields = ["visitor_id", "booking", "student_name", "room_label", "visitor_name",
                  "phone", "visit_date", "check_in_time", "check_out_time", "purpose"]
        extra_kwargs = {"visit_date": {"required": False}}

    def get_student_name(self, obj):
        st = obj.booking.student
        return f"{st.first_name} {st.last_name}"

    def get_room_label(self, obj):
        r = obj.booking.room
        return f"{r.hostel.name} {r.room_number}"

    def validate(self, attrs):
        if self.instance is None:
            attrs.setdefault("visit_date", date.today())
        g = lambda k: attrs.get(k, getattr(self.instance, k, None) if self.instance else None)
        if g("booking") and g("booking").status != "Active":
            raise serializers.ValidationError(
                {"booking": "Visitors can only be logged against an Active booking."})
        if g("check_out_time") and g("check_in_time") and g("check_out_time") < g("check_in_time"):
            raise serializers.ValidationError(
                {"check_out_time": "Check-out time cannot precede check-in time."})
        return attrs


# Read-only serializers for application-owned audit/history records.
from audittrail.models import AuditEvent, BookingStatusHistory, PaymentStatusHistory


class AuditEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True, default=None)
    # Spec-friendly aliases of the stored columns: who / what / which table / when.
    user_id = serializers.IntegerField(source="actor_id", read_only=True)
    action_type = serializers.CharField(source="action", read_only=True)
    table_name = serializers.CharField(source="resource", read_only=True)

    class Meta:
        model = AuditEvent
        fields = ["id", "actor", "actor_username", "user_id", "action", "action_type",
                  "resource", "table_name", "entity_id", "changed_fields", "description",
                  "timestamp", "request_id"]


class BookingStatusHistorySerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True, default=None)

    class Meta:
        model = BookingStatusHistory
        fields = ["id", "booking_id", "old_status", "new_status", "actor",
                  "actor_username", "reason", "timestamp"]


class PaymentStatusHistorySerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True, default=None)

    class Meta:
        model = PaymentStatusHistory
        fields = ["id", "payment_id", "old_status", "new_status", "actor",
                  "actor_username", "reason", "timestamp"]


class ReassignRoomSerializer(serializers.Serializer):
    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.select_related("hostel"))


class MomoInitiateSerializer(serializers.Serializer):
    booking = serializers.PrimaryKeyRelatedField(queryset=Booking.objects.all())
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    network = serializers.ChoiceField(choices=list(services.MOMO_PREFIXES))
    phone = serializers.CharField(max_length=20, write_only=True)

    def validate_phone(self, value):
        return services.normalize_msisdn(value)


class AvailableRoomsQuerySerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    hostel = serializers.IntegerField(required=False, min_value=1)

    def validate(self, attrs):
        if attrs["end_date"] < attrs["start_date"]:
            raise serializers.ValidationError({"end_date": "The end date cannot precede the start date."})
        return attrs


class RoleTokenObtainPairSerializer(TokenObtainPairSerializer):
    """SimpleJWT login that adds the user's role to the JWT claims and to the response body."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = role_code(user)
        token["username"] = user.get_username()
        return token

    @staticmethod
    def resolve_identifier(raw):
        """Username, e-mail address or student registration number -> the username to authenticate."""
        from django.contrib.auth import get_user_model
        from accounts.models import StudentAccount
        raw = (raw or "").strip()
        User = get_user_model()
        if "@" in raw:
            matches = list(User.objects.filter(email__iexact=raw)[:2])
            if len(matches) == 1:
                return matches[0].get_username()
        student = Student.objects.filter(reg_number__iexact=raw).first()
        if student:
            acct = StudentAccount.objects.select_related("user").filter(student_id=student.pk).first()
            if acct:
                return acct.user.get_username()
        return raw

    def validate(self, attrs):
        attrs[self.username_field] = self.resolve_identifier(attrs.get(self.username_field))
        data = super().validate(attrs)
        payload = user_payload(self.user)
        if payload["role"] is None:
            raise AuthenticationFailed("This account has no SAHMS role.")
        if payload["role"] == "STUDENT" and not payload.get("student"):
            raise AuthenticationFailed("This login is not linked to a student record.")
        data.update(payload)
        return data
