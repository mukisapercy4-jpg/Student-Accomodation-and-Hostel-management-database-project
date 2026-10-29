import { useState } from 'react';
import PropTypes from 'prop-types';
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { api, tokenStore } from '../api.js';

// Full-screen photo: drop your picture at src/assets/login-bg.jpg (.jpeg/.png/.webp also work).
// Without one, a soft green gradient is used so the page never shows a broken image.
const found = import.meta.glob('../assets/login-bg.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });
const BG = Object.values(found)[0];

// Quick Access demo accounts: dev builds always; a staging/investor build can opt in with
// VITE_SHOW_DEMO_ACCOUNTS=true. They are NEVER in a normal production bundle.
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';
const DEMO_PASSWORD = 'demo-pass-123'; // created by `python manage.py seed_demo_users` (DEBUG only)
const DEMO = SHOW_DEMO ? [
  { label: 'Student Demo', username: 'demo_student', hint: 'Click to auto-fill sample student credentials' },
  { label: 'Manager Demo', username: 'demo_manager', hint: 'Click to auto-fill hostel manager credentials' },
  { label: 'Admin Demo', username: 'demo_admin', hint: 'Click to auto-fill super admin credentials' },
] : [];

const input = 'w-full rounded-full border border-slate-200 bg-sky-50/90 py-3 pl-11 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/30';

/**
 * Role-aware sign-in. The API decides the role (STUDENT | MANAGER | SUPER_ADMIN | ...), so the
 * person only types who they are; onLogin receives the response (role, home, permissions, ...).
 */
export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  const fill = (d) => { setUsername(d.username); setPassword(DEMO_PASSWORD); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) { setError('Enter your email or student ID and your password.'); return; }
    setBusy(true); setError('');
    try {
      const data = await api('/auth/token/', { method: 'POST', body: JSON.stringify({ username: username.trim(), password }) });
      tokenStore.setPair({ access: data.access, refresh: data.refresh }, remember);
      onLogin(data);
    } catch (err) {
      setError(err.status === 401 || err.status === 400
        ? 'Sign-in failed. Check your details and try again.'
        : (err.message || 'Sign-in failed.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-800 bg-cover bg-center p-4"
      style={BG ? { backgroundImage: `url(${BG})` } : undefined}>
      <div className="absolute inset-0 bg-slate-950/25" aria-hidden="true" />

      {DEMO.length > 0 && (
        <div className="absolute left-1/2 top-3 z-20 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 rounded-xl border border-blue-300/40 bg-blue-900/90 p-2.5 text-center shadow-xl backdrop-blur"
          role="group" aria-label="Quick Access Demo Accounts">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-white sm:text-xs">Developer tools: Quick Access Demo Accounts (dev only)</p>
          <div className="flex flex-wrap justify-center gap-2">
            {DEMO.map((d) => (
              <button key={d.username} type="button" onClick={() => fill(d)}
                onMouseEnter={() => setHint(d.hint)} onMouseLeave={() => setHint('')} onFocus={() => setHint(d.hint)} onBlur={() => setHint('')}
                className="rounded-md border border-blue-200/70 bg-blue-800/60 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-white">
                [{d.label}]
              </button>
            ))}
          </div>
          <p className="mt-1.5 min-h-4 text-[11px] text-blue-100" aria-live="polite">{hint}</p>
        </div>
      )}

      <form onSubmit={submit} noValidate aria-label="Sign in"
        className="relative z-10 mt-24 grid w-full max-w-sm gap-4 rounded-3xl border border-white/60 bg-white/60 p-7 shadow-2xl backdrop-blur-xl sm:mt-12">
        <div className="flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-900 text-lg font-black text-white" aria-hidden="true">S</span>
          <span className="text-2xl font-black tracking-wide text-emerald-900">SAHMS</span>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Welcome back.</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in to your account.</p>
        </div>

        <label className="grid gap-1 text-xs font-semibold text-slate-600">Email or Student ID
          <span className="relative block">
            <User size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input className={input} type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </span>
        </label>

        <label className="grid gap-1 text-xs font-semibold text-slate-600">Password
          <span className="relative block">
            <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input className={`${input} pr-11`} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 hover:text-slate-800">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-800" />
          Remember me
        </label>

        {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-700">{error}</p>}

        <button type="submit" disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-900 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {busy ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="text-center text-xs text-slate-600">Need an account? Contact your administration or warden.</p>
      </form>
    </div>
  );
}

Login.propTypes = { onLogin: PropTypes.func.isRequired };
