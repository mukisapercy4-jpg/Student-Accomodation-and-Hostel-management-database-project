from django.conf import settings
from django.db import models


class AuditEvent(models.Model):
    """Append-only application audit entry; deliberately stores no field values or secrets."""
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                              on_delete=models.SET_NULL, related_name="sahms_audit_events")
    action = models.CharField(max_length=20)
    resource = models.CharField(max_length=40)
    entity_id = models.CharField(max_length=64, blank=True)
    changed_fields = models.JSONField(default=list, blank=True)
    description = models.CharField(max_length=255, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    request_id = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ("-timestamp", "-pk")
        indexes = [
            models.Index(fields=["timestamp"], name="audit_timestamp_idx"),
            models.Index(fields=["resource", "entity_id"], name="audit_entity_idx"),
            models.Index(fields=["actor", "timestamp"], name="audit_actor_time_idx"),
        ]

    def __str__(self):
        return f"{self.timestamp} {self.action} {self.resource}#{self.entity_id}"


class BookingStatusHistory(models.Model):
    booking_id = models.PositiveIntegerField(db_index=True)
    old_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                              on_delete=models.SET_NULL, related_name="booking_status_events")
    reason = models.CharField(max_length=255, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-timestamp", "-pk")
        indexes = [models.Index(fields=["booking_id", "timestamp"], name="book_hist_time_idx")]


class PaymentStatusHistory(models.Model):
    payment_id = models.PositiveIntegerField(db_index=True)
    old_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                              on_delete=models.SET_NULL, related_name="payment_status_events")
    reason = models.CharField(max_length=255, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-timestamp", "-pk")
        indexes = [models.Index(fields=["payment_id", "timestamp"], name="pay_hist_time_idx")]
