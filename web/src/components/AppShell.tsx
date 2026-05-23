import { Outlet, NavLink } from 'react-router-dom'
import LogFAB from './LogFAB'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { to: '/today',    label: 'Today',  icon: '◎' },
  { to: '/plan',     label: 'Plan',   icon: '◫' },
  { to: '/trends',   label: 'Trends', icon: '∿' },
  { to: '/coach',    label: 'Coach',  icon: '✦' },
]

export default function AppShell() {
  return (
    <div className="flex flex-col h-dvh md:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-slate-900 border-r border-slate-800 py-6 px-3 gap-1">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-4">
          Sovereign Health
        </span>
        {NAV_ITEMS.map((item) => (
          <SideLink key={item.to} {...item} />
        ))}
        <div className="mt-auto">
          <SideLink to="/settings" label="Settings" icon="⚙" />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom nav — mobile */}
      <nav className="fixed bottom-0 inset-x-0 md:hidden bg-slate-900/95 backdrop-blur border-t border-slate-800 safe-bottom z-40">
        <div className="flex items-center justify-around h-14">
          {NAV_ITEMS.slice(0, 2).map((item) => (
            <BottomLink key={item.to} {...item} />
          ))}
          <LogFAB />
          {NAV_ITEMS.slice(2).map((item) => (
            <BottomLink key={item.to} {...item} />
          ))}
        </div>
      </nav>
    </div>
  )
}

function SideLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive ? 'bg-brand-500/20 text-brand-500' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
        )
      }
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </NavLink>
  )
}

function BottomLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors',
          isActive ? 'text-brand-500' : 'text-slate-500',
        )
      }
    >
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </NavLink>
  )
}
