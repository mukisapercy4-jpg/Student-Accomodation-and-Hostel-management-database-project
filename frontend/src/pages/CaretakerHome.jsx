import { useState } from 'react';
import { RecordForm } from '../forms.jsx';
import { Badge, Card, CardHead, Icon, Metric, Modal, Notice, Progress, btn, cx, fieldCls, fmtDate, fmtTime, initials, nowTime, send, todayIso, useRows } from '../ui.jsx';
import { Details } from './ModulePage.jsx';
import { useHostelData } from './hostelData.js';

const TABS = ['All', 'Pending', 'In Progress', 'Resolved'];
const RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const roomState = (r) => (!r.occupied_spaces ? 'Vacant' : r.occupied_spaces >= r.capacity ? 'Full' : 'Partial');
const ROOM_TONE = { Vacant: 'ok', Partial: 'warn', Full: 'bad' };

/** Caretaker operations (Stitch "caretaker dashboard") for the selected hostel, from the live API. */
export default function CaretakerHome({ me, hostel, go }) {
  const h = useHostelData(hostel?.hostel_id, false);
  const staff = useRows('staff');
  const [tab, setTab] = useState('All');
  const [roomTab, setRoomTab] = useState('All');
  const [vq, setVq] = useState('');
  const [flash, setFlash] = useState({ tone: 'ok', msg: '' });
  const [busy, setBusy] = useState(0);
  const [form, setForm] = useState(null); // 'visitors' | 'maintenance'
  const [assign, setAssign] = useState(null);
  const [artisan, setArtisan] = useState('');
  const [detail, setDetail] = useState(null);
  const canMaint = (me.permissions.maintenance || []).includes('update');
  const canVisit = (me.permissions.visitors || []).includes('update');
  const who = me.staff?.name || me.username;

  if (!hostel) return <Notice tone="warn">No hostel is registered yet.</Notice>;

  const patch = async (path, body, ok) => {
    setBusy((n) => n + 1);
    try { await send(path, 'PATCH', body); setFlash({ tone: 'ok', msg: ok }); h.reload(); } catch (e) { setFlash({ tone: 'bad', msg: e.message }); } finally { setBusy((n) => n - 1); }
  };
  const tickets = h.maint.rows
    .filter((m) => tab === 'All' || (tab === 'Resolved' ? m.status === 'Completed' : m.status === tab))
    .sort((a, b) => (['Pending', 'In Progress'].includes(a.status) ? 0 : 1) - (['Pending', 'In Progress'].includes(b.status) ? 0 : 1) || RANK[a.priority] - RANK[b.priority] || b.request_id - a.request_id);
  const count = (s) => h.maint.rows.filter((m) => m.status === s).length;
  const rooms = h.rooms.rows;
  const roomCount = (s) => rooms.filter((r) => roomState(r) === s).length;
  const monitor = rooms.filter((r) => roomTab === 'All' || roomState(r) === roomTab).slice(0, 6);
  const visitors = h.visitors.rows.filter((v) => !vq || `${v.visitor_name} ${v.student_name}`.toLowerCase().includes(vq.toLowerCase()));
  const log = [
    ...h.visitors.rows.flatMap((v) => [{ t: v.check_in_time, text: `Visitor ${v.visitor_name} signed in to see ${v.student_name} (${v.room_label}).`, icon: 'login' },
      ...(v.check_out_time ? [{ t: v.check_out_time, text: `Visitor ${v.visitor_name} signed out.`, icon: 'logout' }] : [])]),
    ...h.maint.rows.filter((m) => m.request_date === h.today).map((m) => ({ t: '', text: `Maintenance #${m.request_id} logged for ${m.room_label}: ${m.description}`, icon: 'build' })),
    ...h.maint.rows.filter((m) => m.completion_date === h.today).map((m) => ({ t: '', text: `Maintenance #${m.request_id} completed for ${m.room_label}.`, icon: 'task_alt' })),
  ].sort((a, b) => String(b.t).localeCompare(String(a.t)));

  return (
    <div className="mx-auto grid max-w-[1400px] gap-space-lg">
      <Card className="flex flex-wrap items-start justify-between gap-space-md">
        <div>
          <div className="flex flex-wrap items-center gap-space-sm text-body-sm text-on-surface-variant"><span className="rounded bg-status-available/10 px-2 py-0.5 font-label-caps text-label-caps uppercase text-emerald-700">Hostel operations centre</span>{fmtDate(h.today)}</div>
          <h1 className="mt-space-sm font-headline-lg text-headline-lg">Welcome back, {who}!</h1>
          <p className="mt-1 flex items-center gap-space-xs text-body-md text-on-surface-variant"><Icon n="schedule" className="text-[18px]" />Daily operations overview for <b className="text-on-surface">{hostel.name}</b></p>
        </div>
        <div className="flex flex-wrap gap-space-sm">
          <button type="button" className={btn.primary} onClick={() => setForm('visitors')}><Icon n="person_add" className="text-[18px]" />Register Visitor</button>
          <button type="button" className={btn.ghost} onClick={() => setForm('maintenance')}><Icon n="build" className="text-[18px]" />Log Defect</button>
          <button type="button" className={btn.ghost} onClick={() => window.print()}><Icon n="receipt_long" className="text-[18px]" />Print Inspection</button>
        </div>
      </Card>
      {h.error && <Notice onRetry={h.reload}>Could not load hostel data: {h.error}</Notice>}
      {flash.msg && <Notice tone={flash.tone} onClose={() => setFlash({ tone: 'ok', msg: '' })}>{flash.msg}</Notice>}

      <div className="grid grid-cols-2 gap-space-md md:grid-cols-4 2xl:grid-cols-7">
        <Metric label="Total rooms" value={rooms.length} icon="door_front" chip="bg-surface-container-high text-on-surface" />
        <Metric label="Occupied beds" value={h.occupied} icon="bed" note={`${h.rate}% capacity`} />
        <Metric label="Vacant beds" value={h.free} icon="check_circle" chip="bg-status-available/10 text-emerald-700" note="Free bed spaces" />
        <Metric label="Active tenants" value={h.active.length} icon="school" note="Active bookings" />
        <Metric label="Defects pending" value={count('Pending')} icon="warning" chip="bg-status-pending/15 text-momo-mtn-accent" note="Need dispatch" />
        <Metric label="Work in hand" value={count('In Progress')} icon="engineering" chip="bg-primary-fixed text-primary" note="In progress" />
        <Metric label="Visitors in" value={h.onPremise.length} icon="badge" chip="bg-secondary-fixed text-secondary" note="On premise now" />
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div><span className="rounded bg-primary-fixed px-2 py-0.5 font-label-caps text-label-caps uppercase text-on-primary-fixed-variant">Complex directory</span>
            <h2 className="mt-space-sm font-headline-md text-headline-md">{hostel.name} Occupancy</h2>
            <p className="text-body-md text-on-surface-variant">{hostel.address || 'No address recorded'} · Warden: {hostel.warden_name}</p></div>
          <div className="rounded-lg bg-primary-fixed p-space-md text-on-primary-fixed-variant"><div className="font-label-caps text-label-caps uppercase">Current density</div><b>{h.occupied} / {h.capacity} total beds</b></div>
        </div>
        <div className="mt-space-md flex justify-between font-label-lg"><span>Overall allocation</span><span>{h.occupied} occupied / {h.free} vacant</span></div>
        <Progress pct={h.rate} className="mt-1 h-3" />
        <div className="mt-space-md grid gap-space-md sm:grid-cols-2 lg:grid-cols-3">{h.groups.map((g) => (
          <div key={g.capacity} className="rounded-lg bg-surface-container-low p-space-md"><div className="flex justify-between gap-space-sm"><b>{g.capacity}-bed rooms</b><Badge tone={g.occupied >= g.beds ? 'bad' : 'ok'}>{g.occupied}/{g.beds}</Badge></div><div className="text-body-sm text-on-surface-variant">{g.rooms} room(s)</div></div>))}</div>
      </Card>

      <div className="grid gap-space-lg xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHead icon="plumbing" title="Maintenance Tickets" sub="Hostel defects needing attention." right={<button type="button" onClick={() => go('maintenance')} className="border-0 bg-transparent font-label-lg text-primary hover:underline">View all {h.maint.rows.length} records</button>} />
          <div className="mb-space-md flex flex-wrap gap-space-sm" role="group" aria-label="Ticket filter">{TABS.map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={cx('rounded-full border-0 px-3 py-1.5 text-label-md', tab === t ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container')}>{t}{t !== 'All' && ` (${t === 'Resolved' ? count('Completed') : count(t)})`}</button>))}</div>
          <div className="grid gap-space-md">
            {tickets.slice(0, 8).map((m) => (
              <article key={m.request_id} className="rounded-lg bg-surface-container-low p-space-md">
                <div className="flex flex-wrap items-center gap-space-sm"><span className="rounded bg-primary-fixed px-2 py-0.5 font-label-md text-on-primary-fixed-variant">#{m.request_id}</span><b>{m.room_label}</b><span className="text-body-sm text-on-surface-variant">· {m.reported_by_name}</span><span className="ml-auto flex gap-space-xs"><Badge>{m.priority}</Badge><Badge>{m.status}</Badge></span></div>
                <p className="mt-space-sm font-label-lg">{m.description}</p>
                <p className="text-body-sm text-on-surface-variant">Reported {fmtDate(m.request_date)} · {m.assigned_to_name ? `Assigned to ${m.assigned_to_name}` : 'Not assigned'}{m.completion_date ? ` · Completed ${fmtDate(m.completion_date)}` : ''}</p>
                <div className="mt-space-sm flex flex-wrap justify-end gap-space-xs">
                  {canMaint && m.status === 'Pending' && <button type="button" className={btn.smallGhost} onClick={() => { setAssign(m); setArtisan(m.assigned_to ? String(m.assigned_to) : ''); }}>Assign Artisan</button>}
                  {canMaint && m.status === 'Pending' && <button type="button" className={btn.small} disabled={busy > 0} onClick={() => patch(`/maintenance/${m.request_id}/`, { status: 'In Progress' }, `Ticket #${m.request_id} is now In Progress.`)}>Mark In Progress</button>}
                  {canMaint && m.status === 'In Progress' && <button type="button" className={btn.small} disabled={busy > 0} onClick={() => window.confirm(`Mark ticket #${m.request_id} as resolved?`) && patch(`/maintenance/${m.request_id}/`, { status: 'Completed', completion_date: todayIso() }, `Ticket #${m.request_id} resolved.`)}>Mark as Resolved</button>}
                  <button type="button" className={btn.smallGhost} onClick={() => setDetail(m)}>Details</button>
                </div>
              </article>))}
            {h.maint.loaded && tickets.length === 0 && <p className="rounded-lg border border-dashed border-outline-variant p-space-lg text-center text-body-md text-on-surface-variant">No tickets in this view.</p>}
          </div>
        </Card>

        <Card>
          <CardHead icon="meeting_room" title="Room Quick Monitor" sub="Live allocation and vacancy." right={<button type="button" onClick={() => go('rooms')} className="border-0 bg-transparent font-label-lg text-primary hover:underline">Open directory</button>} />
          <div className="mb-space-md flex flex-wrap gap-space-sm" role="group" aria-label="Room filter">{['All', 'Vacant', 'Partial', 'Full'].map((t) => (
            <button key={t} type="button" aria-pressed={roomTab === t} onClick={() => setRoomTab(t)} className={cx('rounded-full border-0 px-3 py-1.5 text-label-md', roomTab === t ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container')}>{t} ({t === 'All' ? rooms.length : roomCount(t)})</button>))}</div>
          <ul className="grid gap-space-sm">{monitor.map((r) => (
            <li key={r.room_id} className="rounded-lg bg-surface-container-low p-space-md">
              <div className="flex items-center justify-between gap-space-sm"><b>Room {r.room_number} <span className="font-normal text-body-sm text-on-surface-variant">· {r.capacity}-bed</span></b><Badge tone={r.status === 'Maintenance' ? 'warn' : ROOM_TONE[roomState(r)]}>{r.status === 'Maintenance' ? 'Under repair' : roomState(r)}</Badge></div>
              <div className="flex justify-between gap-space-sm text-body-sm text-on-surface-variant"><span className="truncate">{(h.residents.get(r.room_id) || []).join(', ') || 'No residents'}</span><span className="shrink-0">{r.occupied_spaces}/{r.capacity} beds</span></div>
            </li>))}
            {h.rooms.loaded && monitor.length === 0 && <li className="text-body-md text-on-surface-variant">No rooms in this view.</li>}</ul>
        </Card>
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-space-md p-space-lg pb-space-md">
          <CardHead icon="badge" title="Daily Visitor Registry" sub={`Gate lodge records for ${fmtDate(h.today)}.`} />
          <div className="flex gap-space-sm">
            <label className="flex items-center gap-space-xs rounded-lg bg-surface-container-low px-space-sm ring-1 ring-inset ring-outline-variant"><Icon n="search" className="text-[18px] text-outline" /><input value={vq} onChange={(e) => setVq(e.target.value)} placeholder="Search visitor or student…" aria-label="Search visitors" className="w-48 border-0 bg-transparent py-2 text-body-md outline-none" /></label>
            <button type="button" className={btn.primary} onClick={() => setForm('visitors')}><Icon n="add" className="text-[18px]" />Quick Check-in</button>
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left">
          <thead><tr className="bg-surface-container-low">{['Visitor', 'Resident visited', 'Contact', 'Sign-in', 'Purpose', 'Status', 'Action'].map((t) => <th key={t} className="px-space-md py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{t}</th>)}</tr></thead>
          <tbody>{visitors.map((v) => (
            <tr key={v.visitor_id} className="border-t border-outline-variant/40">
              <td className="px-space-md py-space-sm"><div className="flex items-center gap-space-sm"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-fixed text-[11px] font-bold text-primary">{initials(v.visitor_name)}</span><b>{v.visitor_name}</b></div></td>
              <td className="px-space-md py-space-sm text-body-md">{v.student_name}<div className="text-body-sm text-on-surface-variant">{v.room_label}</div></td>
              <td className="px-space-md py-space-sm text-body-md">{v.phone || '—'}</td>
              <td className="px-space-md py-space-sm font-semibold">{fmtTime(v.check_in_time)}</td>
              <td className="px-space-md py-space-sm text-body-md">{v.purpose || '—'}</td>
              <td className="px-space-md py-space-sm"><Badge tone={v.check_out_time ? 'mute' : 'ok'}>{v.check_out_time ? `Signed out ${fmtTime(v.check_out_time)}` : 'On premise'}</Badge></td>
              <td className="px-space-md py-space-sm">{canVisit && !v.check_out_time ? <button type="button" className={btn.smallGhost} disabled={busy > 0} onClick={() => patch(`/visitors/${v.visitor_id}/`, { check_out_time: nowTime() }, `${v.visitor_name} signed out.`)}>Sign Out</button> : <span className="text-body-sm text-outline">Archived</span>}</td>
            </tr>))}
            {h.visitors.loaded && visitors.length === 0 && <tr><td colSpan="7" className="p-space-lg text-center text-on-surface-variant">No visitors logged today.</td></tr>}</tbody></table></div>
      </Card>

      <Card>
        <CardHead icon="schedule" title="Today's Activity Log" sub="Visitors and repairs recorded today." />
        {log.length === 0 ? <p className="text-body-md text-on-surface-variant">Nothing recorded today.</p> : (
          <ol className="grid gap-space-sm">{log.map((e, i) => (
            <li key={i} className="flex items-start gap-space-md"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary"><Icon n={e.icon} className="text-[18px]" /></span>
              <p className="flex-1 text-body-md">{e.text}</p><span className="shrink-0 font-label-md text-primary">{fmtTime(e.t)}</span></li>))}</ol>)}
      </Card>

      {assign && (
        <Modal title={`Assign ticket #${assign.request_id}`} sub={`${assign.room_label}: ${assign.description}`} onClose={() => setAssign(null)}>
          <label className="grid gap-1 font-label-md text-on-surface-variant">Staff member
            <select className={fieldCls} value={artisan} onChange={(e) => setArtisan(e.target.value)}><option value="">Select…</option>{staff.rows.map((s) => <option key={s.staff_id} value={s.staff_id}>{s.first_name} {s.last_name} ({s.role})</option>)}</select></label>
          <button type="button" className={cx(btn.primary, 'mt-space-md w-full')} disabled={!artisan} onClick={() => { const m = assign; setAssign(null); patch(`/maintenance/${m.request_id}/`, { assigned_to: Number(artisan) }, `Ticket #${m.request_id} assigned.`); }}>Assign</button>
        </Modal>)}
      {detail && <Details record={detail} onClose={() => setDetail(null)} />}
      {form && <RecordForm resource={form} isAdmin={false} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setFlash({ tone: 'ok', msg: m }); h.reload(); }} />}
    </div>
  );
}
