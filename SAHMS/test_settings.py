"""Settings for the automated tests: isolated in-memory SQLite only."""
import os

# Must be set before importing the real settings (which require a key).
os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key")
os.environ["MALE_ONLY_HOSTELS"] = ""

from .settings import *  # noqa: E402,F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Let Django create the (normally unmanaged) backend tables in SQLite.
MIGRATION_MODULES = {"backend": None}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"login": "1000/min"}}
