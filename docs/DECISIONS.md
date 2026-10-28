# SAHMS – Recorded decisions (27 Oct 2026)

Source of truth for the schema: the `SHOW CREATE TABLE` output for the eight tables and
`room_occupancy_view` pasted in the earlier chat. The Django models match it column for column.

| # | Decision | How it is implemented |
|---|----------|-----------------------|
| 1 | Django auth + Groups, DRF auth, role permissions; framework tables in the existing MySQL DB **only if** the eight business tables stay untouched. Document tables + backup/verification first. **No migrations on the live DB without explicit approval.** | `backend/roles.py`, `backend/permissions.py`, token login at `/api/auth/login/`. Nothing has been migrated. See `docs/MIGRATION_PLAN.md`. |
| 2 | Occupancy counts only `Active` bookings | `room_occupancy_view` already does this; dashboard uses the same rule (a test compares both). |
| 3 | No room above capacity among overlapping active bookings; no student with two overlapping active bookings; concurrency-safe | `backend/services.py`: inclusive date overlap, exact peak-occupancy check, `SELECT … FOR UPDATE` on student then room inside `transaction.atomic()`. Applied when a booking is created as, or changed to, `Active`. |
| 4 | Completed payments = `payment_status='Completed'`; **Outstanding Balance** = Σ max(agreed_price − completed, 0); pending records shown separately; overpayments are preserved and flagged | `services.outstanding_balance()` and `services.overpayment_summary()`; dashboard `payments` block. Cancelled bookings are excluded. Pending/Failed/Refunded never count as paid. |
| 5 | No permanent deletes of bookings/payments; other deletes only when allowed | No DELETE route for bookings/payments (405). Bookings: `POST /bookings/<id>/cancel/`. Payments: status `Failed` / `Refunded`. Other records: 409 if anything still references them. Django admin is view-only. |
| 6 | Male-only hostels: no invented column | `student.gender` exists (nullable varchar(10)); `hostel` has nothing marking it male-only. Rule is OFF by default; it can be switched on per hostel name with `MALE_ONLY_HOSTELS=` in `.env` (no schema change). **Needs your answer**: which hostels, and what values does `gender` hold? |
| 7 | Isolated SQLite tests for the `managed = False` models | `SAHMS/test_settings.py` + `SAHMS/testing.py`; see below. |

## Assumptions to confirm
* Outstanding Balance covers Pending, Active and Completed bookings (Cancelled excluded).
* Genuine completed payments are preserved even when their cumulative amount exceeds the agreed price. Outstanding balance is floored at zero; excess amounts and the count of affected bookings are surfaced on the dashboard for administrative review. No automatic refund or payment mutation is performed.
* `national_id` is visible/writable by Admin only.
* Pending bookings are not limited by capacity or overlap; only Active ones are.
* The view (and the dashboard) count every `Active` booking regardless of dates, so an old booking never moved to Completed still occupies a space.

## Roles
| Role | Can do |
|------|--------|
| Admin (or superuser) | everything the API allows, incl. guarded deletes |
| Warden | read all; create/update students, bookings, payments, maintenance, visitors |
| Caretaker | read hostels/rooms/students/bookings; create/update maintenance and visitors; no payments |
| ReadOnly | read everything |

## Test setup (decision 7)
* Run: `python manage.py test --settings=SAHMS.test_settings`
* `test_settings.py` replaces `DATABASES` with in-memory SQLite and sets `MIGRATION_MODULES={"backend": None}` so Django creates the backend tables there.
* `testing.SQLiteOnlyTestRunner` switches the unmanaged models to managed **only inside the test process** and **refuses to run** if the database is not SQLite (so `manage.py test` can never create or touch a MySQL test database). Production settings and models are unchanged.
* `tests/test_isolation.py` asserts the engine is in-memory SQLite. All data is created by the tests.
* Limits: SQLite does not enforce the MySQL CHECK constraints (the API validators repeat them) and ignores row locks, so `test_bookings.LockingTests` only proves the locks are requested; real lock behaviour needs a MySQL concurrency check on a scratch database.
