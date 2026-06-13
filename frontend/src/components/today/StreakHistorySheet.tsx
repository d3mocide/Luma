import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Trophy, Flame } from 'lucide-react'
import { fmt } from '../../lib/format'
import { api } from '../../lib/api'
import type { StreakHistoryDay } from '../../lib/api'

interface DayAdherence {
  logged?: number | null
  target?: number | null
  pct?: number | null
}

interface AdherenceToday {
  calories?: DayAdherence | null
  sat_fat_g?: DayAdherence | null
  soluble_fiber_g?: DayAdherence | null
  sugars_g?: DayAdherence | null
}

interface StreakHistorySheetProps {
  isOpen: boolean
  onClose: () => void
  days: number
  adherence?: AdherenceToday | null
}

interface HistoryDay {
  key: string
  date: Date
  onTrack: boolean
  isToday: boolean
  targetsMetCount: number
  loggedAnything: boolean
  cal: { logged: number; target: number; met: boolean }
  sat: { logged: number; target: number; met: boolean }
  fib: { logged: number; target: number; met: boolean }
  sug: { logged: number; target: number; met: boolean }
}

export function StreakHistorySheet({ isOpen, onClose, days, adherence }: StreakHistorySheetProps) {
  const [visibleLimit, setVisibleLimit] = useState(10)
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  // YYYY-MM-DD in local timezone for "isToday" comparison
  const todayStr = new Date().toLocaleDateString('en-CA')

  const { data: historyData, isLoading } = useQuery<StreakHistoryDay[]>({
    queryKey: ['streak-history', browserTz],
    queryFn: () => api.get<StreakHistoryDay[]>(`/today/streak-history?tz=${encodeURIComponent(browserTz)}`),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    setVisibleLimit(10)
  }, [isOpen])

  if (!isOpen) return null

  const getFullDateLabel = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // Build display list (newest first) from real API data
  const history: HistoryDay[] = []
  if (historyData) {
    const sorted = [...historyData].reverse() // API returns oldest→newest; we want newest first
    for (const apiDay of sorted) {
      const isToday = apiDay.date === todayStr
      // Use noon local time to avoid DST-boundary display issues
      const d = new Date(`${apiDay.date}T12:00:00`)

      let cal: HistoryDay['cal']
      let sat: HistoryDay['sat']
      let fib: HistoryDay['fib']
      let sug: HistoryDay['sug']
      let targetsMetCount: number
      let onTrack: boolean

      if (isToday && adherence) {
        // Use live adherence data for today (stays in sync with the main Today screen)
        const calLogged = adherence.calories?.logged ?? 0
        const calTarget = adherence.calories?.target ?? apiDay.cal_target ?? 2000
        const satLogged = adherence.sat_fat_g?.logged ?? 0
        const satTarget = adherence.sat_fat_g?.target ?? apiDay.sat_target ?? 15
        const fibLogged = adherence.soluble_fiber_g?.logged ?? 0
        const fibTarget = adherence.soluble_fiber_g?.target ?? apiDay.fib_target ?? 20
        const sugLogged = adherence.sugars_g?.logged ?? 0
        const sugTarget = adherence.sugars_g?.target ?? apiDay.sug_target ?? 25

        const calMet = calLogged >= calTarget * 0.9 && calLogged <= calTarget * 1.1
        const satMet = satLogged <= satTarget
        const fibMet = fibLogged >= fibTarget
        const sugMet = sugLogged <= sugTarget

        targetsMetCount = [calMet, satMet, fibMet, sugMet].filter(Boolean).length
        onTrack = targetsMetCount >= 3
        cal = { logged: calLogged, target: calTarget, met: calMet }
        sat = { logged: satLogged, target: satTarget, met: satMet }
        fib = { logged: fibLogged, target: fibTarget, met: fibMet }
        sug = { logged: sugLogged, target: sugTarget, met: sugMet }
      } else {
        const calTarget = apiDay.cal_target ?? 2000
        const satTarget = apiDay.sat_target ?? 15
        const fibTarget = apiDay.fib_target ?? 20
        const sugTarget = apiDay.sug_target ?? 25
        const calLogged = apiDay.cal_logged ?? 0
        const satLogged = apiDay.sat_logged ?? 0
        const fibLogged = apiDay.fib_logged ?? 0
        const sugLogged = apiDay.sug_logged ?? 0

        targetsMetCount = apiDay.targets_met
        onTrack = apiDay.on_track
        cal = { logged: calLogged, target: calTarget, met: calLogged >= calTarget * 0.9 && calLogged <= calTarget * 1.1 }
        sat = { logged: satLogged, target: satTarget, met: satLogged <= satTarget }
        fib = { logged: fibLogged, target: fibTarget, met: fibLogged >= fibTarget }
        sug = { logged: sugLogged, target: sugTarget, met: sugLogged <= sugTarget }
      }

      history.push({
        key: apiDay.date,
        date: d,
        onTrack,
        isToday,
        targetsMetCount,
        loggedAnything: apiDay.logged_anything,
        cal,
        sat,
        fib,
        sug,
      })
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5,8,17,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 200,
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxHeight: '92dvh',
          background: 'linear-gradient(180deg, rgba(13,20,37,0.86), rgba(8,13,26,0.94))',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          borderTop: '1px solid var(--glass-edge-strong)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 12px',
          borderBottom: '1px solid var(--glass-edge)',
          flexShrink: 0,
        }}>
          <div>
            <span className="eyebrow" style={{ color: 'var(--sun-400)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
              <Flame size={12} /> STREAK JOURNEY
            </span>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-primary)', marginTop: 4 }}>Streak Details</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--glass-edge)',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: 'var(--fg-tertiary)',
              lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px 32px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary banner */}
          <div
            style={{
              background: 'rgba(251, 191, 36, 0.04)',
              border: '1px solid rgba(251, 191, 36, 0.1)',
              borderRadius: 16,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Trophy size={28} style={{ color: 'var(--sun-400)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>
                {days >= 7 ? 'Perfect Week Achieved!' : `${days} Day Streak`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-secondary)', marginTop: 2 }}>
                {days >= 7
                  ? 'Excellent consistency. You are keeping saturated fat low and fiber high.'
                  : 'Log at least 3 targets successfully every day to grow your streak flame!'}
              </div>
            </div>
          </div>

          {/* Days list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isLoading && history.length === 0 ? (
              Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 56,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--glass-edge)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                />
              ))
            ) : (
              history.slice(0, visibleLimit).map(day => (
                <div
                  key={day.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: day.onTrack ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)',
                    border: day.onTrack ? '1px solid rgba(251, 191, 36, 0.12)' : '1px solid var(--glass-edge)',
                    opacity: day.loggedAnything ? 1 : 0.45,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: day.onTrack ? 'var(--sun-400)' : 'rgba(255,255,255,0.1)'
                    }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: day.onTrack ? 'var(--fg-primary)' : 'var(--fg-secondary)' }}>
                        {day.isToday ? 'Today' : getFullDateLabel(day.date)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', marginTop: 1 }}>
                        {day.loggedAnything ? `${day.targetsMetCount} / 4 targets met` : 'Nothing logged'}
                      </div>
                    </div>
                  </div>

                  {/* Macro target badges */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span
                      title={`Calories: ${fmt(day.cal.logged, 0)}/${fmt(day.cal.target, 0)}`}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: day.cal.met ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.04)',
                        color: day.cal.met ? 'var(--sky-300)' : 'var(--fg-faint)',
                        border: day.cal.met ? '1px solid rgba(56,189,248,0.18)' : '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      CAL
                    </span>
                    <span
                      title={`Sat Fat: ${fmt(day.sat.logged, 1)}g/${fmt(day.sat.target, 1)}g`}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: day.sat.met ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.04)',
                        color: day.sat.met ? 'var(--sun-300)' : 'var(--fg-faint)',
                        border: day.sat.met ? '1px solid rgba(251,191,36,0.18)' : '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      FAT
                    </span>
                    <span
                      title={`Fiber: ${fmt(day.fib.logged, 1)}g/${fmt(day.fib.target, 1)}g`}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: day.fib.met ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.04)',
                        color: day.fib.met ? 'var(--good)' : 'var(--fg-faint)',
                        border: day.fib.met ? '1px solid rgba(52,211,153,0.18)' : '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      FIB
                    </span>
                    <span
                      title={`Sugar: ${fmt(day.sug.logged, 1)}g/${fmt(day.sug.target, 1)}g`}
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 6,
                        background: day.sug.met ? 'rgba(244,114,182,0.1)' : 'rgba(255,255,255,0.04)',
                        color: day.sug.met ? 'var(--aurora-pink)' : 'var(--fg-faint)',
                        border: day.sug.met ? '1px solid rgba(244,114,182,0.18)' : '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      SUG
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {!isLoading && visibleLimit < history.length && (
            <button
              type="button"
              onClick={() => setVisibleLimit(prev => Math.min(prev + 10, history.length))}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--glass-edge)',
                color: 'var(--sky-400)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'center',
                marginTop: 4,
                transition: 'all 0.2s ease',
              }}
              className="hover:bg-glass-edge"
            >
              Show Past 10 Days
            </button>
          )}

          {/* Info Card: How Streaks Work */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--glass-edge)',
              borderRadius: 16,
              padding: '14px 16px',
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Flame size={14} style={{ color: 'var(--sun-400)' }} />
              How Streaks Work
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
              Your streak flame stays alive on days when you meet <strong>at least 3 out of 4</strong> daily targets:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: 'var(--fg-tertiary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                <span><strong>Calories:</strong> Target Range</span>
                <span style={{ color: 'var(--sky-300)' }}>±10% tolerance window</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                <span><strong>Saturated Fat:</strong> LDL cap limit</span>
                <span style={{ color: 'var(--sun-300)' }}>Strict limit (≤100%)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                <span><strong>Soluble Fiber:</strong> LDL clearance floor</span>
                <span style={{ color: 'var(--good)' }}>≥90% floor target</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 2 }}>
                <span><strong>Sugar:</strong> Metabolic limit max</span>
                <span style={{ color: 'var(--aurora-pink)' }}>Strict limit (≤100%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
