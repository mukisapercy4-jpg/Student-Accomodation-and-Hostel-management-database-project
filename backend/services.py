"""Business rules that depend on the verified MySQL schema.

Real names used: booking(student_id, room_id, start_date, end_date, status,
agreed_price); status in Pending/Active/Completed/Cancelled. payment(booking_id,
amount, payment_status); payment_status in Pending/Completed/Failed/Refunded.
room(capacity, price_per_semester); student(gender).

Every check that can race runs inside transaction.atomic() after locking the
student and room rows with SELECT ... FOR UPDATE (locks are taken in a fixed
order, student then room, so two requests cannot deadlock on each other).
"""
import re
import uuid
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from .models import Booking, MaintenanceRequest, Payment, Room, Student

ACTIVE = "Active"
COMPLETED = "Completed"
CANCELLED = "Cancelled"

BOOKING_TRANSITIONS = {
    "Pending": {"Active", "Cancelled"},
    "Active": {"Completed", "Cancelled"},
    "Completed": set(),
    "Cancelled": set(),
}
PAYMENT_TRANSITIONS = {
    "Pending": {"Completed", "Failed"},
    "Completed": {"Refunded"},
    "Failed": set(),
    "Refunded": set(),
}
ZERO = Decimal("0.00")


def _err(field, message):
    return serializers.ValidationError({field: message})


# ---------------------------------------------------------------- occupancy
def completed_total(booking, exclude_payment_id=None):
    qs = Payment.objects.filter(booking=booking, payment_status=COMPLETED)
    if exclude_payment_id:
        qs = qs.exclude(pk=exclude_payment_id)
    return qs.aggregate(t=Sum("amount"))["t"] or ZERO


def _overlapping_active(qs, start, end, exclude_id=None):
    qs = qs.filter(status=ACTIVE, start_date__lte=end, end_date__gte=start)
    return qs.exclude(pk=exclude_id) if exclude_id else qs


def _peak_occupancy(existing, start, end):
    """Highest number of existing bookings sharing any single day in [start, end].

    The maximum depth of inclusive date ranges always occurs on some range's
    start day, so checking those days (plus ``start``) is exact.
    """
    days = {start} | {max(b.start_date, start) for b in existing}
    return max(
        sum(1 for b in existing if b.start_date <= d <= b.end_date) for d in days
    )


# ----------------------------------------------------------------- bookings
# Hostels accept students of every gender: there is no gender rule on bookings.


def _check_active_rules(student, room, start, end, exclude_id=None):
    """Capacity and student-overlap checks; call only while holding the locks."""
    mine = _overlapping_active(
        Booking.objects.filter(student=student), start, end, exclude_id
    )
    if mine.exists():
        raise _err("student",
                   "This student already has an Active booking that overlaps these dates.")
    others = list(_overlapping_active(
        Booking.objects.filter(room=room), start, end, exclude_id
    ))
    if others and _peak_occupancy(others, start, end) + 1 > room.capacity:
        raise _err("room",
                   f"Room {room.room_number} would exceed its capacity of "
                   f"{room.capacity} for these dates.")


def _lock(student_id, room_id):
    student = Student.objects.select_for_update().get(pk=student_id)
    room = Room.objects.select_for_update().select_related("hostel").get(pk=room_id)
    return student, room


@transaction.atomic
def create_booking(save, data):
    status = data.get("status", "Pending")
    student, room = _lock(data["student"].pk, data["room"].pk)
    if status == ACTIVE:
        _check_active_rules(student, room, data["start_date"], data["end_date"])
    return save()


@transaction.atomic
def update_booking(save, instance, data):
    new_status = data.get("status", instance.status)
    room_id = data["room"].pk if "room" in data else instance.room_id
    student, room = _lock(instance.student_id, room_id)
    instance = Booking.objects.select_for_update().get(pk=instance.pk)
    start = data.get("start_date", instance.start_date)
    end = data.get("end_date", instance.end_date)
    if new_status == ACTIVE:
        _check_active_rules(student, room, start, end, exclude_id=instance.pk)
    return save()


@transaction.atomic
def cancel_booking(booking):
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if CANCELLED not in BOOKING_TRANSITIONS[booking.status]:
        raise serializers.ValidationError(
            {"status": f"A {booking.status} booking cannot be cancelled."})
    booking.status = CANCELLED
    booking.save(update_fields=["status"])
    return booking, completed_total(booking)


# ----------------------------------------------------------------- payments
def overpaid_by(booking, completed=None):
    """How far completed payments exceed the agreed price (0 if they do not)."""
    completed = completed_total(booking) if completed is None else completed
    return max(completed - booking.agreed_price, ZERO)


def review_reasons(booking, completed=None):
    """Reasons an administrator should look at a booking's money (never blocks anything)."""
    completed = completed_total(booking) if completed is None else completed
    reasons = []
    if completed > booking.agreed_price:
        reasons.append("Overpayment: completed payments exceed the agreed price")
    if booking.status == CANCELLED and completed > 0:
        reasons.append("Cancelled booking still holds completed payments (refund review)")
    return reasons


# A genuine payment is never rejected, truncated or altered because completed
# payments exceed the agreed price: it is kept as recorded and the booking is
# flagged for administrative review (see review_reasons). The one structural
# rule kept is that nothing new is recorded against a Cancelled booking; money
# already received before a cancellation is flagged for refund review instead.
@transaction.atomic
def create_payment(save, data):
    booking = Booking.objects.select_for_update().get(pk=data["booking"].pk)
    if booking.status == CANCELLED:
        raise _err("booking", "Payments cannot be added to a Cancelled booking.")
    return save()


@transaction.atomic
def update_payment(save, instance, data):
    booking = Booking.objects.select_for_update().get(pk=instance.booking_id)
    instance = Payment.objects.select_for_update().get(pk=instance.pk)
    if (data.get("payment_status") == COMPLETED
            and instance.payment_status != COMPLETED and booking.status == CANCELLED):
        raise _err("booking", "A payment on a Cancelled booking cannot be completed.")
    return save()


def bookings_needing_review():
    """Bookings with an overpayment or completed money on a Cancelled booking."""
    from django.db.models import Q

    rows = (Booking.objects.select_related("student", "room__hostel")
            .annotate(paid=Sum("payments__amount",
                               filter=Q(payments__payment_status=COMPLETED))))
    out = []
    for b in rows:
        paid = b.paid or ZERO
        reasons = review_reasons(b, paid)
        if reasons:
            out.append({
                "booking_id": b.booking_id,
                "student": f"{b.student.first_name} {b.student.last_name}",
                "student_reg_number": b.student.reg_number,
                "hostel": b.room.hostel.name, "room": b.room.room_number,
                "status": b.status,
                "agreed_price": str(b.agreed_price),
                "completed_payments": str(paid),
                "overpaid_by": str(overpaid_by(b, paid)),
                "reasons": reasons,
            })
    return out


# ---------------------------------------------------------------- dashboard
def outstanding_balance():
    """Sum over non-cancelled bookings of max(agreed_price - completed, 0)."""
    from django.db.models import Q

    rows = (
        Booking.objects.exclude(status=CANCELLED)
        .annotate(paid=Sum("payments__amount",
                           filter=Q(payments__payment_status=COMPLETED)))
        .values_list("agreed_price", "paid")
    )
    return sum((max(price - (paid or ZERO), ZERO) for price, paid in rows), ZERO)


def payment_breakdown():
    """Dashboard numbers behind the Payment Status card.

    settlement: non-cancelled bookings split by how much of the agreed price is Completed.
    channels:   Completed money per payment method.
    agreed_total / cleared_percent: agreed price of those bookings and the share already paid.
    """
    from django.db.models import Q

    rows = list(Booking.objects.exclude(status=CANCELLED)
                .annotate(paid=Sum("payments__amount", filter=Q(payments__payment_status=COMPLETED)))
                .values_list("agreed_price", "paid"))
    full = partial = unpaid = 0
    agreed = paid_capped = ZERO
    for price, paid in rows:
        paid = paid or ZERO
        agreed += price
        paid_capped += min(paid, price)
        if paid <= 0:
            unpaid += 1
        elif paid >= price:
            full += 1
        else:
            partial += 1
    channels = {m: ZERO for m in ("Bank", "Mobile Money", "Cash")}
    for method, total in (Payment.objects.filter(payment_status=COMPLETED)
                          .values_list("payment_method").annotate(t=Sum("amount"))):
        channels[method] = total or ZERO
    return {
        "settlement": {"fully_paid": full, "partial": partial, "unpaid": unpaid, "bookings": len(rows)},
        "channels": {k: str(Decimal(v).quantize(Decimal("0.01"))) for k, v in channels.items()},
        "agreed_total": str(Decimal(agreed).quantize(Decimal("0.01"))),
        "cleared_percent": float(round(paid_capped * 100 / agreed, 1)) if agreed else 0.0,
    }


# ------------------------------------------------------------- room status
# The room table has no status column (schema is frozen), so the status shown on
# room cards is derived: Maintenance > Occupied > Available.
# ASSUMPTION (confirm): only High/Urgent open maintenance blocks a room; a Low or
# Medium request (a dripping tap) does not take the room out of service.
MAINTENANCE_BLOCKING_PRIORITIES = ("High", "Urgent")
MAINTENANCE_OPEN_STATUSES = ("Pending", "In Progress")

ROOM_AVAILABLE = "Available"
ROOM_OCCUPIED = "Occupied"
ROOM_MAINTENANCE = "Maintenance"


def blocking_maintenance_exists(room):
    return MaintenanceRequest.objects.filter(
        room=room, status__in=MAINTENANCE_OPEN_STATUSES,
        priority__in=MAINTENANCE_BLOCKING_PRIORITIES).exists()


def room_status(room, occupied=None, blocked=None):
    """Derived card status. Pass annotated values to avoid extra queries."""
    if blocked is None:
        blocked = blocking_maintenance_exists(room)
    if blocked:
        return ROOM_MAINTENANCE
    if occupied is None:
        occupied = Booking.objects.filter(room=room, status=ACTIVE).count()
    return ROOM_OCCUPIED if occupied >= room.capacity else ROOM_AVAILABLE


def free_spaces_in_window(room, start, end):
    """Spaces still free for the whole of [start, end] (Active bookings only)."""
    others = list(_overlapping_active(Booking.objects.filter(room=room), start, end))
    peak = _peak_occupancy(others, start, end) if others else 0
    return max(room.capacity - peak, 0)


# ---------------------------------------------------- booking approval flow
@transaction.atomic
def approve_booking(booking):
    """Pending -> Active, with the same capacity/overlap rules as creating an Active booking."""
    student, room = _lock(booking.student_id, booking.room_id)
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if ACTIVE not in BOOKING_TRANSITIONS[booking.status]:
        raise _err("status", f"A {booking.status} booking cannot be approved.")
    if booking.status != "Pending":
        raise _err("status", "Only a Pending booking can be approved.")
    _check_active_rules(student, room, booking.start_date, booking.end_date,
                        exclude_id=booking.pk)
    booking.status = ACTIVE
    booking.save(update_fields=["status"])
    return booking


@transaction.atomic
def reject_booking(booking):
    """Pending -> Cancelled. Active bookings go through cancel_booking instead."""
    current = Booking.objects.select_for_update().get(pk=booking.pk)
    if current.status != "Pending":
        raise _err("status", "Only a Pending booking can be rejected.")
    return cancel_booking(current)[0]


@transaction.atomic
def reassign_room(booking, new_room):
    """Move a Pending/Active booking to another room. Returns (booking, old_room_id).

    The agreed price is NOT changed: it is what the student agreed to pay.
    """
    student, room = _lock(booking.student_id, new_room.pk)
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status not in ("Pending", ACTIVE):
        raise _err("status", f"A {booking.status} booking cannot be moved to another room.")
    if booking.room_id == room.pk:
        raise _err("room", "The booking is already in this room.")
    if blocking_maintenance_exists(room):
        raise _err("room", f"Room {room.room_number} is under maintenance.")
    if booking.status == ACTIVE:
        _check_active_rules(student, room, booking.start_date, booking.end_date,
                            exclude_id=booking.pk)
    old_room_id = booking.room_id
    booking.room = room
    booking.save(update_fields=["room"])
    return booking, old_room_id


# ------------------------------------------------------ mobile money (MoMo)
# SIMULATED: no real MTN/Airtel gateway is called. initiate_momo_payment only
# records a Pending payment; the outcome is applied afterwards with the existing
# Pending -> Completed / Failed payment transition (PATCH /payments/<id>/).
# The phone number is validated and then discarded: it is never stored or logged.
MOMO_PREFIXES = {
    "MTN": ("077", "078", "076", "039"),
    "Airtel": ("070", "075", "074"),
}


def normalize_msisdn(raw):
    """Accept 07XXXXXXXX, 2567XXXXXXXX or +2567XXXXXXXX; return 07XXXXXXXX or raise."""
    digits = re.sub(r"[\s\-()]", "", str(raw or ""))
    if digits.startswith("+"):
        digits = digits[1:]
    if digits.startswith("256") and len(digits) == 12:
        digits = "0" + digits[3:]
    if not re.fullmatch(r"0\d{9}", digits):
        raise _err("phone", "Enter a valid Ugandan mobile number, e.g. 0772123456.")
    return digits


def detect_momo_network(msisdn):
    for network, prefixes in MOMO_PREFIXES.items():
        if msisdn.startswith(prefixes):
            return network
    return None


@transaction.atomic
def initiate_momo_payment(booking, amount, phone, network):
    """Validate and record a Pending Mobile Money payment. Returns (payment, masked_phone)."""
    msisdn = normalize_msisdn(phone)
    detected = detect_momo_network(msisdn)
    if detected is None:
        raise _err("phone", "This number is not an MTN or Airtel Uganda mobile number.")
    if detected != network:
        raise _err("network", f"This number belongs to {detected}, not {network}.")
    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    if booking.status == CANCELLED:
        raise _err("booking", "Payments cannot be added to a Cancelled booking.")
    payment = Payment.objects.create(
        booking=booking, amount=amount, payment_method="Mobile Money",
        payment_status="Pending",
        reference_number=f"MOMO-{network.upper()}-{uuid.uuid4().hex[:12].upper()}",
        payment_date=date.today())
    return payment, f"{msisdn[:4]}***{msisdn[-3:]}"


@transaction.atomic
def settle_momo_payment(payment, new_status):
    """Pending -> Completed/Failed for a Mobile Money payment (the simulated gateway callback)."""
    booking = Booking.objects.select_for_update().get(pk=payment.booking_id)
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.payment_method != "Mobile Money" or not (payment.reference_number or "").startswith("MOMO-"):
        raise _err("payment_method", "Only a Mobile Money payment can be confirmed this way.")
    if payment.payment_status != "Pending":
        raise _err("payment_status", f"A {payment.payment_status} payment can no longer be confirmed.")
    if new_status == COMPLETED and booking.status == CANCELLED:
        raise _err("booking", "A payment on a Cancelled booking cannot be completed.")
    payment.payment_status = new_status
    payment.save(update_fields=["payment_status"])
    return payment
