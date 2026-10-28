from django.conf import settings
from django.db import connection
from django.test import TestCase

from backend.models import Student


class IsolationTests(TestCase):
    def test_runs_on_in_memory_sqlite_only(self):
        self.assertEqual(connection.vendor, "sqlite")
        self.assertIn("memory", settings.DATABASES["default"]["NAME"])
        self.assertNotIn("mysql", settings.DATABASES["default"]["ENGINE"])

    def test_tables_start_empty_and_are_test_only(self):
        self.assertEqual(Student.objects.count(), 0)

    def test_unmanaged_models_are_managed_only_during_tests(self):
        self.assertTrue(Student._meta.managed)  # switched on by the test runner
