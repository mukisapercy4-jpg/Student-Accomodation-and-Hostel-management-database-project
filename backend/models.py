from decimal import Decimal

from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator


# =========================================================
# BASE MODEL
# Maps Django models to existing MySQL tables.
# =========================================================

class ExistingTableModel(models.Model):
    """Base class for tables that already exist in MySQL."""

    class Meta:
        abstract = True
        managed = False


# =========================================================
# 1. STAFF MODEL
# =========================================================

class Staff(ExistingTableModel):
    staff_id = models.AutoField(primary_key=True)

    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)

    phone = models.CharField(
        max_length=20,
        null=True,
        blank=True,
    )

    email = models.EmailField(
        max_length=100,
        null=True,
        blank=True,
    )

    role = models.CharField(max_length=30)

    employment_date = models.DateField(
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "staff"

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


# =========================================================
# 2. STUDENT MODEL
# =========================================================

class Student(ExistingTableModel):
    student_id = models.AutoField(primary_key=True)

    reg_number = models.CharField(
        max_length=50,
        unique=True,
    )

    first_name = models.CharField(max_length=50)
    last_name = models.CharField(max_length=50)

    gender = models.CharField(
        max_length=10,
        null=True,
        blank=True,
    )

    phone = models.CharField(
        max_length=20,
        null=True,
        blank=True,
    )

    email = models.EmailField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
    )

    program = models.CharField(max_length=100)

    year_of_study = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
    )

    national_id = models.CharField(
        max_length=50,
        unique=True,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "student"

    def __str__(self):
        return f"{self.reg_number} - {self.first_name} {self.last_name}"


# =========================================================
# 3. HOSTEL MODEL
# =========================================================

class Hostel(ExistingTableModel):
    hostel_id = models.AutoField(primary_key=True)

    name = models.CharField(
        max_length=100,
        unique=True,
    )

    address = models.CharField(
        max_length=255,
        null=True,
        blank=True,
    )

    warden = models.OneToOneField(
        Staff,
        on_delete=models.DO_NOTHING,
        db_column="warden_id",
        related_name="hostel_managed",
        null=False,
        blank=False,
    )

    class Meta:
        db_table = "hostel"

    def __str__(self):
        return self.name


# =========================================================
# 4. ROOM MODEL
# =========================================================

class Room(ExistingTableModel):
    room_id = models.AutoField(primary_key=True)

    hostel = models.ForeignKey(
        Hostel,
        on_delete=models.DO_NOTHING,
        db_column="hostel_id",
        related_name="rooms",
    )

    room_number = models.CharField(max_length=20)

    capacity = models.IntegerField(
        validators=[MinValueValidator(1)],
    )

    price_per_semester = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )

    class Meta:
        db_table = "room"

    def clean(self):
        super().clean()
        errors = {}

        if self.capacity is not None and self.capacity < 1:
            errors["capacity"] = "Room capacity must be greater than zero."

        if (
            self.price_per_semester is not None
            and self.price_per_semester < 0
        ):
            errors["price_per_semester"] = (
                "Room price cannot be negative."
            )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.hostel.name} - {self.room_number}"


# =========================================================
# 5. BOOKING MODEL
# =========================================================

class Booking(ExistingTableModel):

    BOOKING_STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Active", "Active"),
        ("Completed", "Completed"),
        ("Cancelled", "Cancelled"),
    ]

    SEMESTER_CHOICES = [
        (1, "Semester 1"),
        (2, "Semester 2"),
    ]

    booking_id = models.AutoField(primary_key=True)

    student = models.ForeignKey(
        Student,
        on_delete=models.DO_NOTHING,
        db_column="student_id",
        related_name="bookings",
    )

    room = models.ForeignKey(
        Room,
        on_delete=models.DO_NOTHING,
        db_column="room_id",
        related_name="bookings",
    )

    booking_date = models.DateField()

    academic_year = models.CharField(max_length=20)

    semester = models.IntegerField(
        choices=SEMESTER_CHOICES,
    )

    start_date = models.DateField()
    end_date = models.DateField()

    status = models.CharField(
        max_length=20,
        choices=BOOKING_STATUS_CHOICES,
        default="Pending",
    )

    agreed_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )

    class Meta:
        db_table = "booking"

    def clean(self):
        super().clean()
        errors = {}

        if self.semester is not None and self.semester not in (1, 2):
            errors["semester"] = "Semester must be 1 or 2."

        if (
            self.status is not None
            and self.status not in dict(self.BOOKING_STATUS_CHOICES)
        ):
            errors["status"] = "Select a valid booking status."

        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            errors["end_date"] = (
                "The booking end date cannot precede the start date."
            )

        if self.agreed_price is not None and self.agreed_price < 0:
            errors["agreed_price"] = (
                "The agreed price cannot be negative."
            )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return (
            f"{self.student} -> {self.room} "
            f"({self.academic_year} S{self.semester})"
        )


# =========================================================
# 6. PAYMENT MODEL
# =========================================================

class Payment(ExistingTableModel):

    PAYMENT_METHOD_CHOICES = [
        ("Mobile Money", "Mobile Money"),
        ("Bank", "Bank"),
        ("Cash", "Cash"),
    ]

    PAYMENT_STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Completed", "Completed"),
        ("Failed", "Failed"),
        ("Refunded", "Refunded"),
    ]

    payment_id = models.AutoField(primary_key=True)

    booking = models.ForeignKey(
        Booking,
        on_delete=models.DO_NOTHING,
        db_column="booking_id",
        related_name="payments",
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    payment_date = models.DateField()

    payment_method = models.CharField(
        max_length=30,
        choices=PAYMENT_METHOD_CHOICES,
    )

    reference_number = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
    )

    payment_status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUS_CHOICES,
        default="Pending",
    )

    class Meta:
        db_table = "payment"

    def clean(self):
        super().clean()
        errors = {}

        if self.amount is not None and self.amount <= 0:
            errors["amount"] = "Payment amount must be greater than zero."

        if (
            self.payment_method is not None
            and self.payment_method not in dict(self.PAYMENT_METHOD_CHOICES)
        ):
            errors["payment_method"] = "Select a valid payment method."

        if (
            self.payment_status is not None
            and self.payment_status not in dict(self.PAYMENT_STATUS_CHOICES)
        ):
            errors["payment_status"] = "Select a valid payment status."

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return self.reference_number or f"Payment {self.payment_id}"


# =========================================================
# 7. MAINTENANCE REQUEST MODEL
# =========================================================

class MaintenanceRequest(ExistingTableModel):

    PRIORITY_CHOICES = [
        ("Low", "Low"),
        ("Medium", "Medium"),
        ("High", "High"),
        ("Urgent", "Urgent"),
    ]

    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("In Progress", "In Progress"),
        ("Completed", "Completed"),
        ("Cancelled", "Cancelled"),
    ]

    request_id = models.AutoField(primary_key=True)

    room = models.ForeignKey(
        Room,
        on_delete=models.DO_NOTHING,
        db_column="room_id",
        related_name="maintenance_requests",
    )

    reported_by_student = models.ForeignKey(
        Student,
        on_delete=models.DO_NOTHING,
        db_column="reported_by_student",
        related_name="maintenance_requests",
    )

    description = models.TextField()

    request_date = models.DateField()

    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="Medium",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Pending",
    )

    assigned_to = models.ForeignKey(
        Staff,
        on_delete=models.DO_NOTHING,
        db_column="assigned_to",
        related_name="assigned_maintenance_requests",
        null=True,
        blank=True,
    )

    completion_date = models.DateField(
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "maintenance_request"

    def clean(self):
        super().clean()
        errors = {}

        if (
            self.priority is not None
            and self.priority not in dict(self.PRIORITY_CHOICES)
        ):
            errors["priority"] = "Select a valid maintenance priority."

        if (
            self.status is not None
            and self.status not in dict(self.STATUS_CHOICES)
        ):
            errors["status"] = "Select a valid maintenance status."

        if (
            self.request_date is not None
            and self.completion_date is not None
            and self.completion_date < self.request_date
        ):
            errors["completion_date"] = (
                "Completion date cannot precede the request date."
            )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"Maintenance request {self.request_id}"


# =========================================================
# 8. VISITOR MODEL
# =========================================================

class Visitor(ExistingTableModel):

    visitor_id = models.AutoField(primary_key=True)

    booking = models.ForeignKey(
        Booking,
        on_delete=models.DO_NOTHING,
        db_column="booking_id",
        related_name="visitors",
    )

    visitor_name = models.CharField(max_length=100)

    phone = models.CharField(
        max_length=20,
        null=True,
        blank=True,
    )

    visit_date = models.DateField()

    check_in_time = models.TimeField()

    check_out_time = models.TimeField(
        null=True,
        blank=True,
    )

    purpose = models.CharField(
        max_length=100,
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "visitor"

    def clean(self):
        super().clean()
        errors = {}

        if (
            self.check_in_time is not None
            and self.check_out_time is not None
            and self.check_out_time < self.check_in_time
        ):
            errors["check_out_time"] = (
                "Check-out time cannot precede check-in time."
            )

        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return self.visitor_name
