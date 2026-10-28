"""Read-only report of what student.gender really contains.

    python manage.py check_student_gender

student.gender is a nullable varchar(10) with no CHECK constraint, so the
male-only rule (see services.is_male) can only be as reliable as the stored
values. Run this against the live database (it only SELECTs) before relying
on the rule, and fix any student listed as NOT accepted.
"""
from django.core.management.base import BaseCommand
from django.db.models import Count

from backend.models import Booking, Student
from backend.services import MALE_VALUES, is_male


class Command(BaseCommand):
    help = "List distinct student.gender values and who the male-only rule would reject (read-only)."

    def handle(self, *args, **options):
        rows = Student.objects.values("gender").annotate(n=Count("pk")).order_by("-n")
        self.stdout.write(f"Accepted as male (case-insensitive): {sorted(MALE_VALUES)}")
        self.stdout.write("Stored values:")
        bad = 0
        for r in rows:
            ok = is_male(r["gender"])
            bad += 0 if ok else r["n"]
            self.stdout.write(f"  {r['gender']!r:12} x{r['n']:<5} {'accepted' if ok else 'NOT accepted'}")
        if not rows:
            self.stdout.write("  (no students)")
        blocked = Student.objects.exclude(
            pk__in=[s.pk for s in Student.objects.all() if is_male(s.gender)])
        flagged = Booking.objects.filter(student__in=blocked,
                                         status__in=("Pending", "Active")).count()
        self.stdout.write(f"{bad} student(s) would be rejected for new bookings.")
        self.stdout.write(f"{flagged} existing Pending/Active booking(s) belong to such students "
                          "(left untouched; review them manually).")
