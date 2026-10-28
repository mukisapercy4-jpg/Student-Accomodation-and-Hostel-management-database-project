from rest_framework import serializers

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


class StaffSerializer(serializers.ModelSerializer):
    class Meta:
        model = Staff
        fields = "__all__"


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = "__all__"


class HostelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Hostel
        fields = "__all__"


class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = "__all__"


class BookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = "__all__"


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = "__all__"


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceRequest
        fields = "__all__"


class VisitorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Visitor
        fields = "__all__"
