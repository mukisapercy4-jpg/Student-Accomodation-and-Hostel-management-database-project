-- DESIGN ONLY. Review with the DBA; this file is not executed by the app.
-- Assumes the schema documented in live_schema_snapshot.txt.
-- Cancelled bookings are excluded; Pending, Active, and Completed are included.
-- Only Completed payments reduce balance. Outstanding balance never goes below 0.
-- Overpayment remains visible as a separate flag/amount for administrative review.

CREATE OR REPLACE VIEW sahms_outstanding_balance_view AS
SELECT
    b.booking_id,
    b.student_id,
    b.room_id,
    b.status AS booking_status,
    b.agreed_price,
    COALESCE(SUM(CASE WHEN p.payment_status = 'Completed' THEN p.amount ELSE 0 END), 0) AS completed_payments,
    GREATEST(
        b.agreed_price - COALESCE(SUM(CASE WHEN p.payment_status = 'Completed' THEN p.amount ELSE 0 END), 0),
        0
    ) AS outstanding_balance,
    GREATEST(
        COALESCE(SUM(CASE WHEN p.payment_status = 'Completed' THEN p.amount ELSE 0 END), 0) - b.agreed_price,
        0
    ) AS overpaid_by,
    CASE
        WHEN COALESCE(SUM(CASE WHEN p.payment_status = 'Completed' THEN p.amount ELSE 0 END), 0) > b.agreed_price
        THEN 1 ELSE 0
    END AS is_overpaid
FROM booking b
LEFT JOIN payment p ON p.booking_id = b.booking_id
WHERE b.status IN ('Pending', 'Active', 'Completed')
GROUP BY b.booking_id, b.student_id, b.room_id, b.status, b.agreed_price;

-- Do not execute until its totals are compared with backend.services.outstanding_balance()
-- on a staging database containing representative payment statuses and cancelled bookings.
