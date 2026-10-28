from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from backend.roles import ROLES


class Command(BaseCommand):
    help = ("Create the four role groups (Admin, Warden, Caretaker, ReadOnly). "
            "Touches only Django's auth_group table.")

    def handle(self, *args, **options):
        for name in ROLES:
            _, created = Group.objects.get_or_create(name=name)
            self.stdout.write(f"{'created' if created else 'exists '} {name}")
