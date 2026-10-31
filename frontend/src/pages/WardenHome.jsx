import { useState } from 'react';
import { money } from '../api.js';
import { RecordForm } from '../forms.jsx';
import { Badge, Card, CardHead, Icon, Metric, Notice, Progress, btn, cx, fmtDate, fmtTime, initials, useRows } from '../ui.jsx';
import { Details } from './ModulePage.jsx';
import { useHostelData } from './hostelData.js';
import { send } from '../ui.jsx';

const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];

function activityFeed(h) {
  const items = [
    ...h.bookings.rows.map((b) => ({ when: b.booking_date, icon: 'event_available', title: `Booking ${b.status}`, text: `${b.student_name} (${b.student_reg_number}) · Room ${b.room_number}` })),
    ...h.payments.rows.map((p) => ({ when: p.payment_date, icon: 'payments', title: `Payment ${p.payment_status}`, text: `${money(p.amount)} by ${p.payment_method} · ${p.student_name}` })),
    ...h.maint.rows.map((m) => ({ when: m.request_date, icon: 'build', title: `Maintenance ${m.status}`, text: `${m.room_label}: ${m.description}` })),
    ...h.visitors.rows.map((v) => ({ when: `${v.visit_date}T${v.check_in_time}`, icon: 'group', title: 'Visitor registered', text: `${v.visitor_name} visiting ${v.student_name} (${v.room_label})` })),
  ];
  return items.sort((a, b) => String(b.when).localeCompare(String(a.when))).slice(0, 8);
}

/** Warden overview (Stitch "warden dashboard") for the selected hostel, from the live API. */
export default function WardenHome({ me, hostel, go }) {
  const h = useHostelData(hostel?.hostel_id);
  const staff = useRows('staff');
  const [sel, setSel] = useState(new Set());
  const [flash, setFlash] = useState({ tone: 'ok', msg: '' });
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(false);
  const canUpdate = (me.permissions.bookings || []).includes('update');
  const who = me.staff?.name || me.username;

  if (!hostel) return <Notice tone="warn">No hostel is registered yet.</Notice>;

  const refresh = () => { h.reload(); setSel(new Set()); };
  const approve = async (ids) => {
    setBusy(true); const failed = [];
    for (const id of ids) { try { await send(`/bookings/${id}/approve/`, 'POST'); } catch (e) { failed.push(`#${id}: ${e.message}`); } }
    setBusy(false); refresh();
    setFlash(failed.length ? { tone: 'bad', msg: `Some bookings could not be approved. ${failed.join(' | ')}` } : { tone: 'ok', msg: `${ids.length} booking(s) approved.` });
  };
  const reject = async (b) => {
    const reason = window.prompt(`Reject booking #${b.booking_id} for ${b.student_name}? Reason (optional):`);
    if (reason === null) return;
    try { await send(`/bookings/${b.booking_id}/reject/`, 'POST', { reason }); setFlash({ tone: 'ok', msg: 'Booking rejected.' }); refresh(); } catch (e) { setFlash({ tone: 'bad', msg: e.message }); }
  };
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = h.pending.length > 0 && sel.size === h.pending.length;
  const feed = activityFeed(h);
  const free = h.rooms.rows.filter((r) => r.available_spaces > 0 && r.status !== 'Maintenance').slice(0, 6);
  const prio = Object.fromEntries(PRIORITIES.map((p) => [p, h.openMaint.filter((m) => m.priority === p).length]));
  const departed = h.visitors.rows.length - h.onPremise.length;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-space-lg">
      <Card className="flex flex-wrap items-start justify-between gap-space-md">
        <div>
          <div className="flex flex-wrap items-center gap-space-sm text-body-sm text-on-surface-variant"><span className="rounded bg-primary-fixed px-2 py-0.5 font-label-caps text-label-caps uppercase text-on-primary-fixed-variant">Warden overview</span>Live data for {hostel.name}</div>
          <h1 className="mt-space-sm font-headline-lg text-headline-lg">Welcome back, {who}</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">Accommodation operations for {hostel.name}{hostel.address ? ` · ${hostel.address}` : ''}.</p>
          <p className="mt-space-sm inline-flex items-center gap-space-xs rounded-lg bg-surface-container-low px-space-md py-1 text-body-sm"><Icon n="location_city" className="text-[18px] text-primary" />Warden on record: {hostel.warden_name}</p>
        </div>
        <div className="flex flex-wrap gap-space-sm">
          <button type="button" className={btn.ghost} onClick={() => setForm(true)}><Icon n="person_add" className="text-[18px]" />Record Visitor</button>
          <button type="button" className={btn.ghost} onClick={() => window.print()}><Icon n="print" className="text-[18px]" />Print Room Roster</button>
          <button type="button" className={btn.primary} onClick={() => go('bookings', 'Pending')}><Icon n="verified_user" className="text-[18px]" />Review Bookings {h.pending.length > 0 && <span className="rounded-full bg-status-pending px-2 text-[11px] font-bold text-on-surface">{h.pending.length}</span>}</button>
        </div>
      </Card>

      {h.error && <Notice onRetry={h.reload}>Could not load hostel data: {h.error}</Notice>}
      {flash.msg && <Notice tone={flash.tone} onClose={() => setFlash({ tone: 'ok', msg: '' })}>{flash.msg}</Notice>}

      <div className="grid grid-cols-2 gap-space-md md:grid-cols-4 2xl:grid-cols-8">
        <Metric label="Residents" value={h.active.length} icon="school" note="Active bookings" />
        <Metric label="Rooms" value={h.rooms.rows.length} icon="meeting_room" chip="bg-surface-container-high text-on-surface" note={`${h.capacity} bed spaces`} />
        <Metric label="Occupied" value={h.occupied} icon="bed" chip="bg-error-container text-error" note={`${h.rate}% occupied`} tagTone="text-error" />
        <Metric label="Available" value={h.free} icon="check_circle" chip="bg-status-available/10 text-emerald-700" note="Free bed spaces" />
        <Metric label="Confirmed" value={h.active.length} icon="how_to_reg" note="Active bookings" />
        <Metric label="Pending" value={h.pending.length} icon="pending_actions" chip="bg-status-pending/15 text-momo-mtn-accent" note="Need approval" />
        <Metric label="Repairs" value={h.openMaint.length} icon="engineering" chip="bg-error-container text-error" note="Open requests" />
        <Metric label="Guests" value={h.visitors.rows.length} icon="group" chip="bg-secondary-fixed text-secondary" note="Logged today" />
      </div>

      <div className="grid gap-space-lg xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHead icon="apartment" title={hostel.name} sub={hostel.address} right={<button type="button" className={btn.small} onClick={() => go('rooms')}>View Full Room Grid</button>} />
          <div className="rounded-lg bg-surface-container-low p-space-md">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-space-sm"><span className="font-label-lg">Overall bed allocation</span><span className="text-body-md"><b className="text-primary">{h.occupied}</b> / {h.capacity} beds · {h.rate}%</span></div>
            <Progress pct={h.rate} className="h-3" />
            <div className="mt-space-md grid gap-space-sm sm:grid-cols-2 lg:grid-cols-4">
              {h.groups.map((g) => (<div key={g.capacity}><div className="font-label-lg">{g.capacity}-bed rooms</div><div className="text-body-sm text-on-surface-variant">{g.rooms} room(s) · {g.occupied}/{g.beds} beds filled</div></div>))}
              {h.groups.length === 0 && <p className="text-body-sm text-on-surface-variant">No rooms registered for this hostel.</p>}
            </div>
          </div>
        </Card>
        <div className="grid gap-space-lg">
          <Card>
            <CardHead icon="build_circle" title="Maintenance Status" right={<Badge tone={h.openMaint.length ? 'bad' : 'ok'}>{h.openMaint.length} open</Badge>} />
            <ul className="grid gap-space-sm">{PRIORITIES.map((p) => <li key={p} className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm px-space-md"><span className="flex items-center gap-space-sm font-label-lg"><Badge>{p}</Badge></span><b>{prio[p]} request(s)</b></li>)}</ul>
            <button type="button" onClick={() => go('maintenance')} className="mt-space-md border-0 bg-transparent p-0 font-label-lg text-primary hover:underline">View tickets</button>
          </Card>
          <Card>
            <CardHead icon="schedule" title="Visitors Today" right={<Badge tone="info">Desk active</Badge>} />
            <div className="flex items-end justify-between"><div><div className="font-headline-lg text-headline-lg">{h.onPremise.length}</div><div className="text-body-sm text-on-surface-variant">Visitors on premise</div></div><div className="text-right text-body-sm text-on-surface-variant">{departed} signed out</div></div>
          </Card>
        </div>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-space-md p-space-lg pb-space-md">
          <CardHead icon="pending_actions" title="Pending Booking Requests" sub={`${h.pending.length} awaiting approval for ${hostel.name}.`} />
          {canUpdate && <button type="button" className={btn.primary} disabled={!sel.size || busy} onClick={() => window.confirm(`Approve ${sel.size} selected booking(s)?`) && approve([...sel])}><Icon n="done_all" className="text-[18px]" />{busy ? 'Approving…' : `Batch Confirm Selected (${sel.size})`}</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead><tr className="bg-surface-container-low">
              <th className="w-10 px-space-md py-space-sm"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(h.pending.map((b) => b.booking_id)))} className="accent-primary-container" /></th>
              {['Student & registration', 'Period', 'Requested space', 'Paid so far', 'Status', 'Warden actions'].map((t) => <th key={t} className="px-space-md py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{t}</th>)}</tr></thead>
            <tbody>
              {h.pending.map((b) => (
                <tr key={b.booking_id} className="border-t border-outline-variant/40">
                  <td className="px-space-md py-space-sm"><input type="checkbox" aria-label={`Select booking ${b.booking_id}`} checked={sel.has(b.booking_id)} onChange={() => toggle(b.booking_id)} className="accent-primary-container" /></td>
                  <td className="px-space-md py-space-sm"><div className="flex items-center gap-space-sm"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-fixed text-[12px] font-bold text-primary">{initials(b.student_name)}</span><div><b>{b.student_name}</b><div className="text-body-sm text-on-surface-variant">{b.student_reg_number}</div></div></div></td>
                  <td className="px-space-md py-space-sm text-body-md">{fmtDate(b.start_date)} – {fmtDate(b.end_date)}<div className="text-body-sm text-on-surface-variant">{b.academic_year}, semester {b.semester}</div></td>
                  <td className="px-space-md py-space-sm"><span className="rounded-lg bg-secondary-fixed px-2 py-1 font-label-md text-on-secondary-fixed">Room {b.room_number}</span></td>
                  <td className="px-space-md py-space-sm text-body-md"><b>{money(b.completed_payments)}</b><div className="text-body-sm text-on-surface-variant">of {money(b.agreed_price)}</div></td>
                  <td className="px-space-md py-space-sm"><Badge>{b.status}</Badge></td>
                  <td className="px-space-md py-space-sm"><div className="flex items-center gap-space-xs">
                    {canUpdate && <button type="button" className={btn.small} disabled={busy} onClick={() => window.confirm(`Approve booking #${b.booking_id} for ${b.student_name}?`) && approve([b.booking_id])}>Approve</button>}
                    {canUpdate && <button type="button" className={btn.smallDanger} onClick={() => reject(b)}>Reject</button>}
                    <button type="button" aria-label="View details" title="View details" onClick={() => setDetail(b)} className="rounded-lg border-0 bg-transparent p-1.5 text-on-surface-variant hover:bg-surface-container"><Icon n="visibility" className="text-[20px]" /></button></div></td>
                </tr>
              ))}
              {!h.loading && h.pending.length === 0 && <tr><td colSpan="7" className="p-space-lg text-center text-on-surface-variant">No pending booking requests for this hostel.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-space-lg xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHead icon="history" title="Recent Hostel Activity" sub="Newest bookings, payments, repairs and visitors for this hostel." />
          {feed.length === 0 ? <p className="text-body-md text-on-surface-variant">Nothing recorded yet.</p> : (
            <ol className="grid gap-space-sm">{feed.map((f, i) => (
              <li key={i} className="flex gap-space-md rounded-lg bg-surface-container-low p-space-md">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary"><Icon n={f.icon} className="text-[20px]" /></span>
                <div className="min-w-0"><div className="flex flex-wrap justify-between gap-space-sm"><b>{f.title}</b><span className="text-body-sm text-on-surface-variant">{fmtDate(String(f.when).slice(0, 10))}{String(f.when).length > 10 ? ` ${fmtTime(String(f.when).slice(11))}` : ''}</span></div><p className="break-words text-body-md text-on-surface-variant">{f.text}</p></div>
              </li>))}</ol>)}
        </Card>
        <div className="grid content-start gap-space-lg">
          <Card>
            <CardHead icon="contacts" title="Staff Directory" sub="Contacts from the staff register." />
            <ul className="grid gap-space-sm">{staff.rows.slice(0, 6).map((s) => (
              <li key={s.staff_id} className="rounded-lg bg-surface-container-low p-space-sm px-space-md"><b>{s.first_name} {s.last_name}</b><div className="text-body-sm text-on-surface-variant">{s.role}{s.phone ? ` · ${s.phone}` : ''}</div></li>))}
              {staff.loaded && staff.rows.length === 0 && <li className="text-body-md text-on-surface-variant">No staff registered.</li>}</ul>
          </Card>
          <Card>
            <CardHead icon="bed" title="Rooms With Free Beds" sub="Bookable now (no blocking repair)." />
            <ul className="grid gap-space-sm">{free.map((r) => <li key={r.room_id} className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm px-space-md"><b>Room {r.room_number}</b><span className={cx('text-body-sm font-semibold', 'text-emerald-700')}>{r.available_spaces} bed(s) free</span></li>)}
              {h.rooms.loaded && free.length === 0 && <li className="text-body-md text-on-surface-variant">No free beds.</li>}</ul>
          </Card>
        </div>
      </div>

      {detail && <Details record={detail} onClose={() => setDetail(null)} />}
      {form && <RecordForm resource="visitors" isAdmin={false} onClose={() => setForm(false)} onSaved={(m) => { setForm(false); setFlash({ tone: 'ok', msg: m }); h.reload(); }} />}
    </div>
  );
}
