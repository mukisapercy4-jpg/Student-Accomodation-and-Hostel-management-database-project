-- Demonstration queries for the report

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

-- Full payment history for a given student (e.g. student_id = 1)
SELECT b.academic_year, b.semester, p.amount, p.payment_date, p.status
FROM payment p
JOIN booking b ON b.booking_id = p.booking_id
WHERE b.student_id = 1
ORDER BY p.payment_date;

-- Maintenance workload per staff member
SELECT s.first_name, s.last_name, COUNT(m.request_id) AS assigned_requests
FROM staff s
LEFT JOIN maintenance_request m ON m.staff_id = s.staff_id
GROUP BY s.staff_id, s.first_name, s.last_name
ORDER BY assigned_requests DESC;

-- Outstanding balance per booking (expected price vs amount paid so far)
SELECT b.booking_id, s.first_name, s.last_name, r.price_per_semester,
       COALESCE(SUM(p.amount), 0) AS paid_so_far,
       r.price_per_semester - COALESCE(SUM(p.amount), 0) AS balance
FROM booking b
JOIN student s ON s.student_id = b.student_id
JOIN room r ON r.room_id = b.room_id
LEFT JOIN payment p ON p.booking_id = b.booking_id
GROUP BY b.booking_id, s.first_name, s.last_name, r.price_per_semester;
