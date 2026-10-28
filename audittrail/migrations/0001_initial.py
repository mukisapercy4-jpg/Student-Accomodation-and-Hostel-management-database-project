# Generated for the new application-owned audit/history tables only.
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=20)),
                ("resource", models.CharField(max_length=40)),
                ("entity_id", models.CharField(blank=True, max_length=64)),
                ("changed_fields", models.JSONField(blank=True, default=list)),
                ("description", models.CharField(blank=True, max_length=255)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("request_id", models.CharField(blank=True, max_length=64)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="sahms_audit_events", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-timestamp", "-pk")},
        ),
        migrations.AddIndex(model_name="auditevent", index=models.Index(fields=["timestamp"], name="audit_timestamp_idx")),
        migrations.AddIndex(model_name="auditevent", index=models.Index(fields=["resource", "entity_id"], name="audit_entity_idx")),
        migrations.AddIndex(model_name="auditevent", index=models.Index(fields=["actor", "timestamp"], name="audit_actor_time_idx")),
        migrations.CreateModel(
            name="BookingStatusHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("booking_id", models.PositiveIntegerField(db_index=True)),
                ("old_status", models.CharField(blank=True, max_length=20)),
                ("new_status", models.CharField(max_length=20)),
                ("reason", models.CharField(blank=True, max_length=255)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="booking_status_events", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-timestamp", "-pk")},
        ),
        migrations.AddIndex(model_name="bookingstatushistory", index=models.Index(fields=["booking_id", "timestamp"], name="book_hist_time_idx")),
        migrations.CreateModel(
            name="PaymentStatusHistory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("payment_id", models.PositiveIntegerField(db_index=True)),
                ("old_status", models.CharField(blank=True, max_length=20)),
                ("new_status", models.CharField(max_length=20)),
                ("reason", models.CharField(blank=True, max_length=255)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="payment_status_events", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-timestamp", "-pk")},
        ),
        migrations.AddIndex(model_name="paymentstatushistory", index=models.Index(fields=["payment_id", "timestamp"], name="pay_hist_time_idx")),
    ]
