import { useEffect, useState } from 'react';
import { cx, Icon, initials } from './ui.jsx';

/**
 * Sidebar + top bar used by every signed-in screen (admin, warden, caretaker, student), as in the
 * Stitch designs. `nav` is [{title, items:[{key, label, icon, badge?}]}]; items the role cannot use
 * are filtered out by the caller.
 */
export default function Shell({ brandSub, nav, active, onNav, name, roleBadge, subline, onLogout, crumbRoot, crumb, pill, q, onSearch, bell, onBell, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const go = (k) => { onNav(k); setOpen(false); };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {open && <div className="fixed inset-0 z-40 bg-inverse-surface/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={cx('fixed left-0 top-0 z-50 flex h-full w-72 flex-col justify-between bg-inverse-surface shadow-[0_1px_8px_rgba(0,0,0,0.08)] transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar">
          <div className="flex h-16 shrink-0 items-center gap-space-sm px-space-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container"><Icon n="apartment" className="text-[22px] text-on-primary" /></div>
            <div className="flex flex-col"><span className="font-headline-sm text-headline-sm leading-none tracking-tight text-surface-container-lowest">SAHMS</span>
              <span className="mt-0.5 max-w-[170px] truncate text-[11px] leading-tight text-tertiary-fixed-dim">{brandSub}</span></div>
          </div>
          <nav className="flex flex-col gap-space-xs px-space-md py-space-sm" aria-label="Main">
            {nav.map((sec) => (
              <div key={sec.title || 'main'} className="flex flex-col gap-space-xs">
                {sec.title && <div className="px-space-sm pb-space-xs pt-space-md"><span className="font-label-caps text-label-caps uppercase text-tertiary-fixed-dim">{sec.title}</span></div>}
                {sec.items.map((it) => (
                  <button key={it.key} type="button" onClick={() => go(it.key)} aria-current={active === it.key ? 'page' : undefined}
                    className={cx('flex items-center gap-space-sm rounded-lg border-0 px-space-md py-2.5 text-left transition-colors',
                      active === it.key ? 'bg-primary-container text-on-primary' : 'bg-transparent text-inverse-on-surface hover:bg-tertiary-container hover:text-on-tertiary')}>
                    <Icon n={it.icon} className="text-[20px]" />
                    <span className="flex-1 font-label-lg text-label-lg">{it.label}</span>
                    {it.badge ? <span className="rounded-full bg-status-pending px-2 py-0.5 text-[10px] font-bold text-on-surface">{it.badge}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="bg-inverse-surface p-space-md shadow-[0_-1px_6px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between gap-space-sm">
            <div className="flex min-w-0 items-center gap-space-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-container text-[12px] font-bold text-on-secondary">{initials(name)}</div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-semibold text-surface-container-lowest">{name}</span>
                {roleBadge && <span className="mt-0.5 w-fit rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase leading-tight text-on-primary">{roleBadge}</span>}
                {subline && <span className="truncate text-[11px] text-tertiary-fixed-dim">{subline}</span>}
              </div>
            </div>
            <button type="button" title="Sign out" aria-label="Sign out" onClick={onLogout} className="shrink-0 rounded-lg border-0 bg-transparent p-1.5 text-tertiary-fixed-dim hover:bg-tertiary-container hover:text-on-secondary"><Icon n="logout" className="text-[20px]" /></button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col lg:ml-72">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-space-md bg-surface-container-lowest/90 px-space-md shadow-sm backdrop-blur lg:px-margin">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg border-0 bg-transparent p-1 text-on-surface lg:hidden"><Icon n="menu" /></button>
          <div className="flex min-w-0 items-center gap-space-xs text-body-sm text-on-surface-variant">
            <span className="hidden font-label-lg text-on-surface sm:inline">{crumbRoot}</span><Icon n="chevron_right" className="hidden text-[16px] sm:inline" />
            <span className="truncate font-label-lg text-primary">{crumb}</span>
          </div>
          {pill && <div className="hidden items-center gap-space-xs rounded-full bg-primary-fixed px-space-md py-1 text-label-md text-on-primary-fixed-variant xl:flex">{pill}</div>}
          <div className="ml-auto flex items-center gap-space-sm">
            {onSearch && (
              <label className="hidden items-center gap-space-xs rounded-lg bg-surface-container-low px-space-sm py-1.5 ring-1 ring-inset ring-outline-variant focus-within:ring-2 focus-within:ring-primary-container md:flex">
                <Icon n="search" className="text-[18px] text-outline" />
                <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search this page…" aria-label="Search" className="w-52 border-0 bg-transparent text-body-md outline-none lg:w-64" />
              </label>
            )}
            {onBell && (
              <button type="button" aria-label="Pending items" title="Pending items" onClick={onBell} className="relative rounded-lg border-0 bg-transparent p-2 text-on-surface-variant hover:bg-surface-container">
                <Icon n="notifications" />
                {bell > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-error">{bell}</span>}
              </button>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-[12px] font-bold text-on-primary">{initials(name)}</div>
          </div>
        </header>
        <main className="flex-1 p-space-md lg:p-margin">{children}</main>
      </div>
    </div>
  );
}
