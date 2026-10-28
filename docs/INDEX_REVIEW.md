# Index review and performance plan

This is a review plan, not a live-schema change. Existing business-table indexes were read from `docs/live_schema_snapshot.txt`; no `ALTER TABLE` or index DDL was executed.

## Existing schema observations

- `booking`: indexes on `student_id` and `room_id`; frequent filters also include `status`, `academic_year`, and `semester`.
- `payment`: index on `booking_id`; dashboards aggregate `amount` for `payment_status='Completed'`.
- `maintenance_request`: indexes cover `room_id`, `reported_by_student`, and `assigned_to`.
- `visitor`: index on `booking_id`.
- `student`: `last_name` index plus unique indexes on registration number, email, and national ID.
- `room`: unique `(hostel_id, room_number)` index.

## Proposed review candidates (do not apply without EXPLAIN and DBA approval)

1. Consider `booking(status, room_id, start_date, end_date)` for active occupancy/overlap queries.
2. Consider `booking(status, student_id, start_date, end_date)` for per-student overlap checks.
3. Consider `payment(payment_status, booking_id)` for completed-payment totals grouped by booking.
4. Review `maintenance_request(status, priority)` only if real query plans show it helps.

These may add write overhead and overlap with existing indexes. Capture `EXPLAIN` plans and representative row counts first, then compare before/after on a staging copy. Existing business-table indexes are not changed by this project patch.

## New application-owned tables

The migration adds indexes on audit timestamps, audit resource/entity, audit actor/timestamp, and each status-history entity/timestamp pair. These indexes apply only to the new audit/history tables.
