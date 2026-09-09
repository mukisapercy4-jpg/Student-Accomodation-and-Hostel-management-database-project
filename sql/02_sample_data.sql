-- Sample seed data for demo/testing

INSERT INTO staff (first_name, last_name, role, phone, email) VALUES
('Grace', 'Nakato', 'warden', '0772000001', 'gnakato@example.com'),
('Peter', 'Okello', 'caretaker', '0772000002', 'pokello@example.com'),
('Sarah', 'Namuli', 'admin', '0772000003', 'snamuli@example.com');

INSERT INTO hostel (name, gender_category, address, warden_id) VALUES
('Freedom Hall', 'male', 'Nateete Road, Kampala', 1),
('Unity Hostel', 'female', 'Buddo Trading Centre', 1);

INSERT INTO room (hostel_id, room_number, room_type, capacity, price_per_semester) VALUES
(1, 'A101', 'single', 1, 850000),
(1, 'A102', 'double', 2, 600000),
(2, 'B201', 'single', 1, 850000),
(2, 'B202', 'triple', 3, 450000);

INSERT INTO student (reg_number, first_name, last_name, gender, phone, email, program, year_of_study, national_id) VALUES
('VU-BIT-2607-3114-DAY', 'Mukisa', 'Peace', 'male', '0770000001', 'mukisa@example.com', 'BIT', 2, 'CM00001'),
('VU-BIT-2607-3200-DAY', 'Alice', 'Namono', 'female', '0770000002', 'anamono@example.com', 'BIT', 2, 'CM00002');

INSERT INTO booking (student_id, room_id, academic_year, semester, check_in_date, status) VALUES
(1, 1, '2025/2026', 1, '2026-08-01', 'active'),
(2, 3, '2025/2026', 1, '2026-08-02', 'active');

INSERT INTO payment (booking_id, amount, payment_date, payment_method, receipt_number, status) VALUES
(1, 850000, '2026-08-01', 'mobile_money', 'RC-0001', 'paid'),
(2, 425000, '2026-08-02', 'cash', 'RC-0002', 'partial');

INSERT INTO maintenance_request (room_id, student_id, staff_id, description, date_reported, status) VALUES
(1, 1, 2, 'Broken window latch', '2026-08-10', 'open');

INSERT INTO visitor (student_id, visitor_name, national_id, visit_date, time_in, purpose) VALUES
(1, 'Joseph Mukisa', 'CM99999', '2026-08-15', '14:00', 'Family visit');
