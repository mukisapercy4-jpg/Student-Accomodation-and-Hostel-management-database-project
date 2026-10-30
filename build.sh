#!/usr/bin/env bash
# exit on error
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --noinput

# Run migrations and setup automatically during deployment
python manage.py migrate --noinput
python manage.py seed_roles

# Create a default superuser if DJANGO_SUPERUSER_PASSWORD is provided, or create demo users
if [ -n "$DJANGO_SUPERUSER_PASSWORD" ] && [ -n "$DJANGO_SUPERUSER_USERNAME" ]; then
    python manage.py createsuperuser --noinput || true
fi
