import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { BedDouble, CalendarDays, ClipboardList, CreditCard, LayoutDashboard, LogOut, RefreshCw, X } from 'lucide-react';
import { api, fetchAll, money } from '../api.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import MobileChrome from './MobileChrome.jsx';
import MoMoCheckoutModal from './MoMoCheckoutModal.jsx';
import RoomCard from './RoomCard.jsx';

const NAV = [
  ['Dashboard', LayoutDashboard, null],
  ['Rooms', BedDouble, 'rooms'],
  ['Bookings', ClipboardList, 'bookings'],
  ['Payments', CreditCard, 'payments'],
];

const GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3';
const BADGE = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  Cancelled: 'bg-rose-50 text-rose-700 ring-rose-200', Failed: 'bg-rose-50 text-rose-700 ring-rose-200', Refunded: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const academicYear = (d = new Date()) => { const y = d.getFullYear(); return d.getMonth() >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };
const balanceOf = (b) => Math.max(Number(b.agreed_price || 0) - Number(b.completed_payments || 0), 0);

function Badge({ s }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${BADGE[s] || BADGE.Pending}`}>{s}</span>;
}
Badge.propTypes = { s: PropTypes.string.isRequired };

/** Load every row of a list endpoint; `reload` refetches. */
function useList(resource, extra, enabled = true) {
  const [state, setState] = useState({ rows: [], loading: enabled, error: '' });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(extra || {});
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the request about to start
    setState((s) => ({ ...s, loading: true, error: '' }));
    fetchAll(resource, '', 100, JSON.parse(key))
      .then((rows) => live && setState({ rows, loading: false, error: '' }))
      .catch((e) => live && setState({ rows: [], loading: false, error: e.message || 'Request failed.' }));
    return () => { live = false; };
  }, [resource, key, tick, enabled]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

function Panel({ state, empty, children }) {
  if (state.error) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <span>Could not load: {state.error}</span>
        <button type="button" onClick={state.reload} className="inline-flex items-center gap-1.5 font-bold underline"><RefreshCw size={14} aria-hidden="true" />Retry</button>
      </div>
    );
  }
  if (state.loading && state.rows.length === 0) {
    return <div className={GRID} aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-200/70" />)}</div>;
  }
  if (state.rows.length === 0) return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{empty}</p>;
  return children;
}
Panel.propTypes = {
  state: PropTypes.shape({ rows: PropTypes.array, loading: PropTypes.bool, error: PropTypes.string, reload: PropTypes.func }).isRequired,
  empty: PropTypes.string.isRequired, children: PropTypes.node,
};

function Stat({ title, value, note }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-800">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{note}</p>
    </article>
  );
}
Stat.propTypes = { title: PropTypes.string.isRequired, value: PropTypes.node.isRequired, note: PropTypes.string };

function BookingCard({ b, onPay }) {
  const due = balanceOf(b);
  const payable = ['Pending', 'Active'].includes(b.status) && due > 0;
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{b.hostel_name}</p>
          <p className="text-base font-extrabold text-slate-800">Room {b.room_number}</p>
        </div>
        <Badge s={b.status} />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays size={14} aria-hidden="true" />{b.start_date} to {b.end_date} · {b.academic_year}, semester {b.semester}</p>
      <div className="flex items-baseline justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="text-slate-500">Paid {money(b.completed_payments)} of {money(b.agreed_price)}</span>
        {payable && <button type="button" onClick={() => onPay(b)} className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Pay {money(due)}</button>}
      </div>
    </article>
  );
}
BookingCard.propTypes = { b: PropTypes.object.isRequired, onPay: PropTypes.func.isRequired };

function BookRoomModal({ room, range, onClose, onBooked }) {
  const [form, setForm] = useState({ academic_year: academicYear(), semester: '1', start_date: range.start, end_date: range.end });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!form.start_date || !form.end_date || !form.academic_year) { setError('Fill in every field.'); return; }
    setBusy(true); setError('');
    try {
      await api('/bookings/', { method: 'POST', body: JSON.stringify({ room: room.room_id, ...form, semester: Number(form.semester) }) });
      onBooked(`Booking requested for room ${room.room_number}. A manager will review it.`);
    } catch (err) { setError(err.message || 'Could not create the booking.'); } finally { setBusy(false); }
  };
  const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/25';

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-label="Request a booking"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div><p className="text-base font-extrabold text-slate-800">Book room {room.room_number}</p>
            <p className="text-xs text-slate-500">{room.hostel_name} · {money(room.price_per_semester)} / semester</p></div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg border-0 bg-transparent p-1.5 text-slate-500"><X size={18} /></button>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Academic year<input className={field} value={form.academic_year} onChange={set('academic_year')} placeholder="2026/2027" /></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Semester
            <select className={field} value={form.semester} onChange={set('semester')}><option value="1">1</option><option value="2">2</option></select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Start<input className={field} type="date" value={form.start_date} onChange={set('start_date')} /></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">End<input className={field} type="date" value={form.end_date} onChange={set('end_date')} /></label>
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-xl border-0 bg-emerald-800 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy ? 'Sending…' : 'Request booking'}</button>
          <p className="text-center text-[11px] text-slate-400">Your request starts as Pending until a manager approves it.</p>
        </div>
      </form>
    </div>
  );
}
BookRoomModal.propTypes = {
  room: PropTypes.object.isRequired, range: PropTypes.shape({ start: PropTypes.string, end: PropTypes.string }).isRequired,
  onClose: PropTypes.func.isRequired, onBooked: PropTypes.func.isRequired,
};

/**
 * Student home (/student/dashboard): browse available rooms, request a booking, pay by Mobile Money,
 * and see only their own bookings and payments (the API enforces this too).
 * @param {{me: {username:string, student?: {name:string, reg_number:string}}, onLogout: () => void}} props
 */
export default function StudentDashboard({ me, onLogout }) {
  const [tab, setTab] = useState('Dashboard');
  const [flash, setFlash] = useState('');
  const [range, setRange] = useState(() => ({ start: iso(addDays(new Date(), 7)), end: iso(addDays(new Date(), 112)) }));
  const [bookRoom, setBookRoom] = useState(null);
  const [payFor, setPayFor] = useState(null);

  const rangeOk = !!range.start && !!range.end && range.end >= range.start;
  const rooms = useList('rooms/available', { start_date: range.start, end_date: range.end }, tab === 'Rooms' && rangeOk);
  const bookings = useList('bookings');
  const payments = useList('payments');

  const refreshAll = () => { bookings.reload(); payments.reload(); rooms.reload(); };
  const summary = useMemo(() => {
    const live = bookings.rows.filter((b) => ['Pending', 'Active'].includes(b.status));
    return { active: live.filter((b) => b.status === 'Active').length, pending: live.filter((b) => b.status === 'Pending').length,
      due: live.reduce((t, b) => t + balanceOf(b), 0) };
  }, [bookings.rows]);

  const select = (name) => { setTab(name); setFlash(''); };
  const name = me.student?.name || me.username;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-800 min-[901px]:pb-10">
      <MobileChrome title={tab} nav={NAV} active={tab} onSelect={select} username={me.username}
        roleLabel={me.student ? `Student · ${me.student.reg_number}` : 'Student'} onLogout={onLogout} searchable={false} q="" onSearch={() => {}} />

      <div className="hidden items-center gap-6 border-b border-slate-200 bg-white px-8 py-3 min-[901px]:flex">
        <p className="text-lg font-black tracking-wide text-emerald-900">SAHMS</p>
        <nav aria-label="Student" className="flex gap-1">
          {NAV.map(([n, Icon]) => (
            <button key={n} type="button" onClick={() => select(n)} aria-current={tab === n ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-lg border-0 px-3 py-2 text-sm font-semibold ${tab === n ? 'bg-emerald-50 text-emerald-800' : 'bg-transparent text-slate-500 hover:bg-slate-100'}`}>
              <Icon size={16} aria-hidden="true" />{n}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-slate-500">{name}</span>
          <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"><LogOut size={14} aria-hidden="true" />Sign out</button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">Student portal</p>
          <h2 className="m-0 text-2xl font-extrabold">{tab === 'Dashboard' ? `Hello, ${name.split(' ')[0]}` : tab}</h2>
        </div>
        {flash && <p role="status" className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{flash}</p>}

        <ErrorBoundary resetKey={tab}>
          {tab === 'Dashboard' && (
            <div className="grid gap-6">
              <div className={GRID}>
                <Stat title="Active bookings" value={summary.active} note="Approved by a manager" />
                <Stat title="Pending requests" value={summary.pending} note="Waiting for approval" />
                <Stat title="Balance to pay" value={money(summary.due)} note="Agreed price minus completed payments" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => select('Rooms')} className="rounded-xl border-0 bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Find a room</button>
                <button type="button" onClick={() => select('Payments')} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">My payments</button>
              </div>
              <section aria-label="Latest bookings">
                <p className="mb-2 text-sm font-bold text-slate-600">Latest bookings</p>
                <Panel state={{ ...bookings }} empty="No bookings yet. Find a room to get started.">
                  <div className={GRID}>{bookings.rows.slice(0, 3).map((b) => <BookingCard key={b.booking_id} b={b} onPay={setPayFor} />)}</div>
                </Panel>
              </section>
            </div>
          )}

          {tab === 'Rooms' && (
            <section aria-label="Available rooms">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-xs font-semibold text-slate-600">From<input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">To<input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <button type="button" onClick={rooms.reload} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><RefreshCw size={13} aria-hidden="true" />Refresh</button>
              </div>
              {!rangeOk ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Pick an end date on or after the start date.</p> : (
                <Panel state={rooms} empty="No rooms are free for those dates. Try a different range.">
                  <div className={GRID}>{rooms.rows.map((r) => <RoomCard key={r.room_id} room={r} onSelect={setBookRoom} actionLabel="Book" />)}</div>
                </Panel>
              )}
            </section>
          )}

          {tab === 'Bookings' && (
            <Panel state={bookings} empty="You have no bookings yet.">
              <div className={GRID}>{bookings.rows.map((b) => <BookingCard key={b.booking_id} b={b} onPay={setPayFor} />)}</div>
            </Panel>
          )}

          {tab === 'Payments' && (
            <Panel state={payments} empty="No payments recorded yet.">
              <div className={GRID}>
                {payments.rows.map((p) => (
                  <article key={p.payment_id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-lg font-extrabold">{money(p.amount)}</p><Badge s={p.payment_status} />
                    </div>
                    <p className="text-xs text-slate-500">{p.booking_label}</p>
                    <p className="text-xs text-slate-400">{p.payment_method} · {p.payment_date}{p.reference_number ? ` · ${p.reference_number}` : ''}</p>
                  </article>
                ))}
              </div>
            </Panel>
          )}
        </ErrorBoundary>
      </div>

      {bookRoom && <BookRoomModal room={bookRoom} range={range} onClose={() => setBookRoom(null)}
        onBooked={(m) => { setBookRoom(null); setFlash(m); refreshAll(); setTab('Bookings'); }} />}
      {payFor && <MoMoCheckoutModal booking={payFor} onClose={() => { setPayFor(null); refreshAll(); }} onSettled={(m) => setFlash(m)} />}
    </div>
  );
}

StudentDashboard.propTypes = {
  me: PropTypes.shape({ username: PropTypes.string.isRequired, student: PropTypes.shape({ name: PropTypes.string, reg_number: PropTypes.string }) }).isRequired,
  onLogout: PropTypes.func.isRequired,
};
