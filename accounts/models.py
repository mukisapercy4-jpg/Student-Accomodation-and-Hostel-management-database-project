from django.conf import settings
from django.db import models


class StudentAccount(models.Model):
    """Links a Django login to a row of the (externally managed) student table.

    `student_id` is a plain integer, not a ForeignKey: the business tables are never
    touched by Django migrations (see SAHMS/db_router.py), so this table lives in the
    framework database next to auth_user and holds the link only.
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="student_account")
    student_id = models.PositiveIntegerField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user_id} -> student #{self.student_id}"
