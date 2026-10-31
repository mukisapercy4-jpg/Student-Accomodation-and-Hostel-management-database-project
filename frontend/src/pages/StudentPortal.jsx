import { useState } from 'react';
import { money } from '../api.js';
import MoMoCheckoutModal from '../components/MoMoCheckoutModal.jsx';
import RoomCard from '../components/RoomCard.jsx';
import Shell from '../Shell.jsx';
import { Async, Badge, Card, CardHead, Icon, Metric, Modal, Notice, Progress, academicYear, addDaysIso, balanceOf, btn, cx, fieldCls, fmtDate, fmtTime, send, todayIso, useApi, useRows } from '../ui.jsx';

const NAV = [{ items: [
  { key: 'dashboard', label: 'Dashboard', icon: 'space_dashboard' }, { key: 'rooms', label: 'Find a Room', icon: 'domain' },
  { key: 'bookings', label: 'Bookings', icon: 'event_available' }, { key: 'payments', label: 'Payments', icon: 'payments' },
  { key: 'maintenance', label: 'Maintenance Requests', icon: 'handyman' }, { key: 'visitors', label: 'Visitors', icon: 'group' },
] }];
const TITLES = { dashboard: 'Dashboard', rooms: 'Find a Room', bookings: 'Bookings', payments: 'Payments', maintenance: 'Maintenance Requests', visitors: 'Visitors' };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const lbl = 'grid gap-1 font-label-md text-on-surface-variant';

function BookRoomModal({ room, range, onClose, onBooked }) {
  const [form, setForm] = useState({ academic_year: academicYear(), semester: '1', start_date: range.start, end_date: range.end });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!form.start_date || !form.end_date || !form.academic_year) { setError('Fill in every field.'); return; }
    setBusy(true); setError('');
    try { await send('/bookings/', 'POST', { room: room.room_id, ...form, semester: Number(form.semester) }); onBooked(`Booking requested for room ${room.room_number}. A warden will review it.`); }
    catch (err) { setError(err.message || 'Could not create the booking.'); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Book room ${room.room_number}`} sub={`${room.hostel_name} · ${money(room.price_per_semester)} / semester`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="grid gap-space-md">
        <label className={lbl}>Academic year<input className={fieldCls} value={form.academic_year} onChange={set('academic_year')} placeholder="2026/2027" /></label>
        <label className={lbl}>Semester<select className={fieldCls} value={form.semester} onChange={set('semester')}><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label>
        <div className="grid grid-cols-2 gap-space-md">
          <label className={lbl}>Start<input className={fieldCls} type="date" value={form.start_date} onChange={set('start_date')} /></label>
          <label className={lbl}>End<input className={fieldCls} type="date" value={form.end_date} onChange={set('end_date')} /></label>
        </div>
        {error && <p role="alert" className="rounded-lg bg-error-container p-space-sm px-space-md text-body-md text-on-error-container">{error}</p>}
        <button type="submit" disabled={busy} className={btn.primary}>{busy ? 'Sending…' : 'Request booking'}</button>
        <p className="text-center text-body-sm text-on-surface-variant">Your request starts as Pending until a warden approves it.</p>
      </form>
    </Modal>
  );
}

function DefectModal({ rooms, onClose, onDone }) {
  const [room, setRoom] = useState(rooms.length === 1 ? String(rooms[0].room) : '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await send('/maintenance/', 'POST', { room: Number(room), description }); onDone('Defect reported. The caretaker will pick it up.'); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Report a defect" sub="Only rooms you currently occupy can be reported." onClose={onClose}>
      <form onSubmit={submit} className="grid gap-space-md">
        <label className={lbl}>Room<select required className={fieldCls} value={room} onChange={(e) => setRoom(e.target.value)}><option value="">Select…</option>{rooms.map((r) => <option key={r.room} value={r.room}>{r.hostel_name} {r.room_number}</option>)}</select></label>
        <label className={lbl}>What is wrong?<textarea required rows={3} className={fieldCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Tap leaking in the bathroom" /></label>
        {error && <p role="alert" className="rounded-lg bg-error-container p-space-sm px-space-md text-body-md text-on-error-container">{error}</p>}
        <button className={btn.primary} disabled={busy || !room || !description.trim()}>{busy ? 'Sending…' : 'Submit defect'}</button>
      </form>
    </Modal>
  );
}

function VisitorModal({ bookings, onClose, onDone }) {
  const [v, setV] = useState({ booking: bookings.length === 1 ? String(bookings[0].booking_id) : '', visitor_name: '', phone: '', visit_date: todayIso(), check_in_time: '14:00', purpose: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    const body = { ...v, booking: Number(v.booking) };
    ['phone', 'purpose'].forEach((k) => { if (!body[k]) delete body[k]; });
    try { await send('/visitors/', 'POST', body); onDone('Visitor registered. The gate desk will expect them.'); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Register a visitor" sub="Visitors can only be registered against an Active booking of yours." onClose={onClose}>
      <form onSubmit={submit} className="grid gap-space-md">
        <label className={lbl}>Visiting<select required className={fieldCls} value={v.booking} onChange={set('booking')}><option value="">Select…</option>{bookings.map((b) => <option key={b.booking_id} value={b.booking_id}>#{b.booking_id} · {b.hostel_name} {b.room_number}</option>)}</select></label>
        <label className={lbl}>Visitor name<input required className={fieldCls} value={v.visitor_name} onChange={set('visitor_name')} /></label>
        <label className={lbl}>Visitor phone<input className={fieldCls} value={v.phone} onChange={set('phone')} /></label>
        <div className="grid grid-cols-2 gap-space-md"><label className={lbl}>Date<input required type="date" className={fieldCls} value={v.visit_date} onChange={set('visit_date')} /></label><label className={lbl}>Expected time<input required type="time" className={fieldCls} value={v.check_in_time} onChange={set('check_in_time')} /></label></div>
        <label className={lbl}>Purpose<input className={fieldCls} value={v.purpose} onChange={set('purpose')} placeholder="e.g. Family visit" /></label>
        {error && <p role="alert" className="rounded-lg bg-error-container p-space-sm px-space-md text-body-md text-on-error-container">{error}</p>}
        <button className={btn.primary} disabled={busy || !v.booking || !v.visitor_name.trim()}>{busy ? 'Saving…' : 'Register visitor'}</button>
      </form>
    </Modal>
  );
}

function BookingsTable({ rows, onPay }) {
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left">
      <thead><tr className="bg-surface-container-low">{['Reference', 'Hall & room', 'Period', 'Fee (UGX)', 'Paid', 'Status', ''].map((t) => <th key={t} className="px-space-md py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{t}</th>)}</tr></thead>
      <tbody>{rows.map((b) => { const due = balanceOf(b); return (
        <tr key={b.booking_id} className="border-t border-outline-variant/40">
          <td className="px-space-md py-space-md font-semibold text-primary">#{b.booking_id}</td>
          <td className="px-space-md py-space-md">{b.hostel_name}<div className="text-body-sm text-on-surface-variant">Room {b.room_number}</div></td>
          <td className="px-space-md py-space-md">{b.academic_year}<div className="text-body-sm text-on-surface-variant">Sem {b.semester} · {fmtDate(b.start_date)} – {fmtDate(b.end_date)}</div></td>
          <td className="px-space-md py-space-md font-semibold">{Number(b.agreed_price).toLocaleString()}</td>
          <td className="px-space-md py-space-md">{money(b.completed_payments)}</td>
          <td className="px-space-md py-space-md"><Badge>{b.status}</Badge></td>
          <td className="px-space-md py-space-md">{['Pending', 'Active'].includes(b.status) && due > 0 && <button type="button" className={btn.small} onClick={() => onPay(b)}>Pay {money(due)}</button>}</td>
        </tr>); })}</tbody></table></div>
  );
}

/** Student portal (Stitch "student portal dashboard"). The API returns only this student's own rows. */
export default function StudentPortal({ me, onLogout }) {
  const [page, setPage] = useState('dashboard');
  const [flash, setFlash] = useState('');
  const [modal, setModal] = useState(null); // {type, ...}
  const [range, setRange] = useState(() => ({ start: addDaysIso(todayIso(), 7), end: addDaysIso(todayIso(), 112) }));
  const st = me.student;
  const bookings = useRows('bookings');
  const payments = useRows('payments');
  const maint = useRows('maintenance');
  const visitors = useRows('visitors');
  const hostels = useRows('hostels');
  const rangeOk = !!range.start && !!range.end && range.end >= range.start;
  const avail = useRows('rooms/available', { start_date: range.start, end_date: range.end }, page === 'rooms' && rangeOk);

  const live = bookings.rows.filter((b) => ['Pending', 'Active'].includes(b.status));
  const current = bookings.rows.find((b) => b.status === 'Active') || bookings.rows.find((b) => b.status === 'Pending') || null;
  const activeRooms = bookings.rows.filter((b) => b.status === 'Active');
  const room = useApi(current ? `/rooms/${current.room}/` : '', !!current);
  const hostel = hostels.rows.find((h) => h.name === current?.hostel_name);
  const due = live.reduce((t, b) => t + balanceOf(b), 0);
  const refresh = () => { bookings.reload(); payments.reload(); maint.reload(); visitors.reload(); avail.reload(); };
  const done = (m) => { setModal(null); setFlash(m); refresh(); };
  const openMaint = maint.rows.filter((m) => ['Pending', 'In Progress'].includes(m.status));
  const events = [
    ...bookings.rows.map((b) => ({ d: b.booking_date, icon: 'event_available', text: `Booking #${b.booking_id} for ${b.hostel_name} room ${b.room_number} is ${b.status}.` })),
    ...payments.rows.map((p) => ({ d: p.payment_date, icon: 'payments', text: `Payment of ${money(p.amount)} (${p.payment_method}) is ${p.payment_status}.` })),
    ...maint.rows.map((m) => ({ d: m.request_date, icon: 'build', text: `Defect #${m.request_id} reported: ${m.description} (${m.status}).` })),
  ].sort((a, b) => String(b.d).localeCompare(String(a.d))).slice(0, 6);
  const upcoming = visitors.rows.filter((v) => v.visit_date >= todayIso() && !v.check_out_time).slice(0, 2);
  const lastPay = payments.rows.find((p) => p.payment_status === 'Completed');
  const paidPct = current && Number(current.agreed_price) ? Math.min(100, Math.round((Number(current.completed_payments) * 100) / Number(current.agreed_price))) : 0;
  const yearSem = current ? `Academic Year ${current.academic_year} • Semester ${current.semester}` : `Academic Year ${academicYear()}`;

  const Tools = (
    <Card>
      <h2 className="mb-space-md font-headline-sm text-headline-sm">Portal Quick Actions</h2>
      <div className="grid gap-space-sm">
        {[['calendar_add_on', 'Room Bookings', 'Request a new hall room', () => setPage('rooms')], ['receipt', 'Payment Ledger', 'See payments and pay by Mobile Money', () => setPage('payments')],
          ['handyman', 'Maintenance Ticket', 'Report a plumbing, socket or carpentry fault', () => setPage('maintenance')], ['how_to_reg', 'Register Visitor', 'Tell the gate desk about a guest', () => setPage('visitors')]].map(([i, t, s, fn]) => (
          <button key={t} type="button" onClick={fn} className="flex items-center gap-space-md rounded-lg border-0 bg-surface-container-low p-space-md text-left hover:bg-surface-container"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary"><Icon n={i} /></span>
            <span className="min-w-0 flex-1"><b className="block font-label-lg">{t}</b><span className="text-body-sm text-on-surface-variant">{s}</span></span><Icon n="chevron_right" className="text-outline" /></button>))}
      </div>
    </Card>
  );

  return (
    <Shell brandSub="Student Portal" nav={NAV} active={page} onNav={(k) => { setPage(k); setFlash(''); }} name={st?.name || me.username} subline={st?.reg_number}
      onLogout={onLogout} crumbRoot="Student Portal" crumb={TITLES[page]} pill={<><Icon n="school" className="text-[16px]" />{yearSem}</>}>
      <div className="mx-auto grid max-w-[1300px] gap-space-lg">
        {flash && <Notice tone="ok" onClose={() => setFlash('')}>{flash}</Notice>}
        {[bookings, payments].map((s, i) => s.error && <Notice key={i} onRetry={s.reload}>Could not load your {i ? 'payments' : 'bookings'}: {s.error}</Notice>)}

        {page === 'dashboard' && (
          <>
            <div>
              <h1 className="font-headline-lg text-headline-lg">{greeting()}, {st?.first_name || me.username}!</h1>
              <p className="text-body-md text-on-surface-variant">Welcome to your student accommodation portal. Manage your accommodation services in one place.</p>
            </div>
            <section className="flex flex-wrap items-center justify-between gap-space-md rounded-xl bg-gradient-to-r from-inverse-surface to-tertiary p-space-lg text-surface-container-lowest shadow-sm">
              <div className="flex items-center gap-space-md">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary-container font-headline-md text-headline-md">{(st?.first_name?.[0] || '') + (st?.last_name?.[0] || '')}</div>
                <div>
                  <div className="flex flex-wrap items-center gap-space-sm"><h2 className="font-headline-md text-headline-md">{st?.name || me.username}</h2>
                    {st?.program && <span className="rounded bg-surface-container-lowest/15 px-2 py-0.5 text-label-md uppercase">{st.program}{st.year_of_study ? ` • Year ${st.year_of_study}` : ''}</span>}</div>
                  <p className="mt-1 flex flex-wrap gap-x-space-md text-body-sm text-inverse-on-surface"><span>Reg: <b>{st?.reg_number}</b></span>{st?.phone && <span>{st.phone}</span>}{st?.email && <span>{st.email}</span>}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-space-sm">
                <button type="button" disabled={!activeRooms.length} title={activeRooms.length ? '' : 'Available once you have an Active booking'} onClick={() => setModal({ type: 'defect' })} className="inline-flex h-10 items-center gap-space-xs rounded-lg border-0 bg-surface-container-lowest/15 px-space-md font-label-lg text-surface-container-lowest hover:bg-surface-container-lowest/25 disabled:opacity-50"><Icon n="build" className="text-[18px]" />Report Defect</button>
                <button type="button" disabled={!activeRooms.length} title={activeRooms.length ? '' : 'Available once you have an Active booking'} onClick={() => setModal({ type: 'visitor' })} className="inline-flex h-10 items-center gap-space-xs rounded-lg border-0 bg-primary-container px-space-md font-label-lg text-on-primary hover:bg-primary disabled:opacity-50"><Icon n="person_add" className="text-[18px]" />Register Visitor</button>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Current room" value={current ? `Room ${current.room_number}` : '—'} icon="domain" note={current ? current.hostel_name : 'No booking yet'} tag={current?.status === 'Active' ? 'In residence' : current ? current.status : ''} tagTone="text-emerald-700" />
              <Metric label="Booking status" value={current?.status || '—'} icon="confirmation_number" note={current ? `${fmtDate(current.start_date)} – ${fmtDate(current.end_date)}` : 'Request a room to begin'} tag={current ? `Ref #${current.booking_id}` : ''} tagTone="text-primary" />
              <Metric label="Outstanding balance" value={money(due)} icon="account_balance_wallet" chip="bg-status-available/10 text-emerald-700" note={due ? 'Agreed price minus completed payments' : 'Fully reconciled'} />
              <Metric label="Maintenance logs" value={`${maint.rows.length} ticket${maint.rows.length === 1 ? '' : 's'}`} icon="handyman" chip="bg-status-pending/15 text-momo-mtn-accent" note={`${openMaint.length} open • ${maint.rows.length - openMaint.length} closed`} />
            </div>

            <div className="grid gap-space-lg xl:grid-cols-[2fr_1fr]">
              <div className="grid content-start gap-space-lg">
                <Card>
                  <CardHead title="Residential Placement" right={current && <Badge>{current.status}</Badge>} />
                  {current ? (
                    <>
                      <h3 className="font-headline-md text-headline-md">{current.hostel_name} • Room {current.room_number}</h3>
                      <div className="mt-space-md grid gap-space-md rounded-lg bg-surface-container-low p-space-md sm:grid-cols-3">
                        <div><div className="font-label-caps text-label-caps uppercase text-on-surface-variant">Hostel</div><b>{current.hostel_name}</b><div className="text-body-sm text-on-surface-variant">{hostel?.address || 'No address recorded'}</div></div>
                        <div><div className="font-label-caps text-label-caps uppercase text-on-surface-variant">Room</div><b>Room {current.room_number}</b><div className="text-body-sm text-on-surface-variant">{room.data ? `${room.data.capacity}-bed room · ${money(room.data.price_per_semester)} / semester` : '…'}</div></div>
                        <div><div className="font-label-caps text-label-caps uppercase text-on-surface-variant">Occupancy</div><b>{room.data ? `${room.data.occupied_spaces} of ${room.data.capacity} beds assigned` : '…'}</b>{room.data && <Progress className="mt-1" pct={(room.data.occupied_spaces * 100) / room.data.capacity} />}</div>
                      </div>
                      <div className="mt-space-md flex items-center gap-space-md rounded-lg bg-surface-container-low p-space-md"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-fixed text-primary"><Icon n="account_box" /></span><div><div className="font-label-caps text-label-caps uppercase text-on-surface-variant">Hall warden in charge</div><b>{hostel?.warden_name || '—'}</b></div></div>
                    </>
                  ) : <p className="text-body-md text-on-surface-variant">You have no booking yet. Use “Find a Room” to request one.</p>}
                </Card>

                <Card className="p-0">
                  <div className="flex flex-wrap items-start justify-between gap-space-md p-space-lg pb-space-md"><CardHead title="Booking History" sub="Your reservation records from the accommodation registry." />
                    <button type="button" className={btn.primary} onClick={() => setPage('rooms')}><Icon n="add" className="text-[18px]" />Request Booking</button></div>
                  <Async state={bookings} empty="No bookings yet."><BookingsTable rows={bookings.rows} onPay={(b) => setModal({ type: 'pay', b })} /></Async>
                </Card>

                <Card>
                  <CardHead title="Activity Timeline" sub="Your latest bookings, payments and defects." />
                  {events.length === 0 ? <p className="text-body-md text-on-surface-variant">No activity yet.</p> : (
                    <ol className="grid gap-space-md border-l-2 border-outline-variant pl-space-md">{events.map((e, i) => (
                      <li key={i} className="relative"><span className="absolute -left-[26px] top-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary-container text-on-primary"><Icon n={e.icon} className="text-[12px]" /></span>
                        <div className="font-label-md text-primary">{fmtDate(e.d)}</div><p className="text-body-md">{e.text}</p></li>))}</ol>)}
                </Card>
              </div>

              <div className="grid content-start gap-space-lg">
                {Tools}
                <Card>
                  <CardHead title="Bursar Ledger" sub={current ? `${current.academic_year}, semester ${current.semester}` : ''} right={current && <Badge tone={due ? 'warn' : 'ok'}>{due ? 'Balance due' : 'Settled'}</Badge>} />
                  {current ? (
                    <div className="rounded-lg bg-surface-container-low p-space-md">
                      <div className="mb-1 flex justify-between font-label-lg"><span>Paid vs agreed</span><span className="text-emerald-700">{paidPct}% cleared</span></div><Progress pct={paidPct} color="bg-status-available" />
                      <div className="mt-space-md grid grid-cols-2 gap-space-sm text-body-sm"><div><div className="text-on-surface-variant">Agreed price</div><b className="text-body-md">{money(current.agreed_price)}</b></div><div className="text-right"><div className="text-on-surface-variant">Outstanding</div><b className={cx('text-body-md', balanceOf(current) ? 'text-error' : 'text-emerald-700')}>{money(balanceOf(current))}</b></div></div>
                    </div>) : <p className="text-body-md text-on-surface-variant">No booking to reconcile.</p>}
                  {lastPay && <div className="mt-space-md"><div className="mb-1 font-label-caps text-label-caps uppercase text-on-surface-variant">Latest completed payment</div><div className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm px-space-md"><div><b>{money(lastPay.amount)}</b><div className="text-body-sm text-on-surface-variant">{fmtDate(lastPay.payment_date)} · {lastPay.reference_number || 'no reference'}</div></div><Badge tone="info">{lastPay.payment_method}</Badge></div></div>}
                </Card>
                {openMaint[0] && <Card><CardHead icon="warning" title="Active Defect" right={<Badge>{openMaint[0].status}</Badge>} /><b>#{openMaint[0].request_id} · {openMaint[0].room_label}</b><p className="text-body-md text-on-surface-variant">{openMaint[0].description}</p><p className="mt-space-sm text-body-sm text-on-surface-variant">Logged {fmtDate(openMaint[0].request_date)}{openMaint[0].assigned_to_name ? ` · Assigned to ${openMaint[0].assigned_to_name}` : ''}</p></Card>}
                {upcoming.map((v) => <Card key={v.visitor_id}><CardHead icon="schedule" title="Expected Visitor" right={<Badge tone="info">{fmtDate(v.visit_date)} {fmtTime(v.check_in_time)}</Badge>} /><b>{v.visitor_name}</b><p className="text-body-sm text-on-surface-variant">{v.purpose || 'No purpose given'}{v.phone ? ` · ${v.phone}` : ''}</p></Card>)}
              </div>
            </div>
          </>
        )}

        {page === 'rooms' && (
          <>
            <h1 className="font-headline-lg text-headline-lg">Find a Room</h1>
            <div className="flex flex-wrap items-end gap-space-md">
              <label className={lbl}>From<input type="date" className={fieldCls} value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} /></label>
              <label className={lbl}>To<input type="date" className={fieldCls} value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} /></label>
              <button type="button" className={btn.ghost} onClick={avail.reload}><Icon n="refresh" className="text-[18px]" />Refresh</button>
            </div>
            {!rangeOk ? <Notice tone="warn">Pick an end date on or after the start date.</Notice> : (
              <Async state={avail} empty="No rooms are free for those dates. Try a different range.">
                <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-3">{avail.rows.map((r) => <RoomCard key={r.room_id} room={r} actionLabel="Book" onSelect={(rm) => setModal({ type: 'book', room: rm })} />)}</div>
              </Async>)}
          </>
        )}

        {page === 'bookings' && (<><h1 className="font-headline-lg text-headline-lg">Bookings</h1><Card className="p-0"><Async state={bookings} empty="You have no bookings yet."><BookingsTable rows={bookings.rows} onPay={(b) => setModal({ type: 'pay', b })} /></Async></Card></>)}

        {page === 'payments' && (
          <>
            <h1 className="font-headline-lg text-headline-lg">Payments</h1>
            <Async state={payments} empty="No payments recorded yet.">
              <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-3">{payments.rows.map((p) => (
                <Card key={p.payment_id}><div className="flex items-start justify-between gap-space-sm"><b className="font-headline-sm text-headline-sm">{money(p.amount)}</b><Badge>{p.payment_status}</Badge></div>
                  <p className="mt-1 text-body-sm text-on-surface-variant">{p.booking_label}</p><p className="text-body-sm text-outline">{p.payment_method} · {fmtDate(p.payment_date)}{p.reference_number ? ` · ${p.reference_number}` : ''}</p></Card>))}</div>
            </Async>
            {live.some((b) => balanceOf(b) > 0) && <div className="flex flex-wrap gap-space-sm">{live.filter((b) => balanceOf(b) > 0).map((b) => <button key={b.booking_id} type="button" className={btn.primary} onClick={() => setModal({ type: 'pay', b })}><Icon n="smartphone" className="text-[18px]" />Pay {money(balanceOf(b))} for room {b.room_number}</button>)}</div>}
          </>
        )}

        {page === 'maintenance' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-space-md"><h1 className="font-headline-lg text-headline-lg">Maintenance Requests</h1>
              <button type="button" className={btn.primary} disabled={!activeRooms.length} onClick={() => setModal({ type: 'defect' })}><Icon n="build" className="text-[18px]" />Report Defect</button></div>
            {!activeRooms.length && <Notice tone="warn">You can report a defect once you have an Active booking.</Notice>}
            <Async state={maint} empty="You have not reported any defects.">
              <div className="grid gap-space-md md:grid-cols-2">{maint.rows.map((m) => (
                <Card key={m.request_id}><div className="flex items-start justify-between gap-space-sm"><b>#{m.request_id} · {m.room_label}</b><span className="flex gap-space-xs"><Badge>{m.priority}</Badge><Badge>{m.status}</Badge></span></div>
                  <p className="mt-space-sm text-body-md">{m.description}</p><p className="mt-1 text-body-sm text-on-surface-variant">Logged {fmtDate(m.request_date)}{m.assigned_to_name ? ` · Assigned to ${m.assigned_to_name}` : ''}{m.completion_date ? ` · Completed ${fmtDate(m.completion_date)}` : ''}</p></Card>))}</div>
            </Async>
          </>
        )}

        {page === 'visitors' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-space-md"><h1 className="font-headline-lg text-headline-lg">Visitors</h1>
              <button type="button" className={btn.primary} disabled={!activeRooms.length} onClick={() => setModal({ type: 'visitor' })}><Icon n="person_add" className="text-[18px]" />Register Visitor</button></div>
            {!activeRooms.length && <Notice tone="warn">You can register visitors once you have an Active booking.</Notice>}
            <Async state={visitors} empty="No visitors registered.">
              <Card className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-left"><thead><tr className="bg-surface-container-low">{['Visitor', 'Date', 'In', 'Out', 'Purpose'].map((t) => <th key={t} className="px-space-md py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{t}</th>)}</tr></thead>
                <tbody>{visitors.rows.map((v) => <tr key={v.visitor_id} className="border-t border-outline-variant/40"><td className="px-space-md py-space-md"><b>{v.visitor_name}</b><div className="text-body-sm text-on-surface-variant">{v.phone || ''}</div></td><td className="px-space-md py-space-md">{fmtDate(v.visit_date)}</td><td className="px-space-md py-space-md">{fmtTime(v.check_in_time)}</td><td className="px-space-md py-space-md">{fmtTime(v.check_out_time)}</td><td className="px-space-md py-space-md">{v.purpose || '—'}</td></tr>)}</tbody></table></div></Card>
            </Async>
          </>
        )}
      </div>

      {modal?.type === 'book' && <BookRoomModal room={modal.room} range={range} onClose={() => setModal(null)} onBooked={(m) => { done(m); setPage('bookings'); }} />}
      {modal?.type === 'pay' && <MoMoCheckoutModal booking={modal.b} onClose={() => { setModal(null); refresh(); }} onSettled={(m) => setFlash(m)} />}
      {modal?.type === 'defect' && <DefectModal rooms={activeRooms} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'visitor' && <VisitorModal bookings={activeRooms} onClose={() => setModal(null)} onDone={done} />}
    </Shell>
  );
}
