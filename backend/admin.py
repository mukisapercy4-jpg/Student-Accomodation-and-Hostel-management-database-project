from django.contrib import admin


class ViewOnlyAdmin(admin.ModelAdmin):
    """Business tables are changed only through the API, where the rules live."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

from .models import (
    Staff,
    Student,
    Hostel,
    Room,
    Booking,
    Payment,
    MaintenanceRequest,
    Visitor,
)


@admin.register(Staff)
class StaffAdmin(ViewOnlyAdmin):
    list_display = ("staff_id", "first_name", "last_name", "role", "phone", "email")
    search_fields = ("first_name", "last_name", "phone", "email")
    list_filter = ("role",)


@admin.register(Student)
class StudentAdmin(ViewOnlyAdmin):
    list_display = (
        "student_id",
        "reg_number",
        "first_name",
        "last_name",
        "gender",
        "program",
        "year_of_study",
    )
    search_fields = ("reg_number", "first_name", "last_name", "email")
    list_filter = ("gender", "program", "year_of_study")


@admin.register(Hostel)
class HostelAdmin(ViewOnlyAdmin):
    list_display = ("hostel_id", "name", "address", "warden")
    search_fields = ("name", "address")
    list_select_related = ("warden",)


@admin.register(Room)
class RoomAdmin(ViewOnlyAdmin):
    list_display = ("room_id", "hostel", "room_number", "capacity", "price_per_semester")
    search_fields = ("room_number", "hostel__name")
    list_filter = ("hostel",)
    list_select_related = ("hostel",)


@admin.register(Booking)
class BookingAdmin(ViewOnlyAdmin):
    list_display = (
        "booking_id",
        "student",
        "room",
        "academic_year",
        "semester",
        "status",
        "agreed_price",
    )
    search_fields = (
        "student__reg_number",
        "student__first_name",
        "student__last_name",
        "room__room_number",
    )
    list_filter = ("status", "academic_year", "semester")
    list_select_related = ("student", "room")


@admin.register(Payment)
class PaymentAdmin(ViewOnlyAdmin):
    list_display = (
        "payment_id",
        "booking",
        "amount",
        "payment_date",
        "payment_method",
        "payment_status",
    )
    list_filter = ("payment_method", "payment_status")
    list_select_related = ("booking",)


@admin.register(MaintenanceRequest)
class MaintenanceRequestAdmin(ViewOnlyAdmin):
    list_display = (
        "request_id",
        "room",
        "reported_by_student",
        "priority",
        "status",
        "request_date",
        "assigned_to",
    )
    list_filter = ("priority", "status", "request_date")
    search_fields = ("description", "room__room_number")
    list_select_related = ("room", "reported_by_student", "assigned_to")


@admin.register(Visitor)
class VisitorAdmin(ViewOnlyAdmin):
    list_display = (
        "visitor_id",
        "visitor_name",
        "booking",
        "visit_date",
        "check_in_time",
        "check_out_time",
    )
    search_fields = ("visitor_name", "phone")
    list_filter = ("visit_date",)
    list_select_related = ("booking",)
