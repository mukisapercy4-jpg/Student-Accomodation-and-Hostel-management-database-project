# Student Accommodation and Hostel Management System — Database Design

## 1. Scope

Covers: students, hostels, rooms, room bookings/allocations, payments, staff (wardens/admins/caretakers), maintenance requests, and a visitor log.

## 2. Entities and Attributes

**Student**
- student_id (PK)
- reg_number (unique)
- first_name, last_name
- gender
- phone
- email (unique)
- program
- year_of_study
- national_id (unique)

**Hostel**
- hostel_id (PK)
- name
- gender_category (male / female / mixed)
- address
- warden_id (FK → Staff)

**Staff**
- staff_id (PK)
- first_name, last_name
- role (warden / admin / caretaker)
- phone
- email (unique)

**Room**
- room_id (PK)
- hostel_id (FK → Hostel)
- room_number
- room_type (single / double / triple)
- capacity
- price_per_semester
- (unique constraint on hostel_id + room_number, since numbering repeats per hostel)

**Booking**
- booking_id (PK)
- student_id (FK → Student)
- room_id (FK → Room)
- academic_year (e.g. 2025/2026)
- semester (1 / 2)
- check_in_date
- check_out_date (nullable — filled when student leaves)
- status (active / completed / cancelled)

**Payment**
- payment_id (PK)
- booking_id (FK → Booking)
- amount
- payment_date
- payment_method (cash / mobile money / bank)
- receipt_number (unique)
- status (paid / partial / pending)

**MaintenanceRequest**
- request_id (PK)
- room_id (FK → Room)
- student_id (FK → Student, who reported it)
- staff_id (FK → Staff, nullable — who it's assigned to)
- description
- date_reported
- date_resolved (nullable)
- status (open / in_progress / resolved)

**Visitor**
- visitor_id (PK)
- student_id (FK → Student, who they're visiting)
- visitor_name
- national_id
- visit_date
- time_in
- time_out (nullable)
- purpose

## 3. Relationships and Cardinality

- Hostel (1) — (M) Room: a hostel has many rooms, each room belongs to one hostel.
- Staff (1) — (0..1) Hostel: a staff member can be warden of one hostel at a time (Hostel.warden_id is the FK, so this is really Hostel M:1 Staff, restricted to role='warden' by a CHECK or app logic).
- Student (1) — (M) Booking: a student can have many bookings over different semesters.
- Room (1) — (M) Booking: a room is booked many times over its life, but only one *active* booking at a time (enforced with a partial unique index, see §5).
- Booking (1) — (M) Payment: a booking can be paid in installments.
- Room (1) — (M) MaintenanceRequest
- Student (1) — (M) MaintenanceRequest (as reporter)
- Staff (1) — (M) MaintenanceRequest (as assignee, nullable)
- Student (1) — (M) Visitor

Booking is the resolved M:N between Student and Room (a student can occupy many rooms over time; a room houses many students over time, never concurrently under normal rules).

## 4. Normalization Notes

- **1NF**: every attribute is atomic (e.g. names split into first_name/last_name rather than one field; no repeating groups like "payment1, payment2" — those live in their own Payment table instead).
- **2NF**: all non-key attributes depend on the *whole* primary key. No composite keys with partial dependency exist here since every table uses a single surrogate PK (id) — this is largely automatic with surrogate keys, but worth stating explicitly in your report.
- **3NF**: no transitive dependencies. E.g. Room does not store hostel_name or hostel_address directly — only hostel_id, and you join to Hostel for those. Booking does not store student_name or room_price directly — only the FKs.

## 5. PostgreSQL DDL

```sql
CREATE TYPE gender_type AS ENUM ('male', 'female', 'mixed');
CREATE TYPE room_type_enum AS ENUM ('single', 'double', 'triple');
CREATE TYPE staff_role AS ENUM ('warden', 'admin', 'caretaker');
CREATE TYPE booking_status AS ENUM ('active', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('paid', 'partial', 'pending');
CREATE TYPE payment_method_enum AS ENUM ('cash', 'mobile_money', 'bank');
CREATE TYPE request_status AS ENUM ('open', 'in_progress', 'resolved');

CREATE TABLE staff (
    staff_id     SERIAL PRIMARY KEY,
    first_name   VARCHAR(50) NOT NULL,
    last_name    VARCHAR(50) NOT NULL,
    role         staff_role NOT NULL,
    phone        VARCHAR(20),
    email        VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE hostel (
    hostel_id       SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    gender_category gender_type NOT NULL,
    address         VARCHAR(150),
    warden_id       INT REFERENCES staff(staff_id)
);

CREATE TABLE student (
    student_id     SERIAL PRIMARY KEY,
    reg_number     VARCHAR(30) UNIQUE NOT NULL,
    first_name     VARCHAR(50) NOT NULL,
    last_name      VARCHAR(50) NOT NULL,
    gender         VARCHAR(10),
    phone          VARCHAR(20),
    email          VARCHAR(100) UNIQUE NOT NULL,
    program        VARCHAR(100),
    year_of_study  INT CHECK (year_of_study BETWEEN 1 AND 6),
    national_id    VARCHAR(30) UNIQUE
);

CREATE TABLE room (
    room_id            SERIAL PRIMARY KEY,
    hostel_id          INT NOT NULL REFERENCES hostel(hostel_id),
    room_number        VARCHAR(10) NOT NULL,
    room_type          room_type_enum NOT NULL,
    capacity           INT NOT NULL CHECK (capacity > 0),
    price_per_semester NUMERIC(10,2) NOT NULL CHECK (price_per_semester >= 0),
    UNIQUE (hostel_id, room_number)
);

CREATE TABLE booking (
    booking_id     SERIAL PRIMARY KEY,
    student_id     INT NOT NULL REFERENCES student(student_id),
    room_id        INT NOT NULL REFERENCES room(room_id),
    academic_year  VARCHAR(9) NOT NULL,     -- e.g. '2025/2026'
    semester       INT NOT NULL CHECK (semester IN (1,2)),
    check_in_date  DATE NOT NULL,
    check_out_date DATE,
    status         booking_status NOT NULL DEFAULT 'active',
    CHECK (check_out_date IS NULL OR check_out_date >= check_in_date)
);

-- Only one ACTIVE booking allowed per room at a time
CREATE UNIQUE INDEX one_active_booking_per_room
    ON booking (room_id)
    WHERE status = 'active';

CREATE TABLE payment (
    payment_id      SERIAL PRIMARY KEY,
    booking_id      INT NOT NULL REFERENCES booking(booking_id),
    amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method  payment_method_enum NOT NULL,
    receipt_number  VARCHAR(30) UNIQUE NOT NULL,
    status          payment_status NOT NULL DEFAULT 'pending'
);

CREATE TABLE maintenance_request (
    request_id     SERIAL PRIMARY KEY,
    room_id        INT NOT NULL REFERENCES room(room_id),
    student_id     INT NOT NULL REFERENCES student(student_id),
    staff_id       INT REFERENCES staff(staff_id),
    description    TEXT NOT NULL,
    date_reported  DATE NOT NULL DEFAULT CURRENT_DATE,
    date_resolved  DATE,
    status         request_status NOT NULL DEFAULT 'open'
);

CREATE TABLE visitor (
    visitor_id   SERIAL PRIMARY KEY,
    student_id   INT NOT NULL REFERENCES student(student_id),
    visitor_name VARCHAR(100) NOT NULL,
    national_id  VARCHAR(30),
    visit_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    time_in      TIME NOT NULL,
    time_out     TIME,
    purpose      VARCHAR(150)
);
```

## 6. Sample Queries (for the report's demonstration section)

```sql
-- All students currently occupying rooms, with hostel and room info
SELECT s.first_name, s.last_name, h.name AS hostel, r.room_number
FROM booking b
JOIN student s ON s.student_id = b.student_id
JOIN room r ON r.room_id = b.room_id
JOIN hostel h ON h.hostel_id = r.hostel_id
WHERE b.status = 'active';

-- Total payments received per hostel
SELECT h.name, SUM(p.amount) AS total_collected
FROM payment p
JOIN booking b ON b.booking_id = p.booking_id
JOIN room r ON r.room_id = b.room_id
JOIN hostel h ON h.hostel_id = r.hostel_id
GROUP BY h.name;

-- Open maintenance requests older than 7 days
SELECT r.room_number, m.description, m.date_reported
FROM maintenance_request m
JOIN room r ON r.room_id = m.room_id
WHERE m.status = 'open'
  AND m.date_reported < CURRENT_DATE - INTERVAL '7 days';

-- Vacant rooms right now (no active booking)
SELECT r.room_id, r.room_number, h.name AS hostel
FROM room r
JOIN hostel h ON h.hostel_id = r.hostel_id
LEFT JOIN booking b ON b.room_id = r.room_id AND b.status = 'active'
WHERE b.booking_id IS NULL;
```

## 7. Next Steps

- Draw the ER diagram (crow's foot notation) from §2–3 — this file gives you everything needed to do it in draw.io, Lucidchart, or dbdiagram.io.
- Populate with 5–10 rows of sample data per table for the report's demo section.
- Add a short write-up per table justifying 1NF/2NF/3NF (§4 gives the bones of this).
