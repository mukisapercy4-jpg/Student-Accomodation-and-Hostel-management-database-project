# Applying the update to your local repository

Repository folder: `C:\Users\SAINT\Documents\GitHub\Student-Accomodation-and-Hostel-management-database-project` (branch `Mukisa-`).

Nothing here touches `.env`, `.git`, `sql/`, `docs/ER_*`, `docs/normalization.md` or your database.

## Option A – overlay zip (`SAHMS_overlay_changes_only.zip`)
1. Commit or stash your current work first (`git status` should be clean) so you can review the diff.
2. Extract the overlay into the repository folder, choosing "replace" when asked. It contains only new and changed files.
3. Delete the empty stub `backend/tests.py`. It cannot coexist with the new `backend/tests/` package.
4. `git status` / `git diff` to review. Nothing is committed for you.

## Option B – full zip (`SAHMS_Integrated.zip`)
Extract to a new folder and compare with your repo (for example in VS Code: *Compare Folders*), or copy over as in Option A.

## New files
`.env.example`, `requirements.txt`, `SAHMS/db_router.py`, `SAHMS/test_settings.py`, `SAHMS/testing.py`, `backend/{exceptions,pagination,permissions,roles,services}.py`, `backend/management/commands/*`, `backend/tests/*`, `docs/{DECISIONS,MIGRATION_PLAN,INTEGRATION,live_schema_snapshot}`, `frontend/src/api.js`.

## Changed files
`README.md`, `SAHMS/settings.py`, `backend/{admin,models,serializers,urls,views}.py`, `frontend/.env.example`, `frontend/src/{App.jsx,App.css}`.

## Then, in order (Command Prompt, project folder, venv active)
1. `pip install -r requirements.txt` (if mysqlclient fails, use PyMySQL as before).
2. `.env`: add `DJANGO_SECRET_KEY=<long random string>` and `DJANGO_DEBUG=True` (see `.env.example`).
3. `python manage.py test --settings=SAHMS.test_settings` – must pass; it never touches MySQL.
4. Backup, then the numbered steps in `docs/MIGRATION_PLAN.md` (fingerprint before → `migrate` → fingerprint after must say OK).
5. `python manage.py seed_roles`, `python manage.py createsuperuser`.
6. `python manage.py check_student_gender` (read-only) to see real gender values.
7. `python manage.py runserver`, and in `frontend/`: `npm install`, `npm run dev`; sign in at http://localhost:5173.

## About the `...-main4.zip` branch (ChatGPT era)
That snapshot is an older branch: SQLite, no API, and models that differ from your live MySQL (for example a `hostel.gender_category` column and fixed `Male/Female` choices that do not exist in your database). It was **not** merged. Its React screens never connected because they called the API without logging in and without a way to explain failures. This update fixes that:
* login with a token (`frontend/src/api.js`), and a clear message that says whether Django is down, the address is wrong, or CORS blocked the page (`/api/health/` is used to tell them apart);
* in local development (`DJANGO_DEBUG=True`) Django accepts the React app on any localhost port, so Vite moving to 5174/5175 no longer breaks it;
* every module (Students, Hostels, Rooms, Bookings, Payments, Maintenance, Visitors, Staff) has search, paging, Refresh/Retry, a record-details drawer (eye icon) and Export CSV of all matching records.
