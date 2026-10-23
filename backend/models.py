from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Staff(models.Model):
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    role = models.CharField(max_length=50)
    phone = models.CharField(max_length=20)
    email = models.EmailField(max_length=100, unique=True)

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class Student(models.Model):
    class Gender(models.TextChoices):
        MALE = "Male", "Male"
        FEMALE = "Female", "Female"

    reg_number = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    phone = models.CharField(max_length=20)
    email = models.EmailField(max_length=100, unique=True)
    program = models.CharField(max_length=100)
    year_of_study = models.PositiveSmallIntegerField()
    national_id = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return f"{self.reg_number} - {self.first_name} {self.last_name}"


class Hostel(models.Model):
    class GenderCategory(models.TextChoices):
        MALE = "Male", "Male"
        FEMALE = "Female", "Female"
        MIXED = "Mixed", "Mixed"

    name = models.CharField(max_length=100)
    gender_category = models.CharField(
        max_length=20, choices=GenderCategory.choices)
    address = models.CharField(max_length=255)
    # ── CHANGED: ON DELETE RESTRICT -> on_delete=PROTECT (Django's equivalent).
    # related_name lets you write staff.hostels_managed.all()
    warden = models.ForeignKey(
        Staff, on_delete=models.PROTECT, related_name="hostels_managed"
    )

    def __str__(self):
        return self.name


class Room(models.Model):
    hostel = models.ForeignKey(
        Hostel, on_delete=models.CASCADE, related_name="rooms")
    room_number = models.CharField(max_length=20)
    room_type = models.CharField(max_length=50)
    capacity = models.PositiveSmallIntegerField()
    price_per_semester = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["hostel", "room_number"],
                name="unique_room_per_hostel"
            ),
            models.CheckConstraint(
                condition=Q(capacity__gt=0),
                name="room_capacity_positive"
            ),
        ]

    def __str__(self):
        return f"{self.hostel.name} - {self.room_number}"


class Booking(models.Model):
    class Status(models.TextChoices):
        PENDINg = "Pending", "Pending"
        CONFIRMED = "Confirmed", "Confirmed"
        CHECKED_IN = "Checked In", "Checked In"
        CHECKED_OUT = "Checked Out", "Checked Out"
        CANCELLED = "Cancelled", "Cancelled"

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="bookings"
    )
    room = models.ForeignKey(
        Room, on_delete=models.PROTECT, related_name="bookings")
    academic_year = models.CharField(max_length=20)
    semester = models.PositiveSmallIntegerField()
    check_in_date = models.DateField(null=True, blank=True)
    check_out_date = models.DecimalField(max_digits=10, decimal_places=2)
    agreed_price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=Status.Choices,
        default=Status.PENDING
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(check_out_date__gte=F("check_in_date")),
                name="checkout_after_checkin",
            ),
            models.UniqueConstraint(
                fields=["student", "academic_year", "semester"],
                condition=~Q(status="Cancelled"),
                name="one_active_booking_per_semester",
            ),
        ]

    def __str__(self):
        return f"{self.student} -> {self.room} ({self.academic_year} S{self.semester})"


class Payment(models.Model):
    class Status(models.TextChoices):
        COMPLETED = "Completed", "Completed"
        REFUNDED = "Refunded", "Refunded"
        FAILED = "Failed", "Failed"

    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="payments"
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    # ── CHANGED: DEFAULT CURRENT_TIMESTAMP -> default=timezone.now. Pass the
    # function itself, with no (), so it's evaluated per row, not at import.
    payment_date = models.DateTimeField(default=timezone.now)
    payment_method = models.CharField(max_length=50)
    receipt_number = models.CharField(max_length=50, unique=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.COMPLETED
    )

    def __str__(self):
        return self.receipt_number


class MaintenanceRequest(models.Model):
    class Status(models.TextChoices):
        OPEN = "Open", "Open"
        IN_PROGRESS = "In Progress", "In Progress"
        RESOLVED = "Resolved", "Resolved"

    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="maintenance_requests"
    )
    # ── CHANGED: ON DELETE SET NULL -> on_delete=SET_NULL, which requires
    # null=True on the field (Django raises an error at startup without it).
    staff = models.ForeignKey(
        Staff,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="maintenance_requests",
    )
    description = models.TextField()
    # ── CHANGED: DEFAULT CURRENT_DATE -> auto_now_add stamps it on creation.
    date_requested = models.DateField(auto_now_add=True)
    date_resolved = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OPEN
    )


class Visitor(models.Model):
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name="visitors"
    )
    # This is the staff member who logged the visit (e.g. a gate guard).
    staff = models.ForeignKey(
        Staff, on_delete=models.PROTECT, related_name="logged_visits"
    )
    visitor_name = models.CharField(max_length=100)
    national_id = models.CharField(max_length=50)
    visit_date = models.DateField(default=timezone.localdate)
    time_in = models.TimeField()
    time_out = models.TimeField(null=True, blank=True)
    purpose = models.CharField(max_length=255, blank=True)
