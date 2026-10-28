from pathlib import Path
import os
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load database credentials from the .env file in the project root.
load_dotenv(BASE_DIR / ".env")

def _env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# DEBUG is off unless explicitly enabled in .env (DJANGO_DEBUG=True).
DEBUG = _env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "django-insecure-local-development-key-change-before-deployment"
    else:
        from django.core.exceptions import ImproperlyConfigured

        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY is not set. Add it to .env "
            "(for local development you may instead set DJANGO_DEBUG=True)."
        )

ALLOWED_HOSTS = ["127.0.0.1", "localhost"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Existing SAHMS application
    "backend",

    # REST API and CORS support
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
]



MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",

    # Allow requests from the React frontend
    "corsheaders.middleware.CorsMiddleware",

    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


ROOT_URLCONF = "SAHMS.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "SAHMS.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("DB_NAME", "student_accommodation"),
        "USER": os.getenv("DB_USER", "root"),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", "127.0.0.1"),
        "PORT": os.getenv("DB_PORT", "3306"),
        "OPTIONS": {
            "charset": "utf8mb4",
        },
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Africa/Kampala"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"



# React (Vite) dev server is allowed to call the API
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
# Vite moves to 5174, 5175... when 5173 is busy; that silently breaks the app
# with a CORS error. In local development (DEBUG) allow any localhost port.
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://(localhost|127\.0\.0\.1):\d+$"]

# ---------------------------------------------------------------------------
# REST framework: token authentication + role-based permissions
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "backend.permissions.RolePermission",
    ],
    "DEFAULT_PAGINATION_CLASS": "backend.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "EXCEPTION_HANDLER": "backend.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {"login": "10/min"},
}

# ---------------------------------------------------------------------------
# Business configuration
# ---------------------------------------------------------------------------
# Project requirement: every hostel accommodates male students only.
# student.gender is free text in MySQL, so the rule is enforced in the API
# (accepted values: "Male" / "M", case-insensitive; empty is rejected).
# Set MALE_ONLY_ENFORCED=False in .env only to switch it off deliberately.
MALE_ONLY_ENFORCED = _env_bool("MALE_ONLY_ENFORCED", True)

# Django may never create/alter/drop the eight business tables (see db_router.py).
DATABASE_ROUTERS = ["SAHMS.db_router.ProtectBusinessTablesRouter"]

# Safety guard: `manage.py test` refuses to run against anything but SQLite.
TEST_RUNNER = "SAHMS.testing.SQLiteOnlyTestRunner"
