import { useState } from 'react';
import { money, toCsv } from '../api.js';
import { RecordForm } from '../forms.jsx';
import { Async, Badge, Card, CardHead, Icon, Metric, Notice, Progress, ago, btn, cx, useApi } from '../ui.jsx';

const STATUS_COLORS = { Pending: 'bg-status-pending', Active: 'bg-primary-container', Completed: 'bg-status-available', Cancelled: 'bg-status-occupied' };
const STATUS_NOTE = { Pending: 'Awaiting approval', Active: 'Currently in residence', Completed: 'Stay finished', Cancelled: 'Cancelled or rejected' };
const TABS = [['', 'All Logs'], ['bookings', 'Bookings'], ['payments', 'Payments'], ['maintenance', 'Maintenance'], ['students', 'Students']];
const ACTION_ICON = { create: 'add_circle', update: 'edit_note', delete: 'delete' };
const RES_ICON = { bookings: 'event_available', payments: 'payments', maintenance: 'build', students: 'school', visitors: 'group', hostels: 'apartment', rooms: 'meeting_room', staff: 'badge' };
const pct = (n, d) => (d ? Math.round((n * 1000) / d) / 10 : 0);

/** Admin / read-only overview (Stitch "administrative dashboard"), all numbers from GET /api/dashboard/. */
export default function AdminHome({ me, go }) {
  const dash = useApi('/dashboard/');
  const canAudit = (me.permissions.audit_logs || []).includes('read');
  const canBook = (me.permissions.bookings || []).includes('create');
  const [tab, setTab] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(false);
  const [flash, setFlash] = useState('');
  const logs = useApi(`/audit-logs/?page=${page}&page_size=5${tab ? `&resource=${tab}` : ''}`, canAudit);

  const d = dash.data;
  const pay = d?.payments;
  const byStatus = d?.bookings_by_status || {};
  const totalBookings = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const occ = d?.occupancy;

  const exportSummary = () => {
    const rows = [
      { metric: 'Total students', value: d.totals.students }, { metric: 'Total hostels', value: d.totals.hostels }, { metric: 'Total rooms', value: d.totals.rooms },
      { metric: 'Bed spaces', value: occ.capacity }, { metric: 'Occupied spaces (Active bookings)', value: occ.occupied_spaces },
      ...Object.entries(byStatus).map(([k, v]) => ({ metric: `Bookings ${k}`, value: v })),
      { metric: 'Open maintenance requests', value: d.open_maintenance },
      ...(pay ? [{ metric: 'Completed payments (UGX)', value: pay.completed_total }, { metric: 'Outstanding balance (UGX)', value: pay.outstanding_balance }] : []),
    ];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `sahms-summary-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto grid max-w-[1400px] gap-space-lg">
      <div className="flex flex-wrap items-end justify-between gap-space-md">
        <div>
          <span className="rounded bg-primary-fixed px-2 py-0.5 font-label-caps text-label-caps uppercase text-on-primary-fixed-variant">{me.is_superuser || me.roles.includes('Admin') ? 'System operations' : 'Read-only overview'}</span>
          <h1 className="mt-space-sm font-headline-lg text-headline-lg">Hostel Operations Overview</h1>
          <p className="text-body-md text-on-surface-variant">Live accommodation figures from the hostel database.</p>
        </div>
        <div className="flex flex-wrap gap-space-sm">
          <button type="button" className={btn.ghost} disabled={!d} onClick={exportSummary}><Icon n="file_download" className="text-[18px]" />Export Summary (CSV)</button>
          {canBook && <button type="button" className={btn.primary} onClick={() => setForm(true)}><Icon n="add_circle" className="text-[18px]" />Create Booking</button>}
        </div>
      </div>
      {flash && <Notice tone="ok" onClose={() => setFlash('')}>{flash}</Notice>}
      {dash.error && <Notice onRetry={dash.reload}>Could not load the dashboard: {dash.error}</Notice>}

      {d && (
        <>
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Total Students" value={d.totals.students.toLocaleString()} icon="school" note="Registered students" />
            <Metric label="Total Hostels" value={d.totals.hostels} icon="apartment" chip="bg-surface-container-high text-on-surface" note={`${d.totals.rooms} room(s)`} />
            <Metric label="Total Rooms" value={d.totals.rooms.toLocaleString()} icon="door_front" chip="bg-surface-container-high text-on-surface" note={`${occ.capacity.toLocaleString()} bed spaces`} tag={d.totals.rooms ? `Avg ${(occ.capacity / d.totals.rooms).toFixed(2)} bed/room` : ''} />
            <Metric label="Active Bookings" value={(byStatus.Active || 0).toLocaleString()} icon="verified" chip="bg-status-available/10 text-emerald-700" note="Students in residence" tag={`${occ.rate_percent}% occupied`} tagTone="text-emerald-700" />
            <Metric label="Pending Bookings" value={(byStatus.Pending || 0).toLocaleString()} icon="hourglass_top" chip="bg-status-pending/15 text-momo-mtn-accent" note="Awaiting approval" tag={byStatus.Pending ? 'Requires action' : ''} tagTone="text-momo-mtn-accent" />
            {pay && <Metric label="Total Payments" value={money(pay.completed_total)} icon="account_balance_wallet" chip="bg-primary-fixed text-primary" note="Completed payments" tag={`${pay.pending_records_count} pending`} tagTone="text-primary" />}
            {pay && <Metric label="Outstanding Balances" value={money(pay.outstanding_balance)} icon="warning" chip="bg-error-container text-error" danger note={`${pay.settlement.partial + pay.settlement.unpaid} booking(s) with a balance`} tag="Arrears" tagTone="text-error" />}
            <Metric label="Pending Maintenance" value={d.open_maintenance} icon="home_repair_service" chip="bg-secondary-fixed text-secondary" note="Pending or In Progress" />
          </div>

          <div className="grid gap-space-lg xl:grid-cols-3">
            <Card>
              <CardHead icon="donut_large" title="Booking Status" sub="Every booking on record, by status." right={<span className="font-label-caps text-label-caps text-on-surface-variant">{totalBookings.toLocaleString()} RECORDS</span>} />
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container-high" role="img" aria-label="Booking status distribution">
                {Object.entries(byStatus).map(([s, n]) => n > 0 && <div key={s} className={STATUS_COLORS[s]} style={{ width: `${pct(n, totalBookings)}%` }} title={`${s}: ${n}`} />)}
              </div>
              <ul className="mt-space-md grid gap-space-sm">
                {Object.entries(byStatus).map(([s, n]) => (
                  <li key={s} className="flex items-center justify-between gap-space-sm">
                    <span className="flex items-center gap-space-sm font-label-lg"><span className={cx('h-2.5 w-2.5 rounded-full', STATUS_COLORS[s])} />{s}<span className="hidden text-body-sm font-normal text-on-surface-variant sm:inline">· {STATUS_NOTE[s]}</span></span>
                    <span className="font-label-lg">{n.toLocaleString()} <span className="ml-1 text-body-sm font-normal text-on-surface-variant">{pct(n, totalBookings)}%</span></span>
                  </li>
                ))}
              </ul>
              <div className="mt-space-md flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm px-space-md text-body-sm"><span className="text-on-surface-variant">Active residence headcount</span><b className="text-primary">{(byStatus.Active || 0).toLocaleString()} students</b></div>
            </Card>

            <Card>
              {pay ? (
                <>
                  <CardHead icon="payments" title="Payment Status" sub="Completed money against the agreed price of every non-cancelled booking." />
                  <div className="mb-1 flex justify-between font-label-lg text-label-lg"><span>Overall revenue cleared</span><span className="text-primary">{pay.cleared_percent}%</span></div>
                  <Progress pct={pay.cleared_percent} />
                  <ul className="mt-space-md grid gap-space-sm">
                    {[['Fully paid bookings', pay.settlement.fully_paid, 'bg-status-available'], ['Partly paid', pay.settlement.partial, 'bg-status-pending'], ['Unpaid', pay.settlement.unpaid, 'bg-status-occupied']].map(([l, n, c]) => (
                      <li key={l} className="flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm px-space-md"><span className="flex items-center gap-space-sm font-label-lg"><span className={cx('h-2.5 w-2.5 rounded-full', c)} />{l}</span><span className="font-label-lg">{n} <span className="text-body-sm font-normal text-on-surface-variant">({pct(n, pay.settlement.bookings)}%)</span></span></li>
                    ))}
                  </ul>
                  <p className="mb-space-xs mt-space-md font-label-caps text-label-caps uppercase text-on-surface-variant">Payment channels (completed)</p>
                  <div className="grid grid-cols-3 gap-space-sm text-center">
                    {Object.entries(pay.channels).map(([m, v]) => { const total = Object.values(pay.channels).reduce((a, b) => a + Number(b), 0); return (
                      <div key={m} className="rounded-lg bg-secondary-fixed p-space-sm"><div className="font-label-caps text-[10px] uppercase text-on-secondary-fixed-variant">{m}</div><div className="font-label-lg text-on-secondary-fixed">{pct(Number(v), total)}%</div></div>
                    ); })}
                  </div>
                  <div className="mt-space-md flex justify-between text-body-sm"><span className="text-on-surface-variant">Total collected</span><b>{money(pay.completed_total)}</b></div>
                </>
              ) : <CardHead icon="payments" title="Payment Status" sub="Your role cannot read payments." />}
            </Card>

            <Card>
              <CardHead icon="apartment" title="Hostel Occupancy" sub="Active bookings against bed capacity." right={<Badge tone="info">{occ.rate_percent}% overall</Badge>} />
              <Async state={{ ...dash, rows: occ.by_hostel }} empty="No hostels yet.">
                <ul className="grid gap-space-md">
                  {occ.by_hostel.map((h) => (
                    <li key={h.hostel_id}>
                      <div className="mb-1 flex justify-between gap-space-sm font-label-lg"><span className="truncate">{h.name}</span><span className="shrink-0 text-body-sm font-normal text-on-surface-variant">{h.occupied_spaces} / {h.capacity} ({h.occupancy}%)</span></div>
                      <Progress pct={h.occupancy} color={h.occupancy > 100 ? 'bg-error' : h.occupancy >= 90 ? 'bg-status-occupied' : 'bg-primary-container'} />
                    </li>
                  ))}
                </ul>
              </Async>
              {occ.overbooked_rooms > 0 && <p className="mt-space-md rounded-lg bg-error-container p-space-sm px-space-md text-body-sm text-on-error-container">{occ.overbooked_rooms} room(s) hold more Active bookings than their capacity.</p>}
              <div className="mt-space-md flex items-center justify-between rounded-lg bg-surface-container-low p-space-sm px-space-md text-body-sm"><span className="text-on-surface-variant">Available capacity</span><b className="text-emerald-700">{occ.available_spaces} free bed space(s)</b></div>
            </Card>
          </div>

          {pay && pay.review.flagged_bookings_count > 0 && (
            <Card>
              <CardHead icon="rule" title="Payments needing review" sub={`${pay.review.flagged_bookings_count} booking(s), overpaid in total ${money(pay.review.overpaid_total)}. Payments stay as recorded; resolve with the Refunded status if needed.`} />
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-body-md">
                <thead><tr className="bg-surface-container-low">{['Student', 'Hostel / room', 'Agreed', 'Completed', 'Overpaid by', 'Why'].map((h) => <th key={h} className="px-space-md py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{h}</th>)}</tr></thead>
                <tbody>{pay.review.items.map((f) => (
                  <tr key={f.booking_id} className="border-t border-outline-variant/40"><td className="px-space-md py-space-sm"><b>{f.student}</b><div className="text-body-sm text-on-surface-variant">{f.student_reg_number}</div></td>
                    <td className="px-space-md py-space-sm">{f.hostel} {f.room}</td><td className="px-space-md py-space-sm">{money(f.agreed_price)}</td><td className="px-space-md py-space-sm">{money(f.completed_payments)}</td><td className="px-space-md py-space-sm font-semibold">{money(f.overpaid_by)}</td><td className="px-space-md py-space-sm">{f.reasons.join('; ')}</td></tr>
                ))}</tbody></table></div>
            </Card>
          )}

          <Card className="p-0">
            <div className="flex flex-wrap items-start justify-between gap-space-md p-space-lg pb-space-md">
              <CardHead icon="list_alt" title={canAudit ? 'Recent System Activities' : 'Recent Bookings'} sub={canAudit ? 'Live audit trail of changes made through the system.' : 'The five newest bookings.'} />
              {canAudit && (
                <div role="group" aria-label="Filter activity" className="inline-flex flex-wrap rounded-lg bg-surface-container-low p-1">
                  {TABS.map(([k, l]) => <button key={l} type="button" aria-pressed={tab === k} onClick={() => { setTab(k); setPage(1); }} className={cx('rounded-md border-0 px-3 py-1.5 text-label-md', tab === k ? 'bg-surface-container-lowest text-primary shadow-sm' : 'bg-transparent text-on-surface-variant')}>{l}</button>)}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              {canAudit ? (
                <Async state={{ ...logs, rows: logs.data?.results || [] }} empty="No activity recorded yet.">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead><tr className="bg-surface-container-low">{['Activity', 'Description', 'Affected record', 'Initiated by', 'When'].map((h) => <th key={h} className="px-space-lg py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{h}</th>)}</tr></thead>
                    <tbody>{(logs.data?.results || []).map((e) => (
                      <tr key={e.id} className="border-t border-outline-variant/40">
                        <td className="px-space-lg py-space-md"><div className="flex items-center gap-space-sm"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-fixed text-primary"><Icon n={RES_ICON[e.resource] || ACTION_ICON[e.action] || 'history'} className="text-[20px]" /></span><div><b className="capitalize">{e.action} · {e.resource}</b></div></div></td>
                        <td className="px-space-lg py-space-md text-body-md">{e.description || '—'}{e.changed_fields?.length > 0 && <div className="text-body-sm text-on-surface-variant">Fields: {e.changed_fields.join(', ')}</div>}</td>
                        <td className="px-space-lg py-space-md text-body-md">#{e.entity_id}</td>
                        <td className="px-space-lg py-space-md text-body-md">{e.actor_username || 'System'}</td>
                        <td className="px-space-lg py-space-md text-body-md"><div>{ago(e.timestamp)}</div><div className="text-body-sm text-on-surface-variant">{new Date(e.timestamp).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div></td>
                      </tr>))}</tbody>
                  </table>
                </Async>
              ) : (
                <table className="w-full min-w-[640px] border-collapse text-left">
                  <thead><tr className="bg-surface-container-low">{['Student', 'Hostel / room', 'Start', 'Amount', 'Status'].map((h) => <th key={h} className="px-space-lg py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{h}</th>)}</tr></thead>
                  <tbody>{d.recent_bookings.map((b) => (
                    <tr key={b.booking_id} className="border-t border-outline-variant/40"><td className="px-space-lg py-space-md"><b>{b.student_name}</b><div className="text-body-sm text-on-surface-variant">{b.student_reg_number}</div></td><td className="px-space-lg py-space-md">{b.hostel_name} {b.room_number}</td><td className="px-space-lg py-space-md">{b.start_date}</td><td className="px-space-lg py-space-md font-semibold">{money(b.agreed_price)}</td><td className="px-space-lg py-space-md"><Badge>{b.status}</Badge></td></tr>
                  ))}{d.recent_bookings.length === 0 && <tr><td colSpan="5" className="p-space-lg text-center text-on-surface-variant">No bookings yet.</td></tr>}</tbody>
                </table>
              )}
            </div>
            {canAudit && logs.data && (
              <div className="flex items-center justify-between gap-space-sm p-space-lg pt-space-md text-body-sm text-on-surface-variant">
                <span>Showing {logs.data.results.length} of {logs.data.count} activities</span>
                <div className="flex gap-space-xs"><button type="button" className={btn.smallGhost} disabled={!logs.data.previous} onClick={() => setPage(page - 1)}>Previous</button><span className="rounded-lg bg-primary-container px-3 py-1.5 font-label-md text-on-primary">{page}</span><button type="button" className={btn.smallGhost} disabled={!logs.data.next} onClick={() => setPage(page + 1)}>Next</button></div>
              </div>
            )}
            <div className="border-t border-outline-variant/40 p-space-md text-center"><button type="button" onClick={() => go(canAudit ? 'audit-logs' : 'bookings')} className="border-0 bg-transparent font-label-lg text-primary hover:underline">{canAudit ? 'Open the full audit log' : 'Open all bookings'}</button></div>
          </Card>
        </>
      )}
      {!d && !dash.error && <div className="grid gap-space-md sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-container-high" />)}</div>}
      {form && <RecordForm resource="bookings" isAdmin={me.roles.includes('Admin')} onClose={() => setForm(false)} onSaved={(m) => { setForm(false); setFlash(m); dash.reload(); }} />}
    </div>
  );
}
