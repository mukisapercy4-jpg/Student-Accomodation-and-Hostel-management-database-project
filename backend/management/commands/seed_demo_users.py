"""Create demo sign-in accounts for local demos. Refuses to run unless DJANGO_DEBUG=True.

    python manage.py seed_demo_users

The accounts and their shared password are public (they are also shown in the dev-only
"Quick Access" panel of the login screen), so they must never exist on a real deployment.
"""
from django.conf import settings
from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from accounts.models import StudentAccount
from backend.models import Student

DEMO_PASSWORD = "demo-pass-123"
DEMO_USERS = (("demo_manager", "Warden"), ("demo_admin", "Admin"), ("demo_readonly", "ReadOnly"),
              ("demo_student", "Student"))
DEMO_STUDENT_REG = "DEMO-0001"


class Command(BaseCommand):
    help = "Create/reset demo accounts (demo_manager, demo_admin, demo_readonly, demo_student). DEBUG only."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Demo accounts are only created when DJANGO_DEBUG=True.")
        call_command("seed_roles", stdout=self.stdout)
        for name, group in DEMO_USERS:
            user, created = User.objects.get_or_create(username=name)
            user.set_password(DEMO_PASSWORD)
            user.is_active = True
            user.save()
            user.groups.set([Group.objects.get(name=group)])
            self.stdout.write(f"{'created' if created else 'reset  '} {name} ({group})")
            if group == "Student":
                # the student login needs a student record to be linked to
                student, _ = Student.objects.get_or_create(
                    reg_number=DEMO_STUDENT_REG,
                    defaults={"first_name": "Demo", "last_name": "Student", "program": "Computer Science",
                              "year_of_study": 2, "email": "demo.student@example.com"})
                StudentAccount.objects.update_or_create(user=user, defaults={"student_id": student.pk})
