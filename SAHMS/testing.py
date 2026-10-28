"""Test runner for the SAHMS project.

The eight business models are ``managed = False`` and map to tables that
already exist in the live MySQL database. Two safeguards keep tests away
from it:

1. The runner refuses to run unless the default database is SQLite
   (use ``--settings=SAHMS.test_settings``).
2. Only inside the test process, the unmanaged models are switched to
   managed so Django creates their tables in the throw-away SQLite database.
   Nothing here is imported by the production server.
"""
from django.apps import apps
from django.conf import settings
from django.core.management.base import CommandError
from django.test.runner import DiscoverRunner


class SQLiteOnlyTestRunner(DiscoverRunner):
    def setup_databases(self, **kwargs):
        db = settings.DATABASES["default"]
        if db["ENGINE"] != "django.db.backends.sqlite3":
            raise CommandError(
                "Refusing to run tests against %r. Run: "
                "python manage.py test --settings=SAHMS.test_settings"
                % db["ENGINE"]
            )
        self._switched = []
        for model in apps.get_models():
            if not model._meta.managed and model._meta.app_label == "backend":
                model._meta.managed = True
                self._switched.append(model)
        return super().setup_databases(**kwargs)

    def teardown_databases(self, old_config, **kwargs):
        super().teardown_databases(old_config, **kwargs)
        for model in getattr(self, "_switched", []):
            model._meta.managed = False
