import { useEffect, useState } from 'react';
import { LogOut, Menu, Search, X } from 'lucide-react';

// Matches the app's existing breakpoint: the sidebar is hidden at 900px and below (App.css).
const PRIMARY = ['Dashboard', 'Bookings', 'Rooms', 'Payments'];

/**
 * Sticky top bar + bottom navigation (with a "More" drawer) for screens <= 900px.
 * @param {{title:string, nav:Array<[string, import('react').ComponentType, (string|null)]>, active:string,
 *   onSelect:(name:string)=>void, username:string, roleLabel:string, onLogout:()=>void,
 *   searchable:boolean, q:string, onSearch:(v:string)=>void}} props
 */
export default function MobileChrome({ title, nav, active, onSelect, username, roleLabel, onLogout, searchable, q, onSearch }) {
  const [drawer, setDrawer] = useState(false);
  const [searching, setSearching] = useState(false);
  const primary = nav.filter(([n]) => PRIMARY.includes(n));
  const more = nav.filter(([n]) => !PRIMARY.includes(n));

  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const go = (name) => { onSelect(name); setDrawer(false); setSearching(false); };
  const item = (on) => `flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-semibold ${on ? 'text-blue-600' : 'text-slate-500'}`;

  return (
    <div className="min-[901px]:hidden">
      {/* sticky top action bar (a div, not <header>: App.css styles the header element globally) */}
      <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
        {searching ? (
          <>
            <input autoFocus type="search" value={q} onChange={(e) => onSearch(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`}
              aria-label={`Search ${title}`} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
            <button type="button" aria-label="Close search" onClick={() => { setSearching(false); onSearch(''); }} className="rounded-lg p-2 text-slate-500"><X size={18} /></button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-base font-extrabold text-slate-800">{title}</p>
            {searchable && <button type="button" aria-label="Search" onClick={() => setSearching(true)} className="rounded-lg p-2 text-slate-600"><Search size={18} /></button>}
            <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="rounded-lg p-2 text-slate-600"><Menu size={18} /></button>
          </>
        )}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <div role="dialog" aria-modal="true" aria-label="More navigation"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
            <div className="grid grid-cols-3 gap-2">
              {nav.map(([name, Icon]) => (
                <button key={name} type="button" onClick={() => go(name)} aria-current={active === name ? 'page' : undefined}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-semibold ${active === name ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  <Icon size={18} aria-hidden="true" />{name}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{username}</p><p className="truncate text-xs text-slate-400">{roleLabel}</p></div>
              <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">
                <LogOut size={14} aria-hidden="true" /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* bottom navigation */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {primary.map(([name, Icon]) => (
          <button key={name} type="button" onClick={() => go(name)} aria-current={active === name ? 'page' : undefined} className={item(active === name)}>
            <Icon size={20} aria-hidden="true" /><span className="max-w-full truncate">{name}</span>
          </button>
        ))}
        {more.length > 0 && (
          <button type="button" onClick={() => setDrawer(true)} className={item(more.some(([n]) => n === active))}>
            <Menu size={20} aria-hidden="true" /><span>More</span>
          </button>
        )}
      </nav>
    </div>
  );
}
