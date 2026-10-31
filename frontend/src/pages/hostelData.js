import { useMemo } from 'react';
import { todayIso, useRows } from '../ui.jsx';

const OPEN = ['Pending', 'In Progress'];

/**
 * Everything the warden and caretaker screens show about ONE hostel, loaded from the live API
 * (all lists are filtered server-side with ?hostel=). Numbers are derived from those rows only.
 */
export function useHostelData(hostelId, withPayments = true) {
  const on = !!hostelId;
  const today = todayIso();
  const rooms = useRows('rooms', { hostel: hostelId }, on);
  const bookings = useRows('bookings', { hostel: hostelId }, on);
  const maint = useRows('maintenance', { hostel: hostelId }, on);
  const visitors = useRows('visitors', { hostel: hostelId, visit_date: today }, on);
  const payments = useRows('payments', { hostel: hostelId }, on && withPayments); // caretakers have no payments access

  const d = useMemo(() => {
    const capacity = rooms.rows.reduce((t, r) => t + r.capacity, 0);
    const occupied = rooms.rows.reduce((t, r) => t + (r.occupied_spaces || 0), 0);
    const active = bookings.rows.filter((b) => b.status === 'Active');
    const residents = new Map();
    active.forEach((b) => residents.set(b.room, [...(residents.get(b.room) || []), b.student_name]));
    const groups = {};
    rooms.rows.forEach((r) => {
      const g = (groups[r.capacity] ||= { capacity: r.capacity, rooms: 0, beds: 0, occupied: 0 });
      g.rooms += 1; g.beds += r.capacity; g.occupied += r.occupied_spaces || 0;
    });
    return {
      capacity, occupied, free: Math.max(capacity - occupied, 0), rate: capacity ? Math.round((occupied * 1000) / capacity) / 10 : 0,
      active, pending: bookings.rows.filter((b) => b.status === 'Pending'),
      openMaint: maint.rows.filter((m) => OPEN.includes(m.status)),
      onPremise: visitors.rows.filter((v) => !v.check_out_time),
      residents, groups: Object.values(groups).sort((a, b) => a.capacity - b.capacity),
    };
  }, [rooms.rows, bookings.rows, maint.rows, visitors.rows]);

  const parts = { rooms, bookings, maint, visitors, payments };
  const list = Object.values(parts);
  return {
    ...parts, ...d, today,
    loading: list.some((p) => p.loading && !p.loaded),
    error: list.map((p) => p.error).find(Boolean) || '',
    reload: () => list.forEach((p) => p.reload()),
  };
}
