import { useCallback, useEffect, useState } from 'react';
import { api, fetchAll } from './api.js';

/** Join class names, skipping falsy values. */
export const cx = (...a) => a.filter(Boolean).join(' ');

/** Material Symbols icon (the font is loaded in index.html, same as the Stitch designs). */
export function Icon({ n, className = '', fill = false }) {
  return <span aria-hidden="true" className={cx('material-symbols-outlined', className)} style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}>{n}</span>;
}

// ---------------------------------------------------------------- dates
const pad = (n) => String(n).padStart(2, '0');
/** Today as YYYY-MM-DD in the browser's own time zone (not UTC). */
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
export const addDaysIso = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtDate = (v) => (v ? new Date(String(v).length <= 10 ? `${v}T00:00:00` : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (t) => (t ? String(t).slice(0, 5) : '—');
export function ago(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return fmtDate(ts);
}
export const academicYear = (d = new Date()) => { const y = d.getFullYear(); return d.getMonth() >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`; };
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
export const balanceOf = (b) => Math.max(Number(b.agreed_price || 0) - Number(b.completed_payments || 0), 0);

// ---------------------------------------------------------------- badges
// Full class strings on purpose: Tailwind only generates classes it finds as literal text.
const TONES = {
  ok: 'bg-status-available/10 text-emerald-700', warn: 'bg-status-pending/15 text-momo-mtn-accent',
  bad: 'bg-error-container text-on-error-container', info: 'bg-primary-fixed text-on-primary-fixed-variant',
  mute: 'bg-surface-container-high text-on-surface-variant',
};
export const STATUS_TONE = {
  Active: 'ok', Completed: 'ok', Available: 'ok', Pending: 'warn', 'In Progress': 'info', Cancelled: 'bad', Failed: 'bad',
  Refunded: 'mute', Occupied: 'bad', Maintenance: 'warn', Low: 'mute', Medium: 'info', High: 'warn', Urgent: 'bad',
};
export function Badge({ tone, children, className = '' }) {
  const t = tone || STATUS_TONE[children] || 'mute';
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-label-md font-label-md', TONES[t], className)}>{children}</span>;
}

// ---------------------------------------------------------------- layout atoms
export const Card = ({ className = '', children, ...p }) => <section className={cx('rounded-xl bg-surface-container-lowest p-space-lg shadow-sm', className)} {...p}>{children}</section>;

export function CardHead({ icon, title, sub, right }) {
  return (
    <div className="mb-space-md flex items-start justify-between gap-space-sm">
      <div className="min-w-0">
        <h2 className="flex items-center gap-space-sm font-headline-sm text-headline-sm text-on-surface">{icon && <Icon n={icon} className="text-[22px] text-primary" />}{title}</h2>
        {sub && <p className="mt-0.5 text-body-sm text-on-surface-variant">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** One KPI tile: caption, big value, icon chip, footer line. */
export function Metric({ label, value, icon, note, tag, tagTone = 'text-outline', chip = 'bg-secondary-fixed text-secondary', danger }) {
  return (
    <div className="flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-md shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-space-sm">
        <div className="min-w-0">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">{label}</span>
          <div className={cx('mt-1 font-headline-lg tracking-tight', String(value).length > 9 ? 'text-headline-md' : 'text-headline-lg', danger ? 'text-error' : 'text-on-surface')} title={String(value)}>{value}</div>
        </div>
        {icon && <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', chip)}><Icon n={icon} className="text-[22px]" /></div>}
      </div>
      {(note || tag) && (
        <div className="mt-space-sm flex items-center justify-between gap-space-xs pt-space-xs text-body-sm">
          <span className="truncate text-on-surface-variant">{note}</span>
          {tag && <span className={cx('shrink-0 font-label-caps text-[11px] font-semibold', tagTone)}>{tag}</span>}
        </div>
      )}
    </div>
  );
}

export const btn = {
  primary: 'inline-flex h-10 items-center justify-center gap-space-xs rounded-lg bg-primary-container px-space-md font-label-lg text-label-lg text-on-primary shadow-sm transition-all hover:bg-primary active:scale-[0.98] disabled:opacity-60',
  ghost: 'inline-flex h-10 items-center justify-center gap-space-xs rounded-lg bg-surface-container-lowest px-space-md font-label-lg text-label-lg text-on-surface shadow-sm ring-1 ring-inset ring-outline-variant transition-colors hover:bg-surface-container disabled:opacity-60',
  small: 'inline-flex items-center justify-center gap-1 rounded-lg bg-primary-container px-3 py-1.5 font-label-md text-label-md text-on-primary hover:bg-primary disabled:opacity-60',
  smallGhost: 'inline-flex items-center justify-center gap-1 rounded-lg bg-surface-container-low px-3 py-1.5 font-label-md text-label-md text-on-surface ring-1 ring-inset ring-outline-variant hover:bg-surface-container disabled:opacity-60',
  smallDanger: 'inline-flex items-center justify-center gap-1 rounded-lg bg-error-container px-3 py-1.5 font-label-md text-label-md text-on-error-container hover:opacity-80 disabled:opacity-60',
};
export const fieldCls = 'w-full rounded-lg border-0 bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none ring-1 ring-inset ring-outline-variant focus:ring-2 focus:ring-primary-container';

export function Progress({ pct, color = 'bg-primary-container', className = '' }) {
  return <div className={cx('h-2 w-full overflow-hidden rounded-full bg-surface-container-high', className)}><div className={cx('h-full rounded-full', color)} style={{ width: `${Math.min(Math.max(pct || 0, 0), 100)}%` }} /></div>;
}

export function Notice({ tone = 'bad', children, onRetry, onClose }) {
  const c = { bad: 'bg-error-container text-on-error-container', ok: 'bg-status-available/10 text-emerald-800', warn: 'bg-status-pending/15 text-momo-mtn-accent' }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('mb-space-md flex items-center justify-between gap-space-sm rounded-lg p-space-sm px-space-md text-body-md', c)}>
      <span>{children}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-label-lg underline">Retry</button>}
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="font-label-lg">×</button>}
    </div>
  );
}

/** Loading / error / empty wrapper for anything produced by useRows or useApi. */
export function Async({ state, empty, isEmpty, children }) {
  if (state.error) return <Notice onRetry={state.reload}>Could not load: {state.error}</Notice>;
  if (state.loading && !state.loaded) return <div aria-busy="true" className="grid gap-space-sm">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-container-high" />)}</div>;
  if (isEmpty ?? (state.rows ? state.rows.length === 0 : !state.data)) return <p className="rounded-lg border border-dashed border-outline-variant p-space-lg text-center text-body-md text-on-surface-variant">{empty}</p>;
  return children;
}

export function Modal({ title, sub, onClose, children, side = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={cx('fixed inset-0 z-[60] flex bg-inverse-surface/60', side ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-space-md')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx('max-h-[92vh] w-full overflow-y-auto bg-surface-container-lowest p-space-lg shadow-2xl', side ? 'h-full max-h-none max-w-md' : 'max-w-lg rounded-t-xl sm:rounded-xl')}>
        <div className="mb-space-md flex items-start justify-between gap-space-sm">
          <div><h2 className="font-headline-sm text-headline-sm">{title}</h2>{sub && <p className="text-body-sm text-on-surface-variant">{sub}</p>}</div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container"><Icon n="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- data hooks
/** Every row of a list endpoint (all pages). `params` become ?filters. Call reload() to refetch. */
export function useRows(resource, params = {}, enabled = true) {
  const key = JSON.stringify(params);
  const [st, setSt] = useState({ rows: [], loading: enabled, loaded: false, error: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the request about to start
    setSt((s) => ({ ...s, loading: true, error: '' }));
    fetchAll(resource, '', 100, JSON.parse(key))
      .then((rows) => live && setSt({ rows, loading: false, loaded: true, error: '' }))
      .catch((e) => live && setSt({ rows: [], loading: false, loaded: true, error: e.message || 'Request failed.' }));
    return () => { live = false; };
  }, [resource, key, tick, enabled]);
  return { ...st, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** One JSON document (dashboard, a single hostel, ...). */
export function useApi(path, enabled = true) {
  const [st, setSt] = useState({ data: null, loading: enabled, loaded: false, error: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled || !path) return undefined;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the request about to start
    setSt((s) => ({ ...s, loading: true, error: '' }));
    api(path).then((data) => live && setSt({ data, loading: false, loaded: true, error: '' }))
      .catch((e) => live && setSt({ data: null, loading: false, loaded: true, error: e.message || 'Request failed.' }));
    return () => { live = false; };
  }, [path, tick, enabled]);
  return { ...st, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** POST/PATCH helper that reports success or failure through callbacks. */
export async function send(path, method, body) {
  return api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}
