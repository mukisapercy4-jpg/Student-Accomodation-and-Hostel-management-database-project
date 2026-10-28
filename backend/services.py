"""Business rules that depend on the verified MySQL schema.

Real names used: booking(student_id, room_id, start_date, end_date, status,
agreed_price); status in Pending/Active/Completed/Cancelled. payment(booking_id,
amount, payment_status); payment_status in Pending/Completed/Failed/Refunded.
room(capacity, price_per_semester); student(gender).

Every check that can race runs inside transaction.atomic() after locking the
student and room rows with SELECT ... FOR UPDATE (locks are taken in a fixed
order, student then room, so two requests cannot deadlock on each other).
"""
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from .models import Booking, Payment, Room, Student

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
def _male_only_check(student, room):
    restricted = {n.casefold() for n in settings.MALE_ONLY_HOSTELS}
    if room.hostel.name.casefold() not in restricted:
        return
    gender = (student.gender or "").strip().casefold()
    if gender not in ("male", "m"):
        raise _err("student", f"{room.hostel.name} accepts male students only.")


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
    _male_only_check(student, room)


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
    price = data.get("agreed_price")
    if price is not None and price < completed_total(instance):
        raise _err("agreed_price",
                   "Agreed price cannot be lower than completed payments already received.")
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
def _check_payment_booking(booking):
    """Do not accept new/completed payments against a cancelled booking.

    Genuine payments are never rejected just because the cumulative total is
    above the agreed price. Overpayments are preserved and surfaced on the
    dashboard for administrative review.
    """
    if booking.status == CANCELLED:
        raise _err("booking", "Payments cannot be completed for a Cancelled booking.")


@transaction.atomic
def create_payment(save, data):
    booking = Booking.objects.select_for_update().get(pk=data["booking"].pk)
    if booking.status == CANCELLED:
        raise _err("booking", "Payments cannot be added to a Cancelled booking.")
    _check_payment_booking(booking)
    return save()


@transaction.atomic
def update_payment(save, instance, data):
    booking = Booking.objects.select_for_update().get(pk=instance.booking_id)
    instance = Payment.objects.select_for_update().get(pk=instance.pk)
    new_status = data.get("payment_status", instance.payment_status)
    amount = data.get("amount", instance.amount)
    if new_status == COMPLETED:
        _check_payment_booking(booking)
    return save()


# ---------------------------------------------------------------- dashboard
def overpayment_summary():
    """Return the total excess completed payments and number of affected bookings."""
    from django.db.models import Q

    rows = (
        Booking.objects.exclude(status=CANCELLED)
        .annotate(paid=Sum("payments__amount", filter=Q(payments__payment_status=COMPLETED)))
        .values_list("agreed_price", "paid")
    )
    excesses = [max((paid or ZERO) - price, ZERO) for price, paid in rows]
    return sum(excesses, ZERO), sum(1 for amount in excesses if amount > ZERO)


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
