from django.urls import path
from .views import HostelListAPIView


urlpatterns = [
    path("hostels/", HostelListAPIView.as_view(), name="hostel-list"),
]
