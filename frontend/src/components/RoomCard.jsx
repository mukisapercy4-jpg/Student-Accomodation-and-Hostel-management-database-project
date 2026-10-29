import { BedDouble } from 'lucide-react';
import { money } from '../api.js';

// Full class strings on purpose: Tailwind only generates classes it can find as literal text.
const STATUS = {
  Available: {
    dot: 'bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.55)]',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    bar: 'bg-emerald-500',
  },
  Occupied: {
    dot: 'bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,0.55)]',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    bar: 'bg-rose-500',
  },
  Maintenance: {
    dot: 'bg-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.55)]',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    bar: 'bg-amber-500',
  },
};

const toCount = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };

/**
 * @param {{room: {room_id:number, hostel_name:string, room_number:string, capacity:number,
 *   occupied_spaces:number, status:'Available'|'Occupied'|'Maintenance', price_per_semester:string},
 *   onSelect?: (room: object) => void, actionLabel?: string}} props
 * `status` is derived by the API (rooms have no status column). Unknown values fall back to Available.
 */
export default function RoomCard({ room, onSelect, actionLabel = 'Details' }) {
  if (!room) return null;
  const tone = STATUS[room.status] || STATUS.Available;
  const label = STATUS[room.status] ? room.status : 'Available';
  const capacity = toCount(room.capacity);
  const filled = toCount(room.occupied_spaces);
  const pct = capacity ? Math.min(100, Math.round((filled * 100) / capacity)) : 0;
  const over = capacity > 0 && filled > capacity;

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{room.hostel_name}</p>
          <p className="flex items-center gap-2 text-base font-extrabold text-slate-800">
            <BedDouble size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
            Room {room.room_number}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${tone.badge}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
          {label}
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-semibold text-slate-600">{filled}/{capacity} Beds Filled</span>
          <span className="text-slate-400">{pct}%</span>
        </div>
        <div role="progressbar" aria-label={`Beds filled in room ${room.room_number}`}
          aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={Math.min(filled, capacity)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-[width] duration-500 ${over ? 'bg-rose-500' : tone.bar}`}
            style={{ width: `${pct}%` }} />
        </div>
        {over && <p className="mt-1 text-[11px] font-semibold text-rose-600">Over capacity: check Active bookings.</p>}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm font-bold text-slate-800">{money(room.price_per_semester)}
          <span className="font-medium text-slate-400"> / semester</span></span>
        {onSelect && (
          <button type="button" onClick={() => onSelect(room)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500">
            {actionLabel}
          </button>
        )}
      </div>
    </article>
  );
}
