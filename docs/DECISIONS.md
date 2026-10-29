# SAHMS – Recorded decisions (updated 28 Oct 2026)

Source of truth for the schema: the `SHOW CREATE TABLE` output for the eight tables and
`room_occupancy_view` that you pasted on 27 Oct, saved verbatim in `docs/live_schema_snapshot.txt`.
`backend/tests/test_schema_matches_mysql.py` compares every model column (name, nullability, length) and every
status/priority/method/semester CHECK list against that file. It reads the snapshot, not the live database:
if the live schema changes, paste a fresh export over the snapshot.

| # | Decision | How it is implemented |
|---|----------|-----------------------|
| 1 | Django auth + Groups, DRF auth, role permissions; framework tables in the existing MySQL DB **only if** the eight business tables stay untouched. Document tables + backup/verification first. **No migrations on the live DB without explicit approval.** | `backend/roles.py`, `backend/permissions.py`, token login at `/api/auth/login/`. Nothing has been migrated. See `docs/MIGRATION_PLAN.md`. |
| 2 | Occupancy counts only `Active` bookings | `room_occupancy_view` already does this; dashboard uses the same rule (a test compares both). |
| 3 | No room above capacity among overlapping active bookings; no student with two overlapping active bookings; concurrency-safe | `backend/services.py`: inclusive date overlap, exact peak-occupancy check, `SELECT … FOR UPDATE` on student then room inside `transaction.atomic()`. Applied when a booking is created as, or changed to, `Active`. |
| 4 | Completed payments = `payment_status='Completed'`; **Outstanding Balance** = Σ max(agreed_price − completed, 0) over **Pending, Active and Completed** bookings (Cancelled excluded); pending records shown separately | `services.outstanding_balance()`; dashboard `payments` block. Status values verified against the CHECK constraints (booking: Pending/Active/Completed/Cancelled; payment: Pending/Completed/Failed/Refunded). Pending/Failed/Refunded payments never count as paid. |
| 5 | No permanent deletes of bookings/payments; other deletes only when allowed | No DELETE route for bookings/payments (405). Bookings: `POST /bookings/<id>/cancel/`. Payments: status `Failed` / `Refunded`. Other records: 409 if anything still references them. Django admin is view-only. |
| 6 | **Changed 29 Oct 2026: hostels accept students of every gender.** The earlier male-only rule was removed. | No gender rule exists in the API. `student.gender` (nullable `varchar(10)`, no CHECK) is stored and displayed only; no column was added or changed. |
| 7 | Isolated SQLite tests for the `managed = False` models | `SAHMS/test_settings.py` + `SAHMS/testing.py`; see below. |

## Overpayments (decision 3 of 28 Oct)
* A genuine payment is **never rejected, truncated or modified** because completed payments exceed the agreed price. The record is stored exactly as entered.
* The booking is **flagged for administrative review**: `overpaid_by` and `review_reasons` on every booking, `booking_overpaid_by` on the payment response, and a "Payments needing review" list on the dashboard (count, total overpaid, up to 20 bookings).
* Outstanding Balance still uses a minimum of zero, so overpaid bookings contribute 0, never a negative.
* Resolution uses the existing mechanism only: set the surplus payment's `payment_status` to `Refunded`. No refund field or schema change was added.
* Cancelling a booking that holds completed payments returns `refund_review_required` and the booking stays flagged until the payments are refunded.
* Lowering a booking's agreed price below the completed payments is allowed and flagged the same way.
* Kept as a structural rule (not about the amount): new payments cannot be added to a **Cancelled** booking, nor can a Pending one be completed there.

## Assumptions still open
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

## Update 28 Oct (final pass)
* Removed the duplicate `SAHMS_Dashboard_Design/` folder (old mock dashboard with fixed demo numbers) at the owner's request.
* Frontend write screens added (student, booking, cancel, payment + status change, maintenance, visitor), role-gated from `/api/auth/me/`.
* Payments, maintenance and visitor lists now return readable names (`student_name`, `booking_label`, `room_label`, ...) instead of only IDs.
* `request_date` (maintenance) and `visit_date` (visitors) default to today when omitted, like `payment_date`.
* `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` can be set from `.env`; local defaults are unchanged.
* No new database tables were created. The only tables Django adds are its own login/framework tables via the documented migration; the 8 business tables remain untouched and protected by `SAHMS/db_router.py`.

## Audit trail (added in main7)
* `audittrail` app: `AuditEvent` (create/update/delete: actor, resource, record id, **names** of changed fields, never values), `BookingStatusHistory`, `PaymentStatusHistory`. Read-only API for Admin only: `/api/audit-logs/`, `/api/booking-status-history/`, `/api/payment-status-history/`.
* The audit row is written in the same transaction as the change: if it cannot be saved, the change is rolled back (tests in `backend/tests/test_audit_integrity.py`).
* Design-only files, **not executed**: `docs/OUTSTANDING_BALANCE_VIEW.sql` (a new view; creating it needs your approval and a comparison with `services.outstanding_balance()` first), `docs/INDEX_REVIEW.md` (index candidates on existing tables = schema change, needs your approval), `docs/MYSQL_LEAST_PRIVILEGE.md` (account plan).
