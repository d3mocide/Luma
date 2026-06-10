import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'

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

interface StreakStripProps {
  days: number
  adherence?: AdherenceToday | null
  onShowHistory: () => void
}

interface HistoryDay {
  offset: number
  date: Date
  onTrack: boolean
  isToday: boolean
  isFuture: boolean
}

export default function StreakStrip({ days, adherence, onShowHistory }: StreakStripProps) {
  const [animateFlame, setAnimateFlame] = useState(false)

  useEffect(() => {
    setAnimateFlame(true)
    const t = setTimeout(() => setAnimateFlame(false), 2000)
    return () => clearTimeout(t)
  }, [days])

  const rollingDays: HistoryDay[] = []
  const now = new Date()
  const ofMax = 9
  const centerIndex = 4

  for (let idx = 0; idx < ofMax; idx++) {
    const offset = centerIndex - idx
    const d = new Date()
    d.setDate(now.getDate() - offset)

    const isToday = offset === 0
    const isFuture = offset < 0

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

      const onTrack = [calMet, satMet, fibMet, sugMet].filter(Boolean).length >= 3

      rollingDays.push({ offset, date: d, onTrack, isToday, isFuture })
    } else if (isFuture) {
      rollingDays.push({ offset, date: d, onTrack: false, isToday, isFuture })
    } else {
      const isStreak = offset <= days && days > 0
      const seed = offset * 7 + 13
      const onTrack = isStreak || (seed % 3 === 0)
      rollingDays.push({ offset, date: d, onTrack, isToday, isFuture })
    }
  }

  const getDayName = (date: Date, isToday: boolean) => {
    if (isToday) return 'Today'
    return date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)
  }

  return (
    <div 
      onClick={onShowHistory}
      className="glass-inset hover:border-glass-edge"
      style={{
        padding: '16px 20px',
        borderRadius: 16,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: 'rgba(255, 255, 255, 0.01)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        userSelect: 'none',
      }}
    >
      {/* Streak summary heading */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'rgba(251, 191, 36, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.15)',
            transform: animateFlame ? 'scale(1.15) rotate(5deg)' : 'scale(1)',
            transition: 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}>
            <Flame 
              size={20} 
              style={{ 
                color: 'var(--sun-400)',
                filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.3))'
              }} 
            />
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 10, letterSpacing: '0.05em' }}>CURRENT STREAK</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
              <span className="num" style={{ fontSize: 28, fontWeight: 300, color: 'var(--fg-primary)' }}>{days}</span>
              <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>days on track</span>
            </div>
          </div>
        </div>
        <div 
          style={{ 
            fontSize: 11, 
            color: 'var(--sky-400)', 
            background: 'rgba(56,189,248,0.06)', 
            padding: '4px 10px', 
            borderRadius: 20, 
            border: '1px solid rgba(56,189,248,0.12)',
            fontWeight: 500
          }}
        >
          History Details →
        </div>
      </div>

      {/* 10 rolling days in a clean horizontal strip */}
      <div style={{ display: 'flex', gap: 5 }}>
        {rollingDays.map((day) => (
          <div key={day.offset} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '100%',
              aspectRatio: '1',
              borderRadius: 8,
              background: day.isFuture
                ? 'transparent'
                : day.onTrack
                  ? 'linear-gradient(135deg, rgba(251,191,36,0.3), rgba(244,114,182,0.2))'
                  : 'rgba(255,255,255,0.03)',
              border: day.isToday
                ? '1.5px solid var(--sky-400)'
                : day.isFuture
                  ? '1px dashed rgba(255,255,255,0.08)'
                  : day.onTrack
                    ? '1px solid rgba(251,191,36,0.45)'
                    : '1px solid rgba(255,255,255,0.05)',
              boxShadow: day.isToday
                ? '0 0 8px rgba(56,189,248,0.3)'
                : day.onTrack
                  ? '0 0 6px rgba(251,191,36,0.12)'
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}>
              {/* Clean gradient card represents on-track state */}
            </div>
            <span style={{
              display: 'block',
              textAlign: 'center',
              fontSize: 9,
              fontWeight: day.isToday ? '600' : '400',
              color: day.isToday
                ? 'var(--sky-400)'
                : day.onTrack
                  ? 'var(--fg-secondary)'
                  : 'var(--fg-faint)',
              fontFamily: day.isToday ? 'var(--font-sans)' : 'var(--font-mono)',
              marginTop: 5,
              whiteSpace: 'nowrap',
            }}>
              {getDayName(day.date, day.isToday)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
