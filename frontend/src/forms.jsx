import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, fetchAll } from './api.js';

const SEMESTERS = [[1, 'Semester 1'], [2, 'Semester 2']];
const strs = (a) => a.map((v) => [v, v]);

// Static choices mirror the CHECK lists in the MySQL schema (see backend/models.py).
// Anything that depends on data (students, rooms, bookings, staff) is loaded from the API.
// field: [key, label, type, extra, required]
export const FORMS = {
  students: {
    noun: 'student',
    fields: [
      ['reg_number', 'Registration number', 'text', null, true],
      ['first_name', 'First name', 'text', null, true],
      ['last_name', 'Last name', 'text', null, true],
      ['gender', 'Gender', 'select', strs(['Male', 'Female']), true],
      ['phone', 'Phone', 'text'],
      ['email', 'Email', 'email'],
      ['program', 'Programme', 'text', null, true],
      ['year_of_study', 'Year of study', 'number', null, true],
      ['national_id', 'National ID (admin only)', 'text', null, false, 'admin'],
    ],
  },
  bookings: {
    noun: 'booking',
    fields: [
      ['student', 'Student', 'remote', { from: 'students', label: (s) => `${s.reg_number} · ${s.first_name} ${s.last_name}` }, true],
      ['room', 'Room', 'remote', { from: 'rooms', label: (r) => `${r.hostel_name} ${r.room_number} (${r.occupied_spaces}/${r.capacity})` }, true],
      ['academic_year', 'Academic year (e.g. 2026/2027)', 'text', null, true],
      ['semester', 'Semester', 'select', SEMESTERS, true],
      ['start_date', 'Start date', 'date', null, true],
      ['end_date', 'End date', 'date', null, true],
      ['status', 'Status', 'select', strs(['Pending', 'Active']), true],
      ['agreed_price', 'Agreed price (blank = room price)', 'number'],
    ],
    defaults: { status: 'Pending', semester: 1 },
  },
  payments: {
    noun: 'payment',
    fields: [
      ['booking', 'Booking', 'remote', { from: 'bookings', label: (b) => `#${b.booking_id} · ${b.student_name} · ${b.hostel_name} ${b.room_number} (${b.status})`, filter: (b) => b.status !== 'Cancelled' }, true],
      ['amount', 'Amount (UGX)', 'number', null, true],
      ['payment_method', 'Method', 'select', strs(['Mobile Money', 'Bank', 'Cash']), true],
      ['reference_number', 'Reference number', 'text'],
      ['payment_status', 'Status', 'select', strs(['Pending', 'Completed']), true],
    ],
    defaults: { payment_method: 'Cash', payment_status: 'Pending' },
  },
  maintenance: {
    noun: 'maintenance request',
    fields: [
      ['room', 'Room', 'remote', { from: 'rooms', label: (r) => `${r.hostel_name} ${r.room_number}` }, true],
      ['reported_by_student', 'Reported by', 'remote', { from: 'students', label: (s) => `${s.reg_number} · ${s.first_name} ${s.last_name}` }, true],
      ['description', 'Description', 'textarea', null, true],
      ['priority', 'Priority', 'select', strs(['Low', 'Medium', 'High', 'Urgent']), true],
      ['status', 'Status', 'select', strs(['Pending', 'In Progress', 'Completed', 'Cancelled']), true],
      ['assigned_to', 'Assigned to (optional)', 'remote', { from: 'staff', idKey: 'staff_id', label: (s) => `${s.first_name} ${s.last_name} (${s.role})` }],
      ['completion_date', 'Completion date', 'date'],
    ],
    defaults: { priority: 'Medium', status: 'Pending' },
    editable: ['status', 'priority', 'assigned_to', 'completion_date', 'description'],
  },
  visitors: {
    noun: 'visitor',
    fields: [
      ['booking', 'Visiting (Active bookings)', 'remote', { from: 'bookings', params: { status: 'Active' }, label: (b) => `#${b.booking_id} · ${b.student_name} · ${b.hostel_name} ${b.room_number}` }, true],
      ['visitor_name', 'Visitor name', 'text', null, true],
      ['phone', 'Phone', 'text'],
      ['check_in_time', 'Check-in time', 'time', null, true],
      ['check_out_time', 'Check-out time', 'time'],
      ['purpose', 'Purpose', 'text'],
    ],
    editable: ['check_out_time', 'purpose', 'phone'],
  },
};

const clean = (fields, values) => {
  const out = {};
  fields.forEach(([k, , type]) => {
    const v = values[k];
    if (v === '' || v === undefined) { out[k] = type === 'remote' || type === 'date' || type === 'time' ? null : v; return; }
    out[k] = type === 'number' || type === 'remote' || (k === 'semester') ? Number(v) : v;
  });
  // let the API default what the user left blank
  ['agreed_price', 'reference_number', 'phone', 'email', 'purpose', 'national_id'].forEach((k) => { if (out[k] === '' || out[k] === null || out[k] === undefined) delete out[k]; });
  return out;
};

export function RecordForm({ resource, record, isAdmin, onClose, onSaved }) {
  const cfg = FORMS[resource];
  const editing = !!record;
  const fields = cfg.fields.filter((f) => (f[5] !== 'admin' || isAdmin) && (!editing || !cfg.editable || cfg.editable.includes(f[0]) || resource === 'students'));
  const [values, setValues] = useState(() => (editing ? { ...record } : { ...(cfg.defaults || {}) }));
  const [options, setOptions] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fields.filter(([, , t]) => t === 'remote').forEach(async ([k, , , x]) => {
      try {
        const rows = (await fetchAll(x.from, '', 20, x.params)).filter(x.filter || (() => true));
        if (live) setOptions((o) => ({ ...o, [k]: rows.map((r) => [r[x.idKey || `${x.from.replace(/s$/, '')}_id`], x.label(r)]) }));
      } catch (e) { if (live) setError(`Could not load ${x.from}: ${e.message}`); }
    });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = clean(fields, values);
      if (editing) {
        const id = record[Object.keys(record).find((k) => k.endsWith('_id') && k !== 'warden')];
        await api(`/${resource}/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api(`/${resource}/`, { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved(`${editing ? 'Updated' : 'Created'} ${cfg.noun}.`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="drawer formdrawer" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="drawerhead"><h2>{editing ? 'Edit' : 'New'} {cfg.noun}</h2>
          <button type="button" className="iconbtn" onClick={onClose} title="Close"><X size={18} /></button></div>
        {fields.map(([k, lbl, type, extra, req]) => (
          <label className="field" key={k}><span>{lbl}{req ? ' *' : ''}</span>
            {type === 'select' && (
              <select value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} required={!!req}>
                <option value="">Select…</option>{extra.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>)}
            {type === 'remote' && (
              <select value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} required={!!req} disabled={editing && resource !== 'maintenance'}>
                <option value="">{options[k] ? 'Select…' : 'Loading…'}</option>
                {(options[k] || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>)}
            {type === 'textarea' && <textarea rows={3} value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} required={!!req} />}
            {!['select', 'remote', 'textarea'].includes(type) && (
              <input type={type} step={type === 'number' ? 'any' : undefined} value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} required={!!req} />)}
          </label>
        ))}
        {error && <div className="formerror">{error}</div>}
        <button className="primary formsubmit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  );
}
