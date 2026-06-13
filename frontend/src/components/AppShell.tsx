import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleDot, Utensils, Activity, Sparkles, Settings, Plus, Moon, Sun, Loader2, ChevronDown,
  Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight, Star, Users, HeartPulse,
} from 'lucide-react'
import { api, TodayData, User } from '../lib/api'
import { useUIStore } from '../stores'
import { useSwReady } from '../swGate'
import { LumaLogo, LumaWordmark } from './ui/LumaLogo'
import LogSheet from './LogSheet'
import Login from './Login'
import { SplashScreen } from './SplashScreen'

// Mobile: 3 + FAB + 3 (symmetric)
const NAV_ITEMS = [
  { to: '/today',     label: 'Today',   Icon: CircleDot  },
  { to: '/meals',     label: 'Meals',   Icon: Utensils   },
  { to: '/trends',    label: 'Trends',  Icon: Activity   },
  { to: '/health',    label: 'Health',  Icon: HeartPulse },
  { to: '/favorites', label: 'Favs',    Icon: Star       },
  { to: '/coach',     label: 'Coach',   Icon: Sparkles   },
]

const DESKTOP_NAV_ITEMS = [
  { to: '/today',     label: 'Today',     Icon: CircleDot  },
  { to: '/trends',    label: 'Trends',    Icon: Activity   },
  { to: '/health',    label: 'Health',    Icon: HeartPulse },
  { to: '/favorites', label: 'Favorites', Icon: Star       },
  { to: '/meals',     label: 'Meals',     Icon: Utensils   },
  { to: '/coach',     label: 'Coach',     Icon: Sparkles   },
  { to: '/family',    label: 'Family',    Icon: Users      },
]

export default function AppShell() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement | null>(null)
  const todayFetchCount = useIsFetching({ queryKey: ['today'] })
  const isTodayLoading = location.pathname === '/today' && todayFetchCount > 0
  const isLogRoute = location.pathname === '/log'

  // Reset scroll position on every route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  const swReady = useSwReady()

  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
    retry: false,
  })

  if (isLoading || !swReady) {
    return <SplashScreen />
  }

  if (error || !user) {
    return <Login />
  }

  if (user.is_password_temp) {
    return <TempPasswordPrompt />
  }

  const initials = getUserInitials(user.display_name)

  return (
    <div className="luma-bg" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'row' }}>
      <LogSheet />

      {/* Desktop Sidebar */}
      <DesktopSidebar user={user} isTodayLoading={isTodayLoading} />

      {/* Content column — flex column so mobile header/nav are in-flow (not fixed) */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Mobile header anchored to top of column */}
        {!isLogRoute && <MobileHeader initials={initials} />}

        {/* Scrollable page content */}
        <main
          ref={mainRef}
          className="thin-scroll mobile-shell-main"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            position: 'relative',
          }}
        >
          <Outlet />
        </main>

        {/* Mobile nav anchored to bottom of column */}
        {!isLogRoute && <MobileNav />}
      </div>
    </div>
  )
}

function DesktopSidebar({ user, isTodayLoading }: { user: User; isTodayLoading: boolean }) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { theme, setTheme, openLogSheet } = useUIStore()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [profilePlacement, setProfilePlacement] = useState<'up' | 'down'>('up')
  const [profileMaxHeight, setProfileMaxHeight] = useState(240)
  const profileRef = useRef<HTMLDivElement | null>(null)
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null)

  const initials = getUserInitials(user.display_name)

  useEffect(() => {
    setIsProfileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isProfileOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsProfileOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isProfileOpen])

  useLayoutEffect(() => {
    if (!isProfileOpen) return

    const updatePlacement = () => {
      const triggerRect = profileTriggerRef.current?.getBoundingClientRect()
      if (!triggerRect) return

      const viewportPadding = 16
      const spaceAbove = triggerRect.top - viewportPadding
      const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding
      const shouldOpenDown = spaceBelow > spaceAbove

      setProfilePlacement(shouldOpenDown ? 'down' : 'up')
      setProfileMaxHeight(Math.max(120, shouldOpenDown ? spaceBelow : spaceAbove))
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)

    return () => {
      window.removeEventListener('resize', updatePlacement)
    }
  }, [isProfileOpen])

  const handleLogout = async () => {
    setIsProfileOpen(false)
    await api.post('/auth/logout')
    await queryClient.invalidateQueries({ queryKey: ['me'] })
    await queryClient.invalidateQueries({ queryKey: ['today'] })
    window.location.assign('/')
  }

  return (
    <aside style={{
      width: 240,
      flexShrink: 0,
      padding: '28px 18px 24px',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      flexDirection: 'column',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.02), transparent)',
      position: 'relative',
    }}
    className="hidden md:flex"
    >
      <div style={{ padding: '0 8px 28px' }}>
        <LumaWordmark size={32}/>
      </div>


      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {DESKTOP_NAV_ITEMS.map((item) => (
          <SideLink key={item.to} {...item} showLoading={isTodayLoading && item.to === '/today'} />
        ))}
      </nav>

      <button
        type="button"
        onClick={openLogSheet}
        className="btn btn-primary"
        style={{
          width: '100%',
          marginTop: 14,
          padding: '10px 12px',
          gap: 6,
          justifyContent: 'center',
        }}
        aria-label="Log meal"
      >
        <Plus size={15} strokeWidth={2} />
        Log meal
      </button>

      <div style={{ flex: 1 }}/>

      <div ref={profileRef} className="desktop-profile-menu">
        <button
          type="button"
          className="glass desktop-profile-trigger"
          ref={profileTriggerRef}
          onClick={() => setIsProfileOpen((open) => !open)}
          aria-label="Open account panel"
          aria-expanded={isProfileOpen}
        >
          <span
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--sun-200), var(--sky-300) 46%, var(--sky-500))',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.14), 0 0 14px rgba(56,189,248,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 13, color: '#06121d', flexShrink: 0,
            }}
          >
            {initials}
          </span>
          <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{user.display_name || 'Operator'}</span>
          </span>
          <Settings size={15} strokeWidth={1.5} color="currentColor" style={{ color: 'var(--fg-quiet)', flexShrink: 0 }} />
        </button>

        {isProfileOpen && (
          <div
            className="desktop-profile-panel glass-bright"
            style={profilePlacement === 'down'
              ? { top: 'calc(100% + 10px)', bottom: 'auto', maxHeight: `${profileMaxHeight}px` }
              : { bottom: 'calc(100% + 10px)', top: 'auto', maxHeight: `${profileMaxHeight}px` }
            }
          >
            <div className="eyebrow" style={{ marginBottom: 10 }}>Display</div>
            <div className={`theme-toggle ${theme === 'light' ? 'light-mode' : ''}`} style={{ width: '100%', marginBottom: 12 }}>
              <button data-active={theme === 'dark' ? 'true' : 'false'} onClick={() => setTheme('dark')}>
                <Moon size={12} strokeWidth={1.5}/> Dark
              </button>
              <button data-active={theme === 'light' ? 'true' : 'false'} onClick={() => setTheme('light')}>
                <Sun size={12} strokeWidth={1.5}/> Light
              </button>
            </div>

            <div style={{ height: 1, background: 'var(--glass-edge)', margin: '14px 0 12px' }} />

            <NavLink
              to="/settings"
              className="mobile-profile-action"
              onClick={() => setIsProfileOpen(false)}
              style={{ marginBottom: 10 }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Settings size={15} strokeWidth={1.6} />
                <span>Open settings</span>
              </span>
              <ChevronDown size={14} strokeWidth={1.8} style={{ transform: 'rotate(-90deg)' }} />
            </NavLink>

            <button
              type="button"
              className="mobile-profile-action desktop-profile-signout"
              onClick={() => { void handleLogout() }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)', boxShadow: '0 0 10px var(--bad-glow)' }} />
                <span>Sign out</span>
              </span>
              <ChevronDown size={14} strokeWidth={1.8} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

function MobileHeader({ initials }: { initials: string }) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { theme, setTheme } = useUIStore()
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const { data: today } = useQuery<TodayData>({
    queryKey: ['today'],
    queryFn: () => api.get('/today'),
    staleTime: 60_000,
  })

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const cal = today?.adherence_today?.calories

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

  const handleLogout = async () => {
    setIsOpen(false)
    await api.post('/auth/logout')
    await queryClient.invalidateQueries({ queryKey: ['me'] })
    await queryClient.invalidateQueries({ queryKey: ['today'] })
    window.location.assign('/')
  }

  return (
    <div ref={panelRef} className="mobile-header md:hidden">
      <div className="mobile-header-inner">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none', userSelect: 'none' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.01em', lineHeight: 1 }}>
            {dateLabel}
          </span>
          {cal != null && (
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
              {cal.logged != null ? Math.round(cal.logged) : '—'} / {cal.target != null ? Math.round(cal.target) : '—'} kcal
            </span>
          )}
        </div>

        <div style={{ position: 'relative' }}>
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

              <NavLink
                to="/family"
                className="mobile-profile-action"
                onClick={() => setIsOpen(false)}
                style={{ marginTop: 10 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Users size={15} strokeWidth={1.6} />
                  <span>Family</span>
                </span>
                <ChevronDown size={14} strokeWidth={1.8} style={{ transform: 'rotate(-90deg)' }} />
              </NavLink>

              <button
                type="button"
                className="mobile-profile-action"
                onClick={() => { void handleLogout() }}
                style={{ marginTop: 10 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bad)', boxShadow: '0 0 10px var(--bad-glow)' }} />
                  <span>Sign out</span>
                </span>
                <ChevronDown size={14} strokeWidth={1.8} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            </div>
          )}
        </div>
      </div>
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
  const navigate = useNavigate()

  return (
    <div
      className="mobile-nav-wrap md:hidden"
      style={{
        paddingTop: 10, paddingLeft: 18, paddingRight: 18,
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
      }}
    >
      <div className="glass-bright" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 8px',
        borderRadius: 28,
        position: 'relative',
        pointerEvents: 'auto',
      }}>
        {/* Left 3 items */}
        {NAV_ITEMS.slice(0, 3).map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}

        {/* FAB */}
        <button
          onClick={() => navigate('/log')}
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

        {/* Right 3 items */}
        {NAV_ITEMS.slice(3).map((item) => (
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

function TempPasswordPrompt() {
  const queryClient = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="luma-bg" style={{ position: 'fixed', inset: 0, display: 'flex', zIndex: 9999 }}>
      {/* Aurora glow effect */}
      <div className="login-side-atmo" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <div className="glass login-glass" style={{
        width: '100%', maxWidth: 420,
        margin: 'auto',
        padding: 36,
        borderRadius: 28,
        position: 'relative',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex' }}><LumaLogo size={44}/></div>
          <h2 style={{
            margin: '18px 0 6px',
            fontSize: 24, fontWeight: 500,
            letterSpacing: '-0.02em',
            color: 'var(--fg-primary)',
          }}>
            Update your password
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.4 }}>
            You are logged in with a temporary password. Please set a secure password to access your space.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {error && (
            <div style={{
              padding: '12px 14px',
              background: 'rgba(251,113,133,0.10)',
              border: '1px solid rgba(251,113,133,0.25)',
              borderRadius: 12,
              fontSize: 13,
              color: 'var(--bad)',
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <AlertCircle size={14} strokeWidth={1.5}/> {error}
            </div>
          )}

          <div>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Current Password</div>
            <div className="field-input" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              border: '1px solid var(--glass-edge)',
              borderRadius: 14,
              background: 'var(--glass-1)',
            }}>
              <Lock size={16} color="var(--fg-quiet)"/>
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Temporary password"
                required
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--fg-quiet)' }}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>New Password</div>
            <div className="field-input" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              border: '1px solid var(--glass-edge)',
              borderRadius: 14,
              background: 'var(--glass-1)',
            }}>
              <ShieldCheck size={16} color="var(--fg-quiet)"/>
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                required
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--fg-quiet)' }}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Confirm New Password</div>
            <div className="field-input" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              border: '1px solid var(--glass-edge)',
              borderRadius: 14,
              background: 'var(--glass-1)',
            }}>
              <ShieldCheck size={16} color="var(--fg-quiet)"/>
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                required
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14,
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--fg-quiet)' }}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ marginTop: 8, padding: '14px 20px', fontSize: 14, width: '100%', opacity: loading ? 0.7 : 1, justifyContent: 'center' }}
          >
            {loading ? (
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--fg-primary)',
                display: 'inline-block',
                animation: 'spin 0.8s linear infinite',
              }}/>
            ) : (
              <>
                Update Password
                <ArrowRight size={15}/>
              </>
            )}
          </button>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
