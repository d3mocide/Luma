import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useIsFetching, useQuery } from '@tanstack/react-query'
import {
  CircleDot, Utensils, Activity, Sparkles, Settings, Plus, Moon, Sun, Loader2, ChevronDown,
} from 'lucide-react'
import { api, User } from '../lib/api'
import { useUIStore } from '../stores'
import { LumaWordmark } from './ui/LumaLogo'
import LogSheet from './LogSheet'
import Login from './Login'

const NAV_ITEMS = [
  { to: '/today',  label: 'Today',  Icon: CircleDot },
  { to: '/plan',   label: 'Plan',   Icon: Utensils  },
  { to: '/trends', label: 'Trends', Icon: Activity  },
  { to: '/coach',  label: 'Luma',   Icon: Sparkles  },
]

export default function AppShell() {
  const location = useLocation()
  const todayFetchCount = useIsFetching({ queryKey: ['today'] })
  const isTodayLoading = location.pathname === '/today' && todayFetchCount > 0

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="luma-bg" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 36, height: 36,
          borderRadius: '50%',
          border: '2px solid rgba(56,189,248,0.2)',
          borderTopColor: 'var(--sky-400)',
          animation: 'spin 0.8s linear infinite',
        }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (error || !user) {
    return <Login />
  }

  const initials = getUserInitials(user.display_name)

  return (
    <div className="luma-bg" style={{ height: '100dvh', display: 'flex', flexDirection: 'row' }}>
      <LogSheet />

      {/* Desktop Sidebar */}
      <DesktopSidebar user={user} isTodayLoading={isTodayLoading} />

      {/* Main content */}
      <main
        className="thin-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Outlet />
      </main>

      {/* Mobile Profile Menu */}
      <MobileProfileMenu initials={initials} />

      {/* Mobile Bottom Nav */}
      <MobileNav />
    </div>
  )
}

function DesktopSidebar({ user, isTodayLoading }: { user: User; isTodayLoading: boolean }) {
  const { theme, toggleTheme } = useUIStore()

  const initials = getUserInitials(user.display_name)

  return (
    <aside style={{
      width: 240,
      flexShrink: 0,
      padding: '28px 18px 24px',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      flexDirection: 'column',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)',
      position: 'relative',
      zIndex: 2,
    }}
    className="hidden md:flex"
    >
      <div style={{ padding: '0 8px 28px' }}>
        <LumaWordmark size={32}/>
      </div>

      <div style={{ padding: '0 8px', marginBottom: 14 }}>
        <span className="eyebrow" style={{ fontSize: 9 }}>Menu</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV_ITEMS.map((item) => (
          <SideLink key={item.to} {...item} showLoading={isTodayLoading && item.to === '/today'} />
        ))}
      </nav>

      <div style={{ flex: 1 }}/>

      {/* Theme toggle */}
      <div style={{ marginBottom: 14 }}>
        <div className={`theme-toggle ${theme === 'light' ? 'light-mode' : ''}`} style={{ width: '100%' }}>
          <button data-active={theme === 'dark' ? 'true' : 'false'} onClick={() => theme !== 'dark' && toggleTheme()}>
            <Moon size={12} strokeWidth={1.5}/> Dark
          </button>
          <button data-active={theme === 'light' ? 'true' : 'false'} onClick={() => theme !== 'light' && toggleTheme()}>
            <Sun size={12} strokeWidth={1.5}/> Light
          </button>
        </div>
      </div>

      {/* User chip */}
      <div className="glass" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--sun-200), var(--sky-300) 46%, var(--sky-500))',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.14), 0 0 14px rgba(56,189,248,0.30)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600, fontSize: 13, color: '#06121d', flexShrink: 0,
        }}>{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{user.display_name || 'Operator'}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>self-hosted</div>
        </div>
        <NavLink to="/settings">
          <Settings size={15} strokeWidth={1.5} color="currentColor" style={{ color: 'var(--fg-quiet)' }} />
        </NavLink>
      </div>
    </aside>
  )
}

function MobileProfileMenu({ initials }: { initials: string }) {
  const location = useLocation()
  const { theme, setTheme } = useUIStore()
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setIsOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={panelRef} className="mobile-profile-menu safe-top md:hidden">
      <button
        type="button"
        className="mobile-profile-trigger"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Open account panel"
        aria-expanded={isOpen}
      >
        <span>{initials}</span>
      </button>

      {isOpen && (
        <div className="mobile-profile-panel glass-bright">
          <div className="eyebrow" style={{ marginBottom: 10 }}>Display</div>
          <div className={`theme-toggle ${theme === 'light' ? 'light-mode' : ''}`} style={{ width: '100%' }}>
            <button
              type="button"
              data-active={theme === 'dark' ? 'true' : 'false'}
              onClick={() => setTheme('dark')}
            >
              <Moon size={12} strokeWidth={1.5}/> Dark
            </button>
            <button
              type="button"
              data-active={theme === 'light' ? 'true' : 'false'}
              onClick={() => setTheme('light')}
            >
              <Sun size={12} strokeWidth={1.5}/> Light
            </button>
          </div>

          <div style={{ height: 1, background: 'var(--glass-edge)', margin: '14px 0 12px' }} />

          <NavLink
            to="/settings"
            className="mobile-profile-action"
            onClick={() => setIsOpen(false)}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Settings size={15} strokeWidth={1.6} />
              <span>Open settings</span>
            </span>
            <ChevronDown size={14} strokeWidth={1.8} style={{ transform: 'rotate(-90deg)' }} />
          </NavLink>
        </div>
      )}
    </div>
  )
}

function getUserInitials(displayName?: string) {
  const trimmed = (displayName || '').trim()
  if (!trimmed) return 'OP'

  return trimmed
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function SideLink({
  to,
  label,
  Icon,
  showLoading,
}: {
  to: string
  label: string
  Icon: React.ElementType
  showLoading?: boolean
}) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px',
        borderRadius: 12,
        color: isActive ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
        background: isActive ? 'linear-gradient(90deg, rgba(56,189,248,0.18), rgba(56,189,248,0.04))' : 'transparent',
        border: isActive ? '1px solid rgba(56,189,248,0.2)' : '1px solid transparent',
        fontSize: 14, fontWeight: isActive ? 500 : 400,
        cursor: 'pointer',
        position: 'relative',
        textDecoration: 'none',
        transition: 'all 150ms ease-out',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="sidebar-active-indicator"/>}
          <Icon size={17} strokeWidth={1.5}/>
          <span>{label}</span>
          {isActive && showLoading && (
            <span className="nav-loading-label" aria-label="Loading today data" title="Loading today data">
              <Loader2 size={10} strokeWidth={1.75} className="nav-loading-icon" />
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function MobileNav() {
  const openLog = useUIStore((s) => s.openLogSheet)

  return (
    <div
      className="mobile-nav-wrap safe-bottom md:hidden"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '10px 18px 12px',
        zIndex: 20,
      }}
    >
      <div className="glass-bright" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 8px',
        borderRadius: 28,
        position: 'relative',
      }}>
        {/* Today + Plan */}
        {NAV_ITEMS.slice(0, 2).map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}

        {/* FAB */}
        <button
          onClick={openLog}
          className="mobile-fab"
          style={{
            width: 52, height: 52,
            borderRadius: '50%',
            background: 'linear-gradient(180deg, var(--sun-200), var(--sun-400))',
            border: '1px solid rgba(251,191,36,0.6)',
            color: 'var(--bg-1)',
            marginTop: -22,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
          aria-label="Log meal"
        >
          <Plus size={22} strokeWidth={2.5}/>
        </button>

        {/* Trends + Luma */}
        {NAV_ITEMS.slice(2).map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}
      </div>
    </div>
  )
}

function MobileNavItem({ to, label, Icon }: { to: string; label: string; Icon: React.ElementType }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        flex: 1, padding: '6px 4px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        color: isActive ? 'var(--sky-300)' : 'var(--fg-quiet)',
        textDecoration: 'none',
      })}
    >
      <Icon size={20} strokeWidth={1.5}/>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.02em' }}>{label}</span>
    </NavLink>
  )
}
