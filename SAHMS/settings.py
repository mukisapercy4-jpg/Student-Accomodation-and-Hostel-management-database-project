from pathlib import Path
import os
import urllib.parse
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

def _env_list(name, default):
    raw = os.getenv(name, "")
    return [x.strip() for x in raw.split(",") if x.strip()] or default


# Comma-separated in .env for deployment, e.g. ALLOWED_HOSTS=hostel.example.com
ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS", ["127.0.0.1", "localhost", ".onrender.com", ".vercel.app"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",

    # Existing SAHMS application
    "backend",
    "audittrail",
    "accounts",

    # REST API and CORS support
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
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

# ---------------------------------------------------------------------------
# Database configuration: supports local MySQL, cloud URLs, and cloud providers
# ---------------------------------------------------------------------------
db_url = os.getenv("DATABASE_URL") or os.getenv("MYSQL_URL")
if db_url:
    parsed = urllib.parse.urlparse(db_url)
    db_name = parsed.path.lstrip("/")
    db_user = urllib.parse.unquote(parsed.username or "")
    db_password = urllib.parse.unquote(parsed.password or "")
    db_host = parsed.hostname or "127.0.0.1"
    db_port = str(parsed.port or 3306)
else:
    db_name = os.getenv("DB_NAME") or os.getenv("MYSQLDATABASE") or os.getenv("TIDB_DATABASE") or "student_accommodation"
    db_user = os.getenv("DB_USER") or os.getenv("MYSQLUSER") or os.getenv("TIDB_USER") or "root"
    db_password = os.getenv("DB_PASSWORD") or os.getenv("MYSQLPASSWORD") or os.getenv("TIDB_PASSWORD") or ""
    db_host = os.getenv("DB_HOST") or os.getenv("MYSQLHOST") or os.getenv("TIDB_HOST") or "127.0.0.1"
    db_port = os.getenv("DB_PORT") or os.getenv("MYSQLPORT") or os.getenv("TIDB_PORT") or "3306"

db_options = {"charset": "utf8mb4"}
# Enable SSL mode if requested (required for TiDB Cloud / Aiven)
if os.getenv("DB_SSL", "").strip().lower() in ("true", "1", "yes", "required"):
    db_options["ssl"] = {"ssl_mode": "REQUIRED"}

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": db_name,
        "USER": db_user,
        "PASSWORD": db_password,
        "HOST": db_host,
        "PORT": db_port,
        "OPTIONS": db_options,
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
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# React (Vite) frontend allowed origins
# Comma-separated in .env for deployment, e.g. CORS_ALLOWED_ORIGINS=https://sahms.vercel.app
CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS", [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
])

# In local development (DEBUG) allow any localhost port. In production, allow *.vercel.app if configured
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://(localhost|127\.0\.0\.1):\d+$"]
elif _env_bool("CORS_ALLOW_ALL_VERCEL", True):
    CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://.*\.vercel\.app$"]

# ---------------------------------------------------------------------------
# REST framework: token authentication + role-based permissions
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
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

from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Mobile Money has no real gateway behind it. The confirm endpoint that settles a
# simulated payment on behalf of a student only works while this is True.
MOMO_SIMULATE = os.environ.get("MOMO_SIMULATE", str(DEBUG)).lower() == "true"

# ---------------------------------------------------------------------------
# Business configuration
# ---------------------------------------------------------------------------
# Hostels accept students of every gender; there is no gender rule.

# Django may never create/alter/drop the eight business tables (see db_router.py).
DATABASE_ROUTERS = ["SAHMS.db_router.ProtectBusinessTablesRouter"]

# Safety guard: `manage.py test` refuses to run against anything but SQLite.
TEST_RUNNER = "SAHMS.testing.SQLiteOnlyTestRunner"
