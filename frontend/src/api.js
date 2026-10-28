const BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';
const KEY = 'sahms_token';

export const tokenStore = {
  get() { try { return sessionStorage.getItem(KEY); } catch { return null; } },
  set(t) { try { sessionStorage.setItem(KEY, t); } catch { /* storage blocked */ } },
  clear() { try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ } },
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

export async function api(path, options = {}) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Token ${token}` } : {}),
      },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the SAHMS server. Is Django running?');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, describe(data));
  return data;
}

export const money = (v) => `UGX ${Number(v || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;
