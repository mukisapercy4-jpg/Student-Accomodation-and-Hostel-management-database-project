import { useCallback, useEffect, useState } from 'react';
import { api, tokenStore } from './api.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './components/Login.jsx';
import Shell from './Shell.jsx';
import AdminHome from './pages/AdminHome.jsx';
import CaretakerHome from './pages/CaretakerHome.jsx';
import ModulePage, { TITLES } from './pages/ModulePage.jsx';
import StudentPortal from './pages/StudentPortal.jsx';
import WardenHome from './pages/WardenHome.jsx';
import { Icon, fieldCls, useRows } from './ui.jsx';

// [key (home | API resource), label, icon, permission needed to read, default status filter]
const I = (key, label, icon, perm = null, status = '') => ({ key, label, icon, perm, status });
const NAVS = {
  admin: [
    { title: 'Main', items: [I('home', 'Overview', 'dashboard')] },
    { title: 'Residence & Accommodation', items: [I('students', 'Students', 'school', 'students'), I('staff', 'Staff', 'badge', 'staff'), I('hostels', 'Hostels', 'apartment', 'hostels'), I('rooms', 'Rooms', 'meeting_room', 'rooms'), I('bookings', 'Bookings', 'event_available', 'bookings')] },
    { title: 'Financial & Operations', items: [I('payments', 'Payments', 'payments', 'payments'), I('maintenance', 'Maintenance Requests', 'build', 'maintenance'), I('visitors', 'Visitors', 'group', 'visitors')] },
    { title: 'System & Compliance', items: [I('audit-logs', 'Audit Logs', 'history_edu', 'audit_logs'), I('booking-status-history', 'Booking History', 'history', 'booking_history'), I('payment-status-history', 'Payment History', 'receipt_long', 'payment_history')] },
  ],
  warden: [{ items: [I('home', 'Overview', 'grid_view'), I('hostels', 'My Hostel', 'domain', 'hostels'), I('students', 'Students', 'school', 'students'), I('rooms', 'Rooms', 'bed', 'rooms'),
    I('bookings', 'Booking Management', 'event_available', 'bookings', 'Pending'), I('payments', 'Payments', 'payments', 'payments'), I('maintenance', 'Maintenance Requests', 'build_circle', 'maintenance'), I('visitors', 'Visitors', 'badge', 'visitors')] }],
  caretaker: [{ items: [I('home', 'Overview', 'grid_view'), I('hostels', 'My Hostel', 'domain', 'hostels'), I('rooms', 'Room Directory', 'meeting_room', 'rooms'), I('maintenance', 'Maintenance Requests', 'build', 'maintenance'), I('visitors', 'Visitors', 'badge', 'visitors'), I('students', 'Students', 'school', 'students')] }],
};
const KIND = { SUPER_ADMIN: 'admin', READ_ONLY: 'admin', MANAGER: 'warden', CARETAKER: 'caretaker' };
const BADGE = { SUPER_ADMIN: 'Super Admin', READ_ONLY: 'Read only', MANAGER: 'Warden', CARETAKER: 'Caretaker' };

// The API says where each role lands (/admin|manager|staff|student/dashboard). There is no router library:
// the address bar is updated and the role decides which screen renders.
const goHome = (m) => { if (m?.home) window.history.replaceState(null, '', m.home); };

function Staff({ me, onLogout }) {
  const kind = KIND[me.role] || 'admin';
  const scoped = kind !== 'admin';
  const hostels = useRows('hostels', {}, scoped);
  const [page, setPage] = useState({ key: 'home', status: '' });
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState('');
  const hostel = hostels.rows.find((h) => String(h.hostel_id) === String(picked || me.hostel?.hostel_id)) || hostels.rows[0] || null;
  const can = (perm) => !perm || (me.permissions[perm] || []).includes('read');
  const nav = NAVS[kind].map((s) => ({ ...s, items: s.items.filter((i) => can(i.perm)) })).filter((s) => s.items.length);
  const go = (key, status = '') => { setPage({ key, status }); setQ(''); };
  const item = nav.flatMap((s) => s.items).find((i) => i.key === page.key);
  const searchable = page.key !== 'home';
  const role = me.is_superuser ? 'Super Admin' : BADGE[me.role] || me.roles.join(', ');

  const pill = scoped && hostels.rows.length > 0 && (
    <><Icon n="apartment" className="text-[16px]" />
      <select aria-label="Hostel" value={hostel?.hostel_id ?? ''} onChange={(e) => setPicked(e.target.value)} className={`${fieldCls} !w-auto !bg-transparent !py-0.5 !ring-0 font-label-md`}>
        {hostels.rows.map((h) => <option key={h.hostel_id} value={h.hostel_id}>{h.name}</option>)}</select></>
  );

  let body;
  if (page.key === 'home') {
    body = kind === 'admin' ? <AdminHome me={me} go={go} /> : kind === 'warden' ? <WardenHome me={me} hostel={hostel} go={go} /> : <CaretakerHome me={me} hostel={hostel} go={go} />;
  } else {
    body = <ModulePage key={page.key} resource={page.key} me={me} q={q} hostelId={scoped && page.key !== 'hostels' ? hostel?.hostel_id : ''} initialStatus={page.status} title={item?.label} />;
  }

  return (
    <Shell brandSub={kind === 'admin' ? 'Accommodation System' : kind === 'warden' ? 'Hostel Warden Portal' : 'Caretaker Portal'} nav={nav} active={page.key} onNav={(k) => go(k, nav.flatMap((s) => s.items).find((i) => i.key === k)?.status || '')}
      name={me.staff?.name || me.username} roleBadge={role} subline={scoped ? hostel?.name : me.username} onLogout={onLogout}
      crumbRoot={kind === 'admin' ? 'SAHMS Console' : kind === 'warden' ? 'Warden Console' : 'Caretaker Console'} crumb={page.key === 'home' ? 'Overview' : item?.label || TITLES[page.key]}
      pill={pill} q={q} onSearch={searchable ? setQ : undefined}>
      <ErrorBoundary resetKey={`${page.key}-${hostel?.hostel_id}`}>{body}</ErrorBoundary>
    </Shell>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(!!tokenStore.get());
  const [notice, setNotice] = useState('');

  const logout = useCallback(() => { tokenStore.clear(); setMe(null); window.history.replaceState(null, '', '/'); }, []);
  const signOut = useCallback(() => api('/auth/logout/', { method: 'POST' }).catch(() => null).finally(logout), [logout]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api('/auth/me/').then((m) => { setMe(m); goHome(m); })
      .catch(() => { tokenStore.clear(); setNotice('Your session has expired. Please sign in again.'); })
      .finally(() => setChecking(false));
  }, []);

  // Sign in with JWT, then load /auth/me/ (role, permissions, student profile or staff/hostel context).
  const onLogin = async () => {
    try { const m = await api('/auth/me/'); setMe(m); setNotice(''); goHome(m); }
    catch (e) { tokenStore.clear(); setNotice(e.message || 'Could not load your profile.'); }
  };

  if (checking) return <div className="grid min-h-screen place-items-center bg-surface text-on-surface-variant">Loading…</div>;
  if (!me) return <Login onLogin={onLogin} notice={notice} />;
  if (me.role === 'STUDENT') return <ErrorBoundary title="The student portal hit an unexpected error."><StudentPortal me={me} onLogout={signOut} /></ErrorBoundary>;
  if (!me.role) return <Login onLogin={onLogin} notice="This account has no role yet. Ask an administrator to assign one." />;
  return <Staff me={me} onLogout={signOut} />;
}
