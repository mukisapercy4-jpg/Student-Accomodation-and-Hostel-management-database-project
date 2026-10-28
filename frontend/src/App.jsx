import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, Users, Building2, BedDouble, ClipboardList, CreditCard, Wrench,
  UserRound, Search, MapPin, LogOut, Clock3, CheckCircle2, Eye, X, Download, RefreshCw, Plus, Pencil,
} from 'lucide-react';
import './App.css';
import { api, ApiError, fetchAll, money, toCsv, tokenStore } from './api.js';
import { FORMS, RecordForm } from './forms.jsx';

const NAV = [
  ['Dashboard', LayoutDashboard, null],
  ['Students', Users, 'students'],
  ['Hostels', Building2, 'hostels'],
  ['Rooms', BedDouble, 'rooms'],
  ['Bookings', ClipboardList, 'bookings'],
  ['Payments', CreditCard, 'payments'],
  ['Maintenance', Wrench, 'maintenance'],
  ['Visitors', UserRound, 'visitors'],
  ['Staff', Users, 'staff'],
];

const COLUMNS = {
  students: [['reg_number', 'Reg no.'], ['first_name', 'First name'], ['last_name', 'Last name'], ['gender', 'Gender'], ['program', 'Programme'], ['year_of_study', 'Year']],
  hostels: [['name', 'Hostel'], ['address', 'Address'], ['warden_name', 'Warden'], ['capacity', 'Capacity'], ['occupied_spaces', 'Occupied'], ['occupancy', 'Occupancy %']],
  rooms: [['hostel_name', 'Hostel'], ['room_number', 'Room'], ['capacity', 'Capacity'], ['occupied_spaces', 'Occupied'], ['price_per_semester', 'Price / semester']],
  bookings: [['student_reg_number', 'Reg no.'], ['student_name', 'Student'], ['hostel_name', 'Hostel'], ['room_number', 'Room'], ['start_date', 'Start'], ['end_date', 'End'], ['status', 'Status'], ['agreed_price', 'Agreed price']],
  payments: [['payment_id', 'ID'], ['student_name', 'Student'], ['booking_label', 'Booking'], ['amount', 'Amount'], ['payment_date', 'Date'], ['payment_method', 'Method'], ['reference_number', 'Reference'], ['payment_status', 'Status']],
  maintenance: [['request_id', 'ID'], ['room_label', 'Room'], ['reported_by_name', 'Reported by'], ['assigned_to_name', 'Assigned to'], ['description', 'Description'], ['priority', 'Priority'], ['status', 'Status'], ['request_date', 'Requested']],
  staff: [['first_name', 'First name'], ['last_name', 'Last name'], ['role', 'Role'], ['phone', 'Phone'], ['email', 'Email'], ['employment_date', 'Employed']],
  visitors: [['visitor_name', 'Visitor'], ['student_name', 'Visiting'], ['room_label', 'Room'], ['visit_date', 'Date'], ['check_in_time', 'In'], ['check_out_time', 'Out'], ['purpose', 'Purpose']],
};
const MONEY_FIELDS = new Set(['agreed_price', 'amount', 'price_per_semester']);

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const data = await api('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) });
      tokenStore.set(data.token);
      onLogin(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit}>
        <h1>SAHMS</h1>
        <p>Sign in to the hostel management system</p>
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="formerror">{error}</div>}
        <button className="primary" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

function Stat({ icon: Icon, title, value, note, tone }) {
  return (
    <article className="stat">
      <div className="stathead"><span className={`staticon ${tone}`}><Icon size={20} /></span></div>
      <p>{title}</p>
      <div className="statvalue">{value}</div>
      <small>{note}</small>
    </article>
  );
}

const statusClass = (s) => ({ Active: 'confirmed', Completed: 'confirmed', Pending: 'pending', 'In Progress': 'pending', Cancelled: 'cancelled', Failed: 'cancelled', Refunded: 'cancelled' }[s] || 'pending');

function BookingStatus({ s }) {
  return <span className={`status ${statusClass(s)}`}>{['Pending', 'In Progress'].includes(s) ? <Clock3 size={12} /> : <CheckCircle2 size={12} />} {s}</span>;
}

function Dashboard({ data, can }) {
  const { totals, occupancy, payments, bookings_by_status: byStatus, recent_bookings: recent } = data;
  return (
    <>
      <section className={`stats ${payments ? 'five' : ''}`}>
        <Stat icon={Users} title="Total students" value={totals.students.toLocaleString()} note="Registered students" tone="blue" />
        <Stat icon={Building2} title="Registered hostels" value={String(totals.hostels).padStart(2, '0')} note={`${totals.rooms} room(s)`} tone="purple" />
        <Stat icon={BedDouble} title="Room occupancy" value={`${occupancy.rate_percent}%`} note={`${occupancy.occupied_spaces} of ${occupancy.capacity} spaces (Active bookings only)`} tone="green" />
        {payments && <Stat icon={CreditCard} title="Outstanding Balance" value={money(payments.outstanding_balance)} note="Agreed price minus completed payments" tone="orange" />}
        {payments && <Stat icon={Clock3} title="Pending payment records" value={money(payments.pending_records_total)} note={`${payments.pending_records_count} record(s) awaiting completion`} tone="blue" />}
      </section>
      {payments && payments.review.flagged_bookings_count > 0 && (
        <section className="panel">
          <div className="panelhead"><div><h2>Payments needing review</h2>
            <p>{payments.review.flagged_bookings_count} booking(s) · overpaid in total {money(payments.review.overpaid_total)}. Payments are kept as recorded; resolve each with the existing Refunded status if needed.</p></div></div>
          <div className="tablewrap"><table>
            <thead><tr><th>STUDENT</th><th>HOSTEL / ROOM</th><th>AGREED</th><th>COMPLETED</th><th>OVERPAID BY</th><th>WHY</th></tr></thead>
            <tbody>{payments.review.items.map((f) => (
              <tr key={f.booking_id}>
                <td><b>{f.student}</b><small>{f.student_reg_number}</small></td>
                <td><b>{f.hostel}</b><small>{f.room}</small></td>
                <td>{money(f.agreed_price)}</td><td>{money(f.completed_payments)}</td>
                <td><b>{money(f.overpaid_by)}</b></td><td>{f.reasons.join('; ')}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
      <section className="middle">
        <article className="panel">
          <div className="panelhead"><div><h2>Occupancy by hostel</h2><p>Active bookings against room capacity</p></div></div>
          {occupancy.by_hostel.length === 0 && <p className="empty">No hostels yet.</p>}
          <div className="chart"><div className="plot"><div className="bars">
            {occupancy.by_hostel.map((h) => (
              <div className="bar" key={h.hostel_id}>
                <div className="bartrack"><span style={{ height: `${Math.min(h.occupancy, 100)}%` }}><b>{h.occupancy}%</b></span></div>
                <small>{h.name}</small>
              </div>
            ))}
          </div></div></div>
          {occupancy.overbooked_rooms > 0 && <div className="chartfoot">⚠ {occupancy.overbooked_rooms} room(s) hold more Active bookings than their capacity.</div>}
        </article>
        <article className="panel">
          <div className="panelhead"><div><h2>Bookings by status</h2><p>All bookings on record</p></div></div>
          <div className="activity">
            {Object.entries(byStatus).map(([s, n]) => (
              <div className="activityrow" key={s}><div><b>{s}</b><p>{n} booking(s)</p></div></div>
            ))}
            <div className="activityrow"><div><b>Open maintenance</b><p>{data.open_maintenance} request(s)</p></div></div>
          </div>
        </article>
      </section>
      <section className="panel hostels">
        <div className="panelhead"><div><h2>Hostels</h2><p>Occupancy and capacity at a glance</p></div></div>
        <div className="hostelgrid">
          {occupancy.by_hostel.map((h, i) => (
            <article className="hostelcard" key={h.hostel_id}>
              <div className={`building ill${i % 3}`}><span>HOSTEL {String(i + 1).padStart(2, '0')}</span></div>
              <div className="hostelinfo">
                <div className="hosteltitle"><h3>{h.name}</h3></div>
                <p className="location"><MapPin size={13} />{h.address || 'No address recorded'}</p>
                <div className="metrics">
                  <div><small>Occupancy</small><b>{h.occupancy}%</b></div>
                  <div><small>Warden</small><b>{h.warden_name}</b></div>
                </div>
                <div className="progress"><i style={{ width: `${Math.min(h.occupancy, 100)}%` }} /></div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {can('bookings') && (
        <section className="panel bookings">
          <div className="panelhead"><div><h2>Recent bookings</h2><p>Latest five</p></div></div>
          <div className="tablewrap"><table>
            <thead><tr><th>STUDENT</th><th>HOSTEL / ROOM</th><th>START</th><th>AMOUNT</th><th>STATUS</th></tr></thead>
            <tbody>
              {recent.map((b) => (
                <tr key={b.booking_id}>
                  <td><b>{b.student_name}</b><small>{b.student_reg_number}</small></td>
                  <td><b>{b.hostel_name}</b><small>{b.room_number}</small></td>
                  <td>{b.start_date}</td><td><b>{money(b.agreed_price)}</b></td>
                  <td><BookingStatus s={b.status} /></td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan="5" className="empty">No bookings yet.</td></tr>}
            </tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

const label = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const show = (k, v) => (v === null || v === undefined || v === '' ? '—' : MONEY_FIELDS.has(k) ? money(v) : typeof v === 'object' ? JSON.stringify(v) : String(v));

function Details({ record, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Record details">
        <div className="drawerhead"><h2>Record details</h2><button className="iconbtn" onClick={onClose} title="Close"><X size={18} /></button></div>
        <dl>{Object.entries(record).map(([k, v]) => (
          <div key={k}><dt>{label(k)}</dt><dd>{show(k, v)}</dd></div>
        ))}</dl>
      </aside>
    </div>
  );
}

function ModuleTable({ resource, q, name, me }) {
  const [state, setState] = useState({ loading: true, rows: [], count: 0, error: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState(null); // {record?}
  const [flash, setFlash] = useState('');
  const perms = me.permissions[resource] || [];
  const canCreate = perms.includes('create') && !!FORMS[resource];
  const canUpdate = perms.includes('update');
  const isAdmin = me.roles.includes('Admin');
  const pageSize = state.rows.length && state.count > state.rows.length ? state.pageSize : 25;

  useEffect(() => { setPage(1); }, [q, resource]);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('search', q);
    api(`/${resource}/?${params}`)
      .then((d) => live && setState({ loading: false, rows: d.results, count: d.count, pageSize: d.results.length > 0 && d.next ? d.results.length : 25, error: '' }))
      .catch((e) => live && setState({ loading: false, rows: [], count: 0, error: e.message }));
    return () => { live = false; };
  }, [resource, page, q, tick]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAll(resource, q);
      const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `sahms-${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setState((s) => ({ ...s, error: e.message })); } finally { setExporting(false); }
  };

  const act = async (path, body, okMsg) => {
    try { await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); setFlash(okMsg); setTick((t) => t + 1); }
    catch (e) { setState((s) => ({ ...s, error: e.message })); }
  };
  const patchStatus = async (id, status) => {
    try { await api(`/${resource}/${id}/`, { method: 'PATCH', body: JSON.stringify({ payment_status: status }) }); setFlash(`Payment marked ${status}.`); setTick((t) => t + 1); }
    catch (e) { setState((s) => ({ ...s, error: e.message })); }
  };
  const rowActions = (r) => {
    if (!canUpdate) return null;
    if (resource === 'bookings' && ['Pending', 'Active'].includes(r.status)) {
      return <button className="linkbtn danger" onClick={() => window.confirm(`Cancel booking #${r.booking_id} for ${r.student_name}?`) && act(`/bookings/${r.booking_id}/cancel/`, null, 'Booking cancelled.')}>Cancel</button>;
    }
    if (resource === 'payments') {
      const next = { Pending: ['Completed', 'Failed'], Completed: ['Refunded'] }[r.payment_status] || [];
      return next.map((n) => <button key={n} className="linkbtn" onClick={() => window.confirm(`Mark payment ${r.payment_id} as ${n}?`) && patchStatus(r.payment_id, n)}>{n}</button>);
    }
    if (['students', 'maintenance', 'visitors'].includes(resource)) {
      return <button className="iconbtn" title="Edit" onClick={() => setForm({ record: r })}><Pencil size={15} /></button>;
    }
    return null;
  };

  const cols = COLUMNS[resource];
  return (
    <section className="panel bookings">
      <div className="panelhead"><div><h2>{name}</h2><p>{state.loading ? 'Loading…' : `${state.count} record(s)${q ? ` matching “${q}”` : ''}`}</p></div>
        <div className="actions">
          {canCreate && <button className="primary" onClick={() => setForm({})}><Plus size={14} /> New {FORMS[resource].noun}</button>}
          <button className="secondary" onClick={() => setTick((t) => t + 1)}><RefreshCw size={14} /> Refresh</button>
          <button className="secondary" onClick={exportCsv} disabled={exporting || state.count === 0}><Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}</button>
        </div></div>
      {flash && <div className="notice good">{flash}<button onClick={() => setFlash('')}>×</button></div>}
      {state.error && (
        <div className="notice">Could not load {name.toLowerCase()}: {state.error}
          <button onClick={() => setTick((t) => t + 1)}>Retry</button></div>
      )}
      <div className="tablewrap"><table>
        <thead><tr>{cols.map(([, l]) => <th key={l}>{l.toUpperCase()}</th>)}<th /></tr></thead>
        <tbody>
          {state.rows.map((r, i) => (
            <tr key={i}>{cols.map(([k]) => (
              <td key={k}>{k.endsWith('status') || k === 'status' ? <BookingStatus s={r[k]} /> : show(k, r[k])}</td>
            ))}<td className="rowactions">{rowActions(r)}<button className="iconbtn" title="View details" onClick={() => setSelected(r)}><Eye size={16} /></button></td></tr>
          ))}
          {!state.loading && !state.error && state.rows.length === 0 && <tr><td colSpan={cols.length + 1} className="empty">No records.</td></tr>}
        </tbody>
      </table></div>
      <div className="tablefoot">{state.count} record(s)
        <div>
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
          <button className="current">{page}</button>
          <button disabled={page * pageSize >= state.count} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
      {form && <RecordForm resource={resource} record={form.record} isAdmin={isAdmin} onClose={() => setForm(null)} onSaved={(m) => { setForm(null); setFlash(m); setTick((t) => t + 1); }} />}
      {selected && <Details record={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(!!tokenStore.get());
  const [active, setActive] = useState('Dashboard');
  const [q, setQ] = useState('');
  const [dash, setDash] = useState({ loading: false, data: null, error: '' });

  const logout = useCallback(() => { tokenStore.clear(); setMe(null); setDash({ loading: false, data: null, error: '' }); }, []);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me/').then(setMe).catch(() => tokenStore.clear()).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!me || active !== 'Dashboard') return;
    setDash((d) => ({ ...d, loading: true, error: '' }));
    api('/dashboard/')
      .then((data) => setDash({ loading: false, data, error: '' }))
      .catch((e) => { if (e instanceof ApiError && e.status === 401) logout(); else setDash({ loading: false, data: null, error: e.message }); });
  }, [me, active, logout]);

  if (checking) return <div className="loginwrap"><p>Loading…</p></div>;
  if (!me) return <Login onLogin={setMe} />;

  const can = (res) => (me.permissions[res] || []).includes('read');
  const nav = NAV.filter(([, , res]) => res === null || can(res));
  const resource = NAV.find(([n]) => n === active)?.[2];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><span><Building2 size={23} /></span><div><b>SAHMS</b><small>HOSTEL MANAGEMENT</small></div></div>
        <p className="label">WORKSPACE</p>
        <nav>{nav.map(([name, Icon]) => (
          <button key={name} className={active === name ? 'selected' : ''} onClick={() => { setActive(name); setQ(''); }}><Icon size={18} />{name}</button>
        ))}</nav>
        <div className="sidebarfoot">
          <div className="admin"><span>{me.username.slice(0, 2).toUpperCase()}</span><div><b>{me.username}</b><small>{me.roles.join(', ') || 'No role'}</small></div>
            <button className="iconbtn" title="Sign out" onClick={() => api('/auth/logout/', { method: 'POST' }).finally(logout)}><LogOut size={16} /></button></div>
        </div>
      </aside>
      <main>
        <header>
          <div className="crumb">Workspace <span>/</span> <b>{active}</b></div>
          <div className="headright">{resource && <label><Search size={16} /><input placeholder={`Search ${active.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} /></label>}</div>
        </header>
        <div className="content">
          <div className="welcome"><div><p className="eyebrow">● MANAGEMENT OVERVIEW</p><h1>{active}</h1></div></div>
          {active === 'Dashboard' && dash.loading && !dash.data && <p>Loading dashboard…</p>}
          {active === 'Dashboard' && dash.error && <div className="notice">Could not load the dashboard: {dash.error}</div>}
          {active === 'Dashboard' && dash.data && <Dashboard data={dash.data} can={can} />}
          {resource && <ModuleTable key={resource} resource={resource} q={q} name={active} me={me} />}
        </div>
      </main>
    </div>
  );
}
