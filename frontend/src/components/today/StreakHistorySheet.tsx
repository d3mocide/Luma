import { useState, useLayoutEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Trophy, Flame } from 'lucide-react'
import { fmt } from '../../lib/format'
import { api } from '../../lib/api'
import type { StreakHistoryDay } from '../../lib/api'
import { scoreDay } from '../../lib/streak'
import type { MetricState } from '../../lib/streak'

interface DayAdherence {
  logged?: number | null
  target?: number | null
  pct?: number | null
}

interface AdherenceToday {
  calories?: DayAdherence | null
  sat_fat_g?: DayAdherence | null
  soluble_fiber_g?: DayAdherence | null
  sodium_mg?: DayAdherence | null
}

interface StreakHistorySheetProps {
  isOpen: boolean
  onClose: () => void
  days: number
  adherence?: AdherenceToday | null
  // Server's current date (YYYY-MM-DD, in SERVER_TIMEZONE) from /today, so the
  // "Today" row lines up with the server clock rather than the device clock.
  todayStr?: string
}

interface MacroCell {
  logged: number
  target: number | null
  state: MetricState
}

interface HistoryDay {
  key: string
  date: Date
  onTrack: boolean
  isToday: boolean
  targetsMetCount: number
  targetsPossible: number
  loggedAnything: boolean
  cal: MacroCell
  sat: MacroCell
  fib: MacroCell
  sod: MacroCell
}

// Badge palette per metric when its target is met; missed/untracked fall back to
// neutral styling so an unset target reads as "not tracked", never as a failure.
function badgeStyle(state: MetricState, met: { bg: string; fg: string; border: string }) {
  if (state === 'met') return { background: met.bg, color: met.fg, border: `1px solid ${met.border}` }
  if (state === 'untracked')
    return { background: 'transparent', color: 'var(--fg-faint)', border: '1px dashed rgba(255,255,255,0.08)' }
  return { background: 'rgba(255,255,255,0.04)', color: 'var(--fg-faint)', border: '1px solid rgba(255,255,255,0.05)' }
}

function badgeTitle(label: string, cell: MacroCell, unit: string, digits: number) {
  if (cell.state === 'untracked') return `${label}: no target set`
  return `${label}: ${fmt(cell.logged, digits)}${unit} / ${fmt(cell.target, digits)}${unit}`
}

export function StreakHistorySheet({ isOpen, onClose, days, adherence, todayStr }: StreakHistorySheetProps) {
  const [visibleLimit, setVisibleLimit] = useState(10)
  // Prefer the server's date; fall back to the device date only if it's missing.
  const resolvedTodayStr = todayStr ?? new Date().toLocaleDateString('en-CA')

  const { data: historyData, isLoading } = useQuery<StreakHistoryDay[]>({
    queryKey: ['streak-history'],
    queryFn: () => api.get<StreakHistoryDay[]>('/today/streak-history'),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  })

  useLayoutEffect(() => () => setVisibleLimit(10), [isOpen])

  if (!isOpen) return null

  const getFullDateLabel = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  // Build display list (newest first) from real API data
  const history: HistoryDay[] = []
  if (historyData) {
    const sorted = [...historyData].reverse() // API returns oldest→newest; we want newest first
    for (const apiDay of sorted) {
      const isToday = apiDay.date === resolvedTodayStr
      // Use noon local time to avoid DST-boundary display issues
      const d = new Date(`${apiDay.date}T12:00:00`)

      // For today, use live adherence (stays in sync with the main Today screen);
      // for past days, the server's stored totals. Either way scoreDay() applies
      // the one shared rule, so unset targets are excluded rather than faked.
      const logged = isToday && adherence
        ? {
            cal: adherence.calories?.logged,
            sat: adherence.sat_fat_g?.logged,
            fib: adherence.soluble_fiber_g?.logged,
            sod: adherence.sodium_mg?.logged,
          }
        : { cal: apiDay.cal_logged, sat: apiDay.sat_logged, fib: apiDay.fib_logged, sod: apiDay.sod_logged }

      const targets = isToday && adherence
        ? {
            cal: adherence.calories?.target ?? apiDay.cal_target,
            sat: adherence.sat_fat_g?.target ?? apiDay.sat_target,
            fib: adherence.soluble_fiber_g?.target ?? apiDay.fib_target,
            sod: adherence.sodium_mg?.target ?? apiDay.sod_target,
          }
        : { cal: apiDay.cal_target, sat: apiDay.sat_target, fib: apiDay.fib_target, sod: apiDay.sod_target }

      const score = scoreDay(logged, targets)

      history.push({
        key: apiDay.date,
        date: d,
        onTrack: score.onTrack,
        isToday,
        targetsMetCount: score.targetsMet,
        targetsPossible: score.targetsPossible,
        loggedAnything: apiDay.logged_anything,
        cal: { logged: logged.cal ?? 0, target: targets.cal ?? null, state: score.cal },
        sat: { logged: logged.sat ?? 0, target: targets.sat ?? null, state: score.sat },
        fib: { logged: logged.fib ?? 0, target: targets.fib ?? null, state: score.fib },
        sod: { logged: logged.sod ?? 0, target: targets.sod ?? null, state: score.sod },
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
                  ? 'A full week of hitting your daily targets — outstanding consistency.'
                  : 'Meet most of your daily targets each day to grow your streak flame.'}
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
                        {!day.loggedAnything
                          ? 'Nothing logged'
                          : day.targetsPossible > 0
                            ? `${day.targetsMetCount} / ${day.targetsPossible} targets met`
                            : 'Logged'}
                      </div>
                    </div>
                  </div>

                  {/* Macro target badges */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span
                      title={badgeTitle('Calories', day.cal, '', 0)}
                      style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                        ...badgeStyle(day.cal.state, { bg: 'rgba(56,189,248,0.1)', fg: 'var(--sky-300)', border: 'rgba(56,189,248,0.18)' }),
                      }}
                    >
                      CAL
                    </span>
                    <span
                      title={badgeTitle('Sat Fat', day.sat, 'g', 1)}
                      style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                        ...badgeStyle(day.sat.state, { bg: 'rgba(251,191,36,0.1)', fg: 'var(--sun-300)', border: 'rgba(251,191,36,0.18)' }),
                      }}
                    >
                      FAT
                    </span>
                    <span
                      title={badgeTitle('Sol. Fiber', day.fib, 'g', 1)}
                      style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                        ...badgeStyle(day.fib.state, { bg: 'rgba(52,211,153,0.1)', fg: 'var(--good)', border: 'rgba(52,211,153,0.18)' }),
                      }}
                    >
                      FIB
                    </span>
                    <span
                      title={badgeTitle('Sodium', day.sod, 'mg', 0)}
                      style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                        ...badgeStyle(day.sod.state, { bg: 'rgba(94,234,212,0.1)', fg: 'var(--aurora-mint)', border: 'rgba(94,234,212,0.18)' }),
                      }}
                    >
                      SOD
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
              Your streak flame stays alive on days you hit <strong>at least 3 of your daily targets</strong> — or all of them, if you track fewer than 3. Targets you haven't set don't count against you.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: 'var(--fg-tertiary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                <span><strong>Calories:</strong> Within range</span>
                <span style={{ color: 'var(--sky-300)' }}>85–110% of target</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                <span><strong>Saturated Fat:</strong> LDL cap</span>
                <span style={{ color: 'var(--sun-300)' }}>≤ 110% of target</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: 6 }}>
                <span><strong>Soluble Fiber:</strong> LDL clearance floor</span>
                <span style={{ color: 'var(--good)' }}>≥ 90% of target</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 2 }}>
                <span><strong>Sodium:</strong> Blood-pressure cap</span>
                <span style={{ color: 'var(--aurora-mint)' }}>≤ 110% of target</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
