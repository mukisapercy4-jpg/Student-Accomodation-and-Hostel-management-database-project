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
