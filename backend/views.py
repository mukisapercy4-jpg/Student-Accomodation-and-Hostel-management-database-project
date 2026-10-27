from rest_framework import generics
from .models import Hostel
from .serializers import HostelSerializer


class HostelListAPIView(generics.ListAPIView):
    queryset = Hostel.objects.all()
    serializer_class = HostelSerializer

