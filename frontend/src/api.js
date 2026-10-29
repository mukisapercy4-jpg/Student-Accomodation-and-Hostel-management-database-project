const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const ACCESS = 'sahms_access';
const REFRESH = 'sahms_refresh';

export const API_BASE = BASE;

// "Remember me" keeps the session in localStorage; otherwise it lives only until the tab closes.
const stores = () => { try { return [sessionStorage, localStorage]; } catch { return []; } };
const read = (k) => { for (const st of stores()) { try { const v = st.getItem(k); if (v) return v; } catch { /* blocked */ } } return null; };

export const tokenStore = {
  /** The JWT access token (or null). */
  get() { return read(ACCESS); },
  getRefresh() { return read(REFRESH); },
  /** Save an {access, refresh} pair. `remember` = keep it across browser restarts. */
  setPair({ access, refresh }, remember = false) {
    this.clear();
    try {
      const st = remember ? localStorage : sessionStorage;
      st.setItem(ACCESS, access);
      if (refresh) st.setItem(REFRESH, refresh);
    } catch { /* storage blocked */ }
  },
  setAccess(access) {
    for (const st of stores()) { try { if (st.getItem(ACCESS)) st.setItem(ACCESS, access); } catch { /* blocked */ } }
  },
  clear() { for (const st of stores()) { try { st.removeItem(ACCESS); st.removeItem(REFRESH); } catch { /* blocked */ } } },
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function describe(data) {
  if (!data) return 'Request failed.';
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join(' | ');
}

/** Why a request never got an answer: tells "Django is down" apart from "blocked by CORS". */
export async function diagnose() {
  try {
    const r = await fetch(`${BASE}/health/`);
    if (r.ok) return 'The server answered, so Django is running; the failing call was refused (check your login).';
    return `The server answered /health/ with HTTP ${r.status}. Check that ${BASE} is the SAHMS API.`;
  } catch {
    return `No answer from ${BASE}. Either Django is not running (python manage.py runserver), `
      + `the address is wrong (VITE_API_BASE_URL), or the browser blocked it (CORS: this page's address `
      + `must be allowed; see CORS_ALLOWED_ORIGINS in SAHMS/settings.py and restart Django).`;
  }
}

let refreshing = null; // one refresh at a time, shared by parallel requests

/** Trade the refresh token for a new access token. Returns true when it worked. */
async function refreshAccess() {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  refreshing ??= fetch(`${BASE}/auth/token/refresh/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh }),
  }).then(async (r) => {
    if (!r.ok) return false;
    const d = await r.json().catch(() => null);
    if (!d?.access) return false;
    tokenStore.setAccess(d.access);
    return true;
  }).catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, options = {}, retried = false) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new ApiError(0, await diagnose());
  }
  if (res.status === 401 && token && !retried && !path.startsWith('/auth/token') && await refreshAccess()) {
    return api(path, options, true);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, describe(data));
  return data;
}

/** Every page of a list endpoint (the API paginates at 25; 100 per request here). */
export async function fetchAll(resource, search = '', maxPages = 100, extra = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({ page: String(page), page_size: '100' });
    if (search) params.set('search', search);
    Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    const d = await api(`/${resource}/?${params}`);
    rows.push(...d.results);
    if (!d.next) return rows;
  }
  return rows;
}

export const money = (v) => `UGX ${Number(v || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;

/** CSV text for Excel: BOM, quoted cells, and a leading ' on cells that could run as formulas. */
export function toCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const cell = (v) => {
    let t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  return '﻿' + [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\r\n');
}
