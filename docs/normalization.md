# Normalization — Student Accommodation and Hostel Management System

This document justifies why every table in the schema (`sql/01_schema.sql`)
satisfies 1NF, 2NF, and 3NF, and shows what would go wrong if we hadn't
normalized it this way.

## 1NF — Atomic values, no repeating groups

A table is in 1NF if every column holds a single, indivisible value and
there are no repeating groups of columns.

- **Student**: `first_name` and `last_name` are stored separately rather
  than as one `full_name` field — this keeps each column atomic and makes
  sorting/searching by surname possible without string parsing.
- **Booking / Payment**: instead of a `Student` table with repeating
  columns like `payment1_amount, payment2_amount, payment3_amount...`
  (which would break the moment a student pays a 4th installment), payments
  live in their own `Payment` table, one row per payment, linked back to
  `Booking` by `booking_id`. Same logic applies to `Booking` itself — a
  student's stay history is one row per booking, not repeating columns on
  `Student`.
- **Maintenance requests and visitors**: same pattern — one row per event,
  not repeating columns bolted onto `Student` or `Room`.

Every table in the schema is in 1NF.

## 2NF — No partial dependency on the key

A table is in 2NF if it's in 1NF and every non-key attribute depends on the
*whole* primary key, not part of it. This only matters for tables with a
**composite** primary key; tables with a single-column surrogate key
(`student_id`, `room_id`, etc.) automatically satisfy 2NF because there's
no "part of the key" to depend on.

Every table in this schema uses a single-column surrogate primary key
(`SERIAL PRIMARY KEY`), so 2NF is satisfied by construction. This is a
deliberate design choice: it avoids composite-key tables where non-key
attributes might depend on only one part of the key.

**Illustrative counter-example** (what 2NF violation would look like): if
`Booking` used `(student_id, room_id)` as a composite key and stored
`room_price` directly on the booking row, `room_price` would depend only
on `room_id` (part of the key), not on the whole `(student_id, room_id)`
pair — a 2NF violation. Our schema avoids this by giving `Booking` its own
`booking_id` and looking up price via `room_id → Room.price_per_semester`
instead of duplicating it.

## 3NF — No transitive dependency

A table is in 3NF if it's in 2NF and no non-key attribute depends on
another non-key attribute (i.e. nothing depends on something that isn't
the key).

- **Room** does not store `hostel_name` or `hostel_address` — only
  `hostel_id`. If it stored `hostel_name` directly, that name would depend
  on `hostel_id` (a non-key attribute of Room), not on `room_id` — a
  transitive dependency. Instead, `hostel_name` is fetched by joining to
  `Hostel`.
- **Booking** does not store `student_name` or `room_price` — only the
  foreign keys `student_id` and `room_id`. Storing the student's name on
  every booking row would mean that name is repeated across all their
  bookings and could go stale if the student's name is corrected in one
  place but not the other — a classic update anomaly caused by a
  transitive dependency.
- **Payment** does not store `student_email` or `hostel_name` — only
  `booking_id`, from which both can be derived via joins.
- **MaintenanceRequest** does not duplicate `room_type` or `hostel_id`
  from `Room` — only `room_id`.

Every table in this schema is in 3NF.

## What normalization buys us here

- **No update anomalies**: correcting a student's phone number happens in
  exactly one row (`Student`), not in every `Booking`/`Payment`/`Visitor`
  row that mentions them.
- **No insertion anomalies**: a new room can be added to `Room` without
  needing a booking to exist first (and vice versa) — the tables are
  independent until explicitly linked by a foreign key.
- **No deletion anomalies**: cancelling a booking doesn't delete the
  student's or room's own data, because that data isn't duplicated inside
  the booking row.
- **Smaller storage footprint**: names, addresses, and prices are stored
  once and referenced by ID everywhere else, rather than repeated across
  every related row.

The trade-off is that reading combined information (e.g. "show me student
name + hostel name + amount paid") requires `JOIN`s across tables — which
is exactly what `sql/03_queries.sql` demonstrates.
