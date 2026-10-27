from rest_framework import generics

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

from .serializers import (
    StaffSerializer,
    StudentSerializer,
    HostelSerializer,
    RoomSerializer,
    BookingSerializer,
    PaymentSerializer,
    MaintenanceRequestSerializer,
    VisitorSerializer,
)


class StaffListCreateAPIView(generics.ListCreateAPIView):
    queryset = Staff.objects.all()
    serializer_class = StaffSerializer


class StudentListCreateAPIView(generics.ListCreateAPIView):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer


class HostelListCreateAPIView(generics.ListCreateAPIView):
    queryset = Hostel.objects.all()
    serializer_class = HostelSerializer


class RoomListCreateAPIView(generics.ListCreateAPIView):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer


class BookingListCreateAPIView(generics.ListCreateAPIView):
    queryset = Booking.objects.all()
    serializer_class = BookingSerializer


class PaymentListCreateAPIView(generics.ListCreateAPIView):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer


class MaintenanceRequestListCreateAPIView(generics.ListCreateAPIView):
    queryset = MaintenanceRequest.objects.all()
    serializer_class = MaintenanceRequestSerializer


class VisitorListCreateAPIView(generics.ListCreateAPIView):
    queryset = Visitor.objects.all()
    serializer_class = VisitorSerializer

