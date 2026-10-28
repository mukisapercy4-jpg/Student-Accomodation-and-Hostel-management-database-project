from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # Django administration
    path("admin/", admin.site.urls),

    # SAHMS REST API
    path("api/", include("backend.urls")),
]

