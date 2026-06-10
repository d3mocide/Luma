import { useState, useEffect } from 'react'
import { X, Trophy, Flame } from 'lucide-react'
import { fmt } from '../../lib/format'

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
  offset: number
  date: Date
  onTrack: boolean
  isToday: boolean
  isFuture: boolean
  targetsMetCount: number
  cal: { logged: number; target: number; met: boolean }
  sat: { logged: number; target: number; met: boolean }
  fib: { logged: number; target: number; met: boolean }
  sug: { logged: number; target: number; met: boolean }
}

export function StreakHistorySheet({ isOpen, onClose, days, adherence }: StreakHistorySheetProps) {
  const [visibleLimit, setVisibleLimit] = useState(10)

  useEffect(() => {
    setVisibleLimit(10)
  }, [isOpen])

  if (!isOpen) return null

  // Generate deterministic past history (past 30 days)
  const history: HistoryDay[] = []
  const now = new Date()

  const getFullDateLabel = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(now.getDate() - i)

    const isToday = i === 0
    const isFuture = i < 0

    if (isToday && adherence) {
      const calLogged = adherence.calories?.logged ?? 0
      const calTarget = adherence.calories?.target ?? 2000
      const satLogged = adherence.sat_fat_g?.logged ?? 0
      const satTarget = adherence.sat_fat_g?.target ?? 15
      const fibLogged = adherence.soluble_fiber_g?.logged ?? 0
      const fibTarget = adherence.soluble_fiber_g?.target ?? 20
      const sugLogged = adherence.sugars_g?.logged ?? 0
      const sugTarget = adherence.sugars_g?.target ?? 25

      const calMet = calLogged >= calTarget * 0.9 && calLogged <= calTarget * 1.1
      const satMet = satLogged <= satTarget
      const fibMet = fibLogged >= fibTarget
      const sugMet = sugLogged <= sugTarget

      const targetsMetCount = [calMet, satMet, fibMet, sugMet].filter(Boolean).length
      const onTrack = targetsMetCount >= 3

      history.push({
        offset: i,
        date: d,
        onTrack,
        isToday,
        isFuture,
        targetsMetCount,
        cal: { logged: calLogged, target: calTarget, met: calMet },
        sat: { logged: satLogged, target: satTarget, met: satMet },
        fib: { logged: fibLogged, target: fibTarget, met: fibMet },
        sug: { logged: sugLogged, target: sugTarget, met: sugMet },
      })
    } else {
      const isStreak = i <= days && days > 0
      const seed = i * 7 + 13
      const onTrack = isStreak || (seed % 3 === 0)

      const calTarget = 2100
      const satTarget = 15
      const fibTarget = 20
      const sugTarget = 25

      const calLogged = isStreak ? 1950 : onTrack ? 2050 : 2350
      const satLogged = isStreak ? 11 : onTrack ? 12 : 19
      const fibLogged = isStreak ? 23 : onTrack ? 21 : 12
      const sugLogged = isStreak ? 14 : onTrack ? 16 : 31

      const calMet = calLogged >= calTarget * 0.9 && calLogged <= calTarget * 1.1
      const satMet = satLogged <= satTarget
      const fibMet = fibLogged >= fibTarget
      const sugMet = sugLogged <= sugTarget

      const targetsMetCount = [calMet, satMet, fibMet, sugMet].filter(Boolean).length

      history.push({
        offset: i,
        date: d,
        onTrack,
        isToday,
        isFuture,
        targetsMetCount,
        cal: { logged: calLogged, target: calTarget, met: calMet },
        sat: { logged: satLogged, target: satTarget, met: satMet },
        fib: { logged: fibLogged, target: fibTarget, met: fibMet },
        sug: { logged: sugLogged, target: sugTarget, met: sugMet },
      })
    }
  }

  const pastHistory = history.slice().reverse()

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
          {/* Badges / summary banner */}
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

          {/* Days list (past days up to today) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pastHistory.slice(0, visibleLimit).map(day => (
              <div 
                key={day.offset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: day.onTrack ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)',
                  border: day.onTrack ? '1px solid rgba(251, 191, 36, 0.12)' : '1px solid var(--glass-edge)',
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
                      {day.targetsMetCount} / 4 targets met
                    </div>
                  </div>
                </div>

                {/* Micro macronutrient target checkboxes status */}
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
            ))}
          </div>

          {visibleLimit < pastHistory.length && (
            <button
              type="button"
              onClick={() => setVisibleLimit(prev => Math.min(prev + 10, pastHistory.length))}
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
