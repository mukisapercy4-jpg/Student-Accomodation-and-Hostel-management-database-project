import { useState } from 'react';
import PropTypes from 'prop-types';
import { api, tokenStore } from '../api.js';
import { Icon, cx } from '../ui.jsx';

// Quick-fill buttons: dev builds always; a staging build can opt in with VITE_SHOW_DEMO_ACCOUNTS=true.
// The accounts come from `python manage.py seed_demo_users` (DEBUG only), never from real data.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
const DEMO_PASSWORD = 'demo-pass-123';
const DEMO = SHOW_DEMO ? [
  { label: 'Super Admin', username: 'demo_admin', dot: 'bg-primary-container' },
  { label: 'Hall Warden', username: 'demo_manager', dot: 'bg-secondary' },
  { label: 'Chief Caretaker', username: 'demo_caretaker', dot: 'bg-status-pending' },
  { label: 'Estate Auditor', username: 'demo_readonly', dot: 'bg-tertiary' },
  { label: 'Student Resident', username: 'demo_student', dot: 'bg-status-available' },
] : [];

const field = 'w-full rounded-lg border-0 bg-surface-container-low py-3 pl-11 pr-4 text-body-lg text-on-surface outline-none ring-1 ring-inset ring-outline-variant focus:ring-2 focus:ring-primary-container';

/** Sign-in (Stitch "unified login"). The API decides the role and home screen; onLogin gets /auth/token/ + /auth/me/. */
export default function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) { setError('Enter your username, email or registration number, and your password.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api('/auth/token/', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
      tokenStore.setPair({ access: data.access, refresh: data.refresh }, remember);
      onLogin(data);
    } catch (err) {
      setError(err.status === 401 || err.status === 400 ? 'Sign-in failed. Check your details and try again.' : (err.message || 'Sign-in failed.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-inverse-surface p-margin text-inverse-on-surface lg:flex">
        <div className="absolute -bottom-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-primary-container/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center gap-space-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container"><Icon n="apartment" className="text-[26px] text-on-primary" /></div>
            <div><span className="font-headline-md text-headline-md text-surface-container-lowest">SAHMS</span>
              <p className="text-body-md text-tertiary-fixed-dim">Student Accommodation &amp; Hostel Management System</p></div>
          </div>
          <p className="mt-space-xl font-label-caps text-label-caps uppercase tracking-wider text-primary-fixed-dim">Residence operating system</p>
          <h1 className="mt-space-sm font-headline-xl text-headline-xl text-surface-container-lowest">Your Accommodation, Simplified.</h1>
          <p className="mt-space-md max-w-lg text-body-lg text-tertiary-fixed-dim">Hostels, rooms, bookings, Mobile Money payments, maintenance and visitors in one place, backed by the live hostel database.</p>
          <ul className="mt-space-xl grid gap-space-md text-body-md">
            {[['shield', 'Role-based access: each person only sees what their role allows'], ['account_balance_wallet', 'Mobile Money (MTN / Airtel) and cash payments tracked against every booking'], ['history_edu', 'Audit trail of every change, with booking and payment status history']].map(([i, t]) => (
              <li key={t} className="flex items-center gap-space-sm"><Icon n={i} className="text-[20px] text-primary-fixed-dim" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-body-sm text-tertiary-fixed-dim">University Accommodation Management Platform</p>
      </section>

      <section className="flex items-center justify-center p-space-md sm:p-margin">
        <form onSubmit={submit} noValidate aria-label="Sign in" className="grid w-full max-w-md gap-space-md rounded-xl bg-surface-container-lowest p-space-xl shadow-lg">
          <div className="flex items-center gap-space-sm lg:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container"><Icon n="apartment" className="text-on-primary" /></div><span className="font-headline-sm text-headline-sm">SAHMS</span></div>
          <div className="flex items-start justify-between gap-space-sm">
            <div><h2 className="font-headline-md text-headline-md">Welcome Back</h2>
              <p className="mt-1 text-body-md text-on-surface-variant">Sign in to your SAHMS administrative or residential workspace.</p></div>
            <span className="hidden whitespace-nowrap rounded-full bg-primary-fixed px-3 py-1 text-label-md text-on-primary-fixed-variant sm:inline">Secure Gateway</span>
          </div>

          {notice && <p role="status" className="rounded-lg bg-status-pending/15 p-space-sm px-space-md text-body-md text-momo-mtn-accent">{notice}</p>}

          <label className="grid gap-1 font-label-lg text-label-lg">
            <span className="flex justify-between">Username, email or Reg No.<span className="text-body-sm font-normal text-outline">e.g. 23/U/10492</span></span>
            <span className="relative block"><Icon n="person" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline" />
              <input className={field} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></span>
          </label>

          <label className="grid gap-1 font-label-lg text-label-lg">
            <span className="flex justify-between">Password
              <button type="button" onClick={() => setHelp((v) => !v)} className="border-0 bg-transparent p-0 font-label-md text-primary hover:underline">Forgot password?</button></span>
            <span className="relative block"><Icon n="lock" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline" />
              <input className={cx(field, 'pr-11')} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border-0 bg-transparent p-1 text-outline hover:text-on-surface"><Icon n={show ? 'visibility_off' : 'visibility'} className="text-[20px]" /></button></span>
          </label>
          {help && <p role="note" className="rounded-lg bg-surface-container-low p-space-sm px-space-md text-body-sm text-on-surface-variant">Passwords are reset by the university residence administration. Please contact your hall warden or the system administrator.</p>}

          <label className="flex items-center gap-space-sm text-body-md"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-primary-container" />Remember session on this device</label>

          {error && <p role="alert" className="rounded-lg bg-error-container p-space-sm px-space-md text-body-md text-on-error-container">{error}</p>}

          <button type="submit" disabled={busy} className="inline-flex h-12 items-center justify-center gap-space-sm rounded-lg bg-primary text-label-lg font-label-lg text-on-primary transition-all hover:bg-primary-container active:scale-[0.99] disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign In to Portal'}{!busy && <Icon n="arrow_forward" className="text-[20px]" />}
          </button>

          {DEMO.length > 0 && (
            <div className="rounded-lg bg-primary-fixed/50 p-space-md" role="group" aria-label="Dev quick-fill">
              <p className="mb-space-sm flex justify-between font-label-caps text-label-caps uppercase text-on-surface-variant">Dev quick-fill <span className="text-primary">dev builds only</span></p>
              <div className="flex flex-wrap gap-space-sm">
                {DEMO.map((d) => (
                  <button key={d.username} type="button" onClick={() => { setUsername(d.username); setPassword(DEMO_PASSWORD); setError(''); }}
                    className="inline-flex items-center gap-space-xs rounded-lg border-0 bg-surface-container-lowest px-3 py-1.5 text-label-md shadow-sm hover:bg-surface-container">
                    <span className={cx('h-2 w-2 rounded-full', d.dot)} />{d.label}</button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
Login.propTypes = { onLogin: PropTypes.func.isRequired, notice: PropTypes.string };
