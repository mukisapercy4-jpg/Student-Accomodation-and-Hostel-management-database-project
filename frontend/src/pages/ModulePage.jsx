import { useEffect, useState } from 'react';
import { api, fetchAll, money, toCsv } from '../api.js';
import { FORMS, RecordForm } from '../forms.jsx';
import MoMoCheckoutModal from '../components/MoMoCheckoutModal.jsx';
import RoomsGrid from '../components/RoomsGrid.jsx';
import { Badge, Card, Icon, Modal, Notice, btn, cx, fmtDate, fmtTime } from '../ui.jsx';

const COLUMNS = {
  students: [['reg_number', 'Reg no.'], ['first_name', 'First name'], ['last_name', 'Last name'], ['gender', 'Gender'], ['program', 'Programme'], ['year_of_study', 'Year']],
  staff: [['first_name', 'First name'], ['last_name', 'Last name'], ['role', 'Role'], ['phone', 'Phone'], ['email', 'Email'], ['employment_date', 'Employed']],
  hostels: [['name', 'Hostel'], ['address', 'Address'], ['warden_name', 'Warden'], ['capacity', 'Beds'], ['occupied_spaces', 'Occupied'], ['occupancy', 'Occupancy %']],
  rooms: [['hostel_name', 'Hostel'], ['room_number', 'Room'], ['capacity', 'Capacity'], ['occupied_spaces', 'Occupied'], ['status', 'Status'], ['price_per_semester', 'Price / semester']],
  bookings: [['student_reg_number', 'Reg no.'], ['student_name', 'Student'], ['hostel_name', 'Hostel'], ['room_number', 'Room'], ['start_date', 'Start'], ['end_date', 'End'], ['status', 'Status'], ['agreed_price', 'Agreed price']],
  payments: [['payment_id', 'ID'], ['student_name', 'Student'], ['booking_label', 'Booking'], ['amount', 'Amount'], ['payment_date', 'Date'], ['payment_method', 'Method'], ['reference_number', 'Reference'], ['payment_status', 'Status']],
  maintenance: [['request_id', 'ID'], ['room_label', 'Room'], ['reported_by_name', 'Reported by'], ['assigned_to_name', 'Assigned to'], ['description', 'Description'], ['priority', 'Priority'], ['status', 'Status'], ['request_date', 'Requested']],
  visitors: [['visitor_name', 'Visitor'], ['student_name', 'Visiting'], ['room_label', 'Room'], ['visit_date', 'Date'], ['check_in_time', 'In'], ['check_out_time', 'Out'], ['purpose', 'Purpose']],
  'audit-logs': [['timestamp', 'When'], ['actor_username', 'By'], ['action', 'Action'], ['resource', 'Resource'], ['entity_id', 'Record'], ['description', 'Description'], ['changed_fields', 'Fields']],
  'booking-status-history': [['timestamp', 'When'], ['booking_id', 'Booking'], ['old_status', 'From'], ['new_status', 'To'], ['actor_username', 'By'], ['reason', 'Reason']],
  'payment-status-history': [['timestamp', 'When'], ['payment_id', 'Payment'], ['old_status', 'From'], ['new_status', 'To'], ['actor_username', 'By'], ['reason', 'Reason']],
};
export const TITLES = {
  students: 'Students', staff: 'Staff', hostels: 'Hostels', rooms: 'Rooms', bookings: 'Bookings', payments: 'Payments',
  maintenance: 'Maintenance Requests', visitors: 'Visitors', 'audit-logs': 'Audit Logs', 'booking-status-history': 'Booking History', 'payment-status-history': 'Payment History',
};
const STATUS_FILTERS = {
  bookings: ['Pending', 'Active', 'Completed', 'Cancelled'], payments: ['Pending', 'Completed', 'Failed', 'Refunded'],
  maintenance: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
};
// API resource -> key in /auth/me/ permissions
const PERM_KEY = { 'audit-logs': 'audit_logs', 'booking-status-history': 'booking_history', 'payment-status-history': 'payment_history' };
const HOSTEL_SCOPED = new Set(['rooms', 'bookings', 'payments', 'maintenance', 'visitors']);
const MONEY = new Set(['agreed_price', 'amount', 'price_per_semester']);
const BADGE_KEYS = new Set(['status', 'payment_status', 'priority', 'old_status', 'new_status']);
const DATES = new Set(['timestamp']);

const label = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const show = (k, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (MONEY.has(k)) return money(v);
  if (DATES.has(k)) return new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  if (k.endsWith('_date')) return fmtDate(v);
  if (k.endsWith('_time')) return fmtTime(v);
  if (Array.isArray(v)) return v.join(', ') || '—';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
};

export function Details({ record, onClose }) {
  return (
    <Modal side title="Record details" onClose={onClose}>
      <dl className="grid gap-space-sm">
        {Object.entries(record).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-container-low p-space-sm px-space-md">
            <dt className="font-label-caps text-label-caps uppercase text-on-surface-variant">{label(k)}</dt>
            <dd className="mt-0.5 break-words text-body-md">{show(k, v)}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

/**
 * Generic list page for every API resource: search (top bar), status filter, paging, details,
 * CSV export, create/edit forms and the row actions the signed-in role is allowed to use.
 * The API enforces the same permissions; the buttons only mirror them.
 */
export default function ModulePage({ resource, me, q = '', hostelId = '', initialStatus = '', title }) {
  const [state, setState] = useState({ loading: true, rows: [], count: 0, error: '' });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(initialStatus);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [momoFor, setMomoFor] = useState(null);
  const [flash, setFlash] = useState('');
  const [exporting, setExporting] = useState(false);
  const [roomView, setRoomView] = useState('cards');

  const perms = me.permissions[PERM_KEY[resource] || resource] || [];
  const canCreate = perms.includes('create') && !!FORMS[resource];
  const canUpdate = perms.includes('update');
  const canPay = (me.permissions.momo_payments || []).includes('create');
  const isAdmin = me.roles.includes('Admin');
  const cols = COLUMNS[resource];
  const extra = () => {
    const p = {};
    if (status && STATUS_FILTERS[resource]) p.status = status;
    if (hostelId && HOSTEL_SCOPED.has(resource)) p.hostel = hostelId;
    return p;
  };

  useEffect(() => { setPage(1); }, [q, resource, status, hostelId]);
  useEffect(() => { setStatus(initialStatus); }, [initialStatus, resource]);

  useEffect(() => {
    if (resource === 'rooms' && roomView === 'cards') return undefined;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const params = new URLSearchParams({ page: String(page), ...extra() });
    if (q) params.set('search', q);
    api(`/${resource}/?${params}`)
      .then((d) => live && setState({ loading: false, rows: d.results, count: d.count, pageSize: d.next || d.previous ? Math.max(d.results.length, 25) : 25, error: '' }))
      .catch((e) => live && setState({ loading: false, rows: [], count: 0, error: e.message }));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, page, q, status, hostelId, tick, roomView]);

  const reload = () => setTick((t) => t + 1);
  const run = async (fn, ok) => {
    try { await fn(); setFlash(ok); reload(); } catch (e) { setState((s) => ({ ...s, error: e.message })); }
  };
  const post = (path, body) => api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAll(resource, q, 100, extra());
      const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `sahms-${resource}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setState((s) => ({ ...s, error: e.message })); } finally { setExporting(false); }
  };

  const rowActions = (r) => {
    if (!canUpdate) return null;
    if (resource === 'bookings' && ['Pending', 'Active'].includes(r.status)) {
      return (
        <>
          {r.status === 'Pending' && <button type="button" className={btn.small} onClick={() => window.confirm(`Approve booking #${r.booking_id} for ${r.student_name}?`) && run(() => post(`/bookings/${r.booking_id}/approve/`), 'Booking approved.')}>Approve</button>}
          {r.status === 'Pending' && <button type="button" className={btn.smallDanger} onClick={() => { const reason = window.prompt(`Reject booking #${r.booking_id}? Reason (optional):`); if (reason !== null) run(() => post(`/bookings/${r.booking_id}/reject/`, { reason }), 'Booking rejected.'); }}>Reject</button>}
          {canPay && <button type="button" className={btn.smallGhost} onClick={() => setMomoFor(r)}>Pay (MoMo)</button>}
          <button type="button" className={btn.smallDanger} onClick={() => window.confirm(`Cancel booking #${r.booking_id} for ${r.student_name}?`) && run(() => post(`/bookings/${r.booking_id}/cancel/`), 'Booking cancelled.')}>Cancel</button>
        </>
      );
    }
    if (resource === 'payments') {
      const next = { Pending: ['Completed', 'Failed'], Completed: ['Refunded'] }[r.payment_status] || [];
      return next.map((n) => <button key={n} type="button" className={btn.smallGhost} onClick={() => window.confirm(`Mark payment ${r.payment_id} as ${n}?`) && run(() => patch(`/payments/${r.payment_id}/`, { payment_status: n }), `Payment marked ${n}.`)}>{n}</button>);
    }
    if (['students', 'maintenance', 'visitors'].includes(resource)) {
      return <button type="button" className={btn.smallGhost} onClick={() => setForm({ record: r })}><Icon n="edit" className="text-[16px]" />Edit</button>;
    }
    return null;
  };

  const heading = title || TITLES[resource];
  const cards = resource === 'rooms' && roomView === 'cards';
  const pageSize = state.pageSize || 25;

  return (
    <div>
      <div className="mb-space-lg flex flex-wrap items-end justify-between gap-space-md">
        <div>
          <span className="font-label-caps text-label-caps uppercase text-primary">Live data</span>
          <h1 className="font-headline-lg text-headline-lg">{heading}</h1>
          <p className="text-body-md text-on-surface-variant">{cards ? 'Room cards' : state.loading ? 'Loading…' : `${state.count} record(s)${q ? ` matching “${q}”` : ''}`}</p>
        </div>
        <div className="flex flex-wrap gap-space-sm">
          {resource === 'rooms' && (
            <div role="group" aria-label="Rooms view" className="inline-flex rounded-lg bg-surface-container-low p-1">
              {['cards', 'table'].map((v) => <button key={v} type="button" aria-pressed={roomView === v} onClick={() => setRoomView(v)} className={cx('rounded-md border-0 px-3 py-1.5 text-label-md capitalize', roomView === v ? 'bg-surface-container-lowest text-primary shadow-sm' : 'bg-transparent text-on-surface-variant')}>{v}</button>)}
            </div>
          )}
          {canCreate && <button type="button" className={btn.primary} onClick={() => setForm({})}><Icon n="add" className="text-[18px]" />New {FORMS[resource].noun}</button>}
          {!cards && <button type="button" className={btn.ghost} onClick={reload}><Icon n="refresh" className="text-[18px]" />Refresh</button>}
          {!cards && <button type="button" className={btn.ghost} onClick={exportCsv} disabled={exporting || state.count === 0}><Icon n="download" className="text-[18px]" />{exporting ? 'Exporting…' : 'Export CSV'}</button>}
        </div>
      </div>

      {flash && <Notice tone="ok" onClose={() => setFlash('')}>{flash}</Notice>}
      {state.error && !cards && <Notice onRetry={reload}>Could not load {heading.toLowerCase()}: {state.error}</Notice>}

      {STATUS_FILTERS[resource] && (
        <div className="mb-space-md flex flex-wrap gap-space-sm" role="group" aria-label="Filter by status">
          {['', ...STATUS_FILTERS[resource]].map((s) => (
            <button key={s || 'all'} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}
              className={cx('rounded-full border-0 px-3 py-1.5 text-label-md', status === s ? 'bg-primary-container text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant ring-1 ring-inset ring-outline-variant hover:bg-surface-container')}>{s || 'All'}</button>
          ))}
        </div>
      )}

      {cards ? <RoomsGrid q={q} hostelId={hostelId} /> : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead><tr className="bg-surface-container-low">
                {cols.map(([, l]) => <th key={l} className="whitespace-nowrap px-space-md py-space-sm font-label-caps text-label-caps uppercase text-on-surface-variant">{l}</th>)}
                <th className="px-space-md py-space-sm" />
              </tr></thead>
              <tbody>
                {state.rows.map((r, i) => (
                  <tr key={i} className="border-t border-outline-variant/40 hover:bg-surface-container-low/60">
                    {cols.map(([k]) => (
                      <td key={k} className="max-w-[260px] px-space-md py-space-sm align-middle text-body-md">
                        {BADGE_KEYS.has(k) && r[k] ? <Badge>{r[k]}</Badge> : <span className="line-clamp-2">{show(k, r[k])}</span>}
                      </td>
                    ))}
                    <td className="px-space-md py-space-sm">
                      <div className="flex items-center justify-end gap-space-xs">{rowActions(r)}
                        <button type="button" title="View details" aria-label="View details" className="rounded-lg border-0 bg-transparent p-1.5 text-on-surface-variant hover:bg-surface-container" onClick={() => setSelected(r)}><Icon n="visibility" className="text-[20px]" /></button></div>
                    </td>
                  </tr>
                ))}
                {!state.loading && !state.error && state.rows.length === 0 && <tr><td colSpan={cols.length + 1} className="p-space-lg text-center text-on-surface-variant">No records.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-space-sm border-t border-outline-variant/40 p-space-md text-body-sm text-on-surface-variant">
            <span>{state.count} record(s)</span>
            <div className="flex items-center gap-space-xs">
              <button type="button" className={btn.smallGhost} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="rounded-lg bg-primary-container px-3 py-1.5 font-label-md text-on-primary">{page}</span>
              <button type="button" className={btn.smallGhost} disabled={page * pageSize >= state.count} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </Card>
      )}

      {form && <RecordForm resource={resource} record={form.record} isAdmin={isAdmin} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setFlash(m); reload(); }} />}
      {selected && <Details record={selected} onClose={() => setSelected(null)} />}
      {momoFor && <MoMoCheckoutModal booking={momoFor} onClose={() => { setMomoFor(null); reload(); }} onSettled={(m) => setFlash(m)} />}
    </div>
  );
}
