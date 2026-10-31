from django.contrib import admin
from django.urls import path, include, re_path
from SAHMS.spa import index as spa_index

urlpatterns = [
    # Django administration
    path("admin/", admin.site.urls),

    # SAHMS REST API
    path("api/", include("backend.urls")),

    # Everything else -> React SPA (client-side routing)
    re_path(r"^(?!api/|admin/|static/).*$", spa_index),
]
