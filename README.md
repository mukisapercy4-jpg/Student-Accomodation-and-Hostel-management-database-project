# SAHMS: Student Accommodation and Hostel Management System

Database course project. Django REST backend on the existing MySQL schema, React (Vite) frontend.
Hostels accommodate male students only (project requirement, enforced in the API).

## Layout
```
backend/    Django app: models (the 8 existing tables, managed=False), API, roles, business rules, tests
SAHMS/      Django project settings, DB guard router, SQLite-only test runner
frontend/   React app: login, dashboard, module tables, create/edit/cancel forms
docs/       DECISIONS.md, MIGRATION_PLAN.md, INTEGRATION.md, ER design, normalization, live schema snapshot
sql/        Early PostgreSQL draft (obsolete; the live MySQL schema is the source of truth)
```

## Run it (Windows, project folder)
1. `python -m venv .venv` then `.venv\Scripts\activate`, then `pip install -r requirements.txt`
   (if `mysqlclient` fails, use PyMySQL).
2. Copy `.env.example` to `.env` and fill in `DB_*`, `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=True`.
3. `python manage.py test --settings=SAHMS.test_settings` (isolated in-memory SQLite, never touches MySQL).
4. Back up the database, then follow `docs/MIGRATION_PLAN.md`. This creates only Django's own login tables
   and never touches the 8 business tables (the router in `SAHMS/db_router.py` forbids it).
5. `python manage.py seed_roles`, `python manage.py createsuperuser`, `python manage.py check_student_gender`.
6. `python manage.py runserver`; in `frontend/`: copy `.env.example` to `.env`, `npm install`, `npm run dev`,
   open http://localhost:5173.

## Configuration (nothing is hardcoded in code)
| Where | Setting | Purpose |
|-------|---------|---------|
| `.env` | `DB_NAME/USER/PASSWORD/HOST/PORT` | MySQL connection |
| `.env` | `DJANGO_SECRET_KEY`, `DJANGO_DEBUG` | Django security |
| `.env` | `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | Deployment (comma-separated); local defaults built in |
| `.env` | `MALE_ONLY_ENFORCED` | Male-only booking rule (default True) |
| `frontend/.env` | `VITE_API_BASE_URL` | API address (default http://127.0.0.1:8000/api) |

## Roles
Admin, Warden, Caretaker and ReadOnly (Django Groups). The UI reads `/api/auth/me/` and shows only the
buttons the signed-in role may use; the API enforces the same matrix (`backend/roles.py`).

## What the frontend can do
Dashboard (occupancy, outstanding balance, pending payments, payments needing review) and tables with search,
paging, details drawer and CSV export for Students, Hostels, Rooms, Bookings, Payments, Maintenance, Visitors, Staff.
Forms: create/edit student, create booking, cancel booking, record payment, mark payment Completed/Failed/Refunded,
create/edit maintenance request, log/edit visitor. Server validation messages (capacity, overlap, male-only, status
rules) are shown in the form. Bookings and payments are never deleted.

## Not yet verified
MySQL row locks, MySQL CHECK constraints and the MySQL branch of `schema_fingerprint` have only been checked on
SQLite. Check them on a scratch MySQL database before relying on them. Rules and decisions: `docs/DECISIONS.md`.

## Team
- Mukisa (add teammates here)
