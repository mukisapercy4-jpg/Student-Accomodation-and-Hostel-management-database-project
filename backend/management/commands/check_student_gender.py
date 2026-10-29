"""Read-only report of what student.gender really contains.

    python manage.py check_student_gender

student.gender is a nullable varchar(10) with no CHECK constraint, so it can
hold any text. Hostels accept every gender, so no rule depends on it; this
report only shows the distinct stored values (it only SELECTs).
"""
from django.core.management.base import BaseCommand
from django.db.models import Count

from backend.models import Student


class Command(BaseCommand):
    help = "List the distinct student.gender values and how many students hold each (read-only)."

    def handle(self, *args, **options):
        rows = Student.objects.values("gender").annotate(n=Count("pk")).order_by("-n")
        self.stdout.write("Stored student.gender values:")
        for r in rows:
            self.stdout.write(f"  {r['gender']!r:12} x{r['n']}")
        if not rows:
            self.stdout.write("  (no students)")
