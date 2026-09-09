-- Student Accommodation and Hostel Management System
-- Schema (PostgreSQL)

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
