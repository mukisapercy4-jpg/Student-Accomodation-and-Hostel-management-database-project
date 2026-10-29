# MVP update notes (29 Oct 2026)

New endpoints (no schema, model or migration changes):
- GET  /api/rooms/available/?start_date=&end_date=[&hostel=]
- POST /api/bookings/<id>/approve/ | reject/ | reassign/   (reassign body: {"room": id})
- POST /api/payments/momo/  body: booking, amount, network (MTN|Airtel), phone  -- SIMULATED, no gateway call;
  settle with PATCH /api/payments/<id>/ {"payment_status": "Completed"|"Failed"}.
- Rooms now return derived `status` (Available/Occupied/Maintenance) and `available_spaces`.

Assumptions to confirm:
- "Maintenance" = an open High/Urgent maintenance request (services.MAINTENANCE_BLOCKING_PRIORITIES).
- No gender rule added (DECISIONS #6). No STUDENT login role (needs a new link table + migration approval).
- Mobile Money network is encoded in reference_number (MOMO-MTN-..., MOMO-AIRTEL-...); phone numbers are never stored.

Frontend: Tailwind v4 added (theme+utilities only, no preflight). Run `npm install` in frontend/.
Simulate buttons in the MoMo modal show in dev builds or when VITE_MOMO_SIMULATE=true.

## Login (second revision)
- Login/me now return `role` (SUPER_ADMIN | MANAGER | CARETAKER | READ_ONLY) and `home` (/admin|manager|staff/dashboard).
  Auth stays DRF Token (no SimpleJWT, so no JWT claims); STUDENT does not exist (no student login accounts).
- Frontend: components/Login.jsx (full-screen, glass card). No router: the URL is updated, every role opens Dashboard.
- Demo accounts: `python manage.py seed_demo_users` (refuses unless DJANGO_DEBUG=True; password demo-pass-123).
  The "Quick Access" panel exists only in `npm run dev`; it is removed from production builds.

## Third revision: STUDENT role, JWT, student portal (29 Oct 2026)
Supersedes the earlier notes that said "no STUDENT role" and "no SimpleJWT".

Backend
- New app `accounts` (migration `accounts/0001`): `StudentAccount(user, student_id)` links a Django login to a
  student row. It is a plain integer, not a FK, and does not touch the business tables or `sql/01_schema.sql`.
  Run `python manage.py migrate` (creates only `accounts_studentaccount`) and `python manage.py seed_roles` (adds the `Student` group).
- `POST /api/auth/token/` (SimpleJWT): body `{username, password}`; `username` may also be an e-mail or a student reg number.
  Returns `access`, `refresh`, `role` (STUDENT | MANAGER | SUPER_ADMIN | CARETAKER | READ_ONLY), `home`, `permissions`, and `student` for students.
  `role` is also a claim inside the JWT. `POST /api/auth/token/refresh/` renews it. Send `Authorization: Bearer <access>`.
  The old `/api/auth/login/` (DRF Token) still works. Both authentication schemes are accepted.
- Student permissions (backend/roles.py): read hostels and rooms (incl. `rooms/available/`), create bookings, read OWN bookings and
  payments, start a Mobile Money payment for OWN booking. Nothing else; list endpoints are scoped to the student, other people's rows return 404.
- A student's booking is always created as Pending, for their own student record, at the room's price (body values for these are ignored).
- `POST /api/payments/<id>/momo-confirm/ {"outcome": "success"|"failure"}`: simulated gateway callback. Works only while
  `MOMO_SIMULATE` is true (defaults to DJANGO_DEBUG). Writes payment history and an audit entry.
- Security fix: booking actions approve/reject/reassign/cancel now require the *update* permission (previously they rode on *create*).
- Audit-log rows also expose `user_id`, `action_type`, `table_name` (aliases of actor / action / resource) next to `timestamp`.
- Tests: `backend/tests/test_student_role.py` (+ updated demo-user count). 122 tests pass:
  `python manage.py test backend audittrail --settings=SAHMS.test_settings`

Frontend
- `components/Login.jsx` rebuilt: frosted card over a full-screen photo (put yours at `src/assets/login-bg.jpg`), dev-only Quick Access
  bar ([Student Demo] [Manager Demo] [Admin Demo]), remember-me, JWT with automatic refresh (`api.js`).
  Quick Access shows in `npm run dev`, or in a staging build with `VITE_SHOW_DEMO_ACCOUNTS=true`; never in a plain production build.
- `components/StudentDashboard.jsx` (/student/dashboard): dashboard, available rooms by date range, booking request, own bookings,
  own payments, Mobile Money checkout. Mobile: sticky top bar + bottom navigation; grids are `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.
- Role routing: STUDENT opens the student portal; MANAGER / SUPER_ADMIN / staff open the management app (permissions decide the menu).
- Not built, on purpose: "Sign in with Google" and "Student SSO" (no identity provider exists) and "Forgot password" (no e-mail/reset backend).

Demo accounts (DEBUG only): `python manage.py seed_demo_users` creates demo_student (reg DEMO-0001), demo_manager, demo_admin, demo_readonly; password demo-pass-123.
