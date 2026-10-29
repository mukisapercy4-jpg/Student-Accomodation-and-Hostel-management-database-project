import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchAll } from '../api.js';
import RoomCard from './RoomCard.jsx';

const FILTERS = ['All', 'Available', 'Occupied', 'Maintenance'];

/** Card view of /api/rooms/. `q` is the search box in the app header. */
export default function RoomsGrid({ q = '', onSelect }) {
  const [result, setResult] = useState({ key: null, rooms: [], error: '' });
  const [filter, setFilter] = useState('All');
  const [tick, setTick] = useState(0);
  const key = `${q}|${tick}`;
  // "loading" is derived: the stored result belongs to an older search/refresh than the current one.
  const state = { ...result, loading: result.key !== key };

  useEffect(() => {
    let live = true;
    fetchAll('rooms', q)
      .then((rooms) => live && setResult({ key, rooms, error: '' }))
      .catch((e) => live && setResult({ key, rooms: [], error: e.message || 'Request failed.' }));
    return () => { live = false; };
  }, [q, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const shown = filter === 'All' ? state.rooms : state.rooms.filter((r) => r.status === filter);

  return (
    <section aria-label="Rooms">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === f
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {f}
            </button>
          ))}
        </div>
        <button type="button" onClick={reload} disabled={state.loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">
          <RefreshCw size={13} className={state.loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
        </button>
      </div>

      {state.error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <span>Could not load rooms: {state.error}</span>
          <button type="button" onClick={reload} className="font-bold underline">Retry</button>
        </div>
      )}

      {state.loading && state.rooms.length === 0 && !state.error && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-200/70" />)}
        </div>
      )}

      {!state.loading && !state.error && shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          {state.rooms.length === 0 ? 'No rooms found.' : `No ${filter.toLowerCase()} rooms.`}
        </p>
      )}

      {shown.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => <RoomCard key={r.room_id} room={r} onSelect={onSelect} />)}
        </div>
      )}
    </section>
  );
}
