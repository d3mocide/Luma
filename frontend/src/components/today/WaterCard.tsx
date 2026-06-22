import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Droplet, Minus, Repeat } from 'lucide-react'
import { api, WaterToday } from '../../lib/api'
import { BUDDIES, BUDDY_IDS, BuddyId, isBuddyId } from '../../lib/water-buddies'
import { hydrationNudge } from '../../lib/water-pace'
import { BuddySprite } from './WaterBuddies'
import { useMeasurementSystem, measurementVolumeUnit, convertVolume } from '../../lib/measurements'

export function WaterCard({ compact }: { compact?: boolean }) {
  const queryClient = useQueryClient()
  const [showPicker, setShowPicker] = useState(false)
  const [hopKey, setHopKey] = useState(0)

  // The water day rolls over on the server clock (SERVER_TIMEZONE); the backend
  // no longer honors a client tz hint, so none is sent.
  const { data } = useQuery<WaterToday>({
    queryKey: ['water'],
    queryFn: () => api.get('/water/today'),
  })

  const logMutation = useMutation({
    mutationFn: (amountMl?: number) =>
      api.post<WaterToday>('/water/log', {
        amount_ml: amountMl ?? data?.glass_ml ?? 250,
      }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['water'], fresh)
      setHopKey((k) => k + 1)
    },
  })

  const undoMutation = useMutation({
    mutationFn: () => api.delete<WaterToday>('/water/last'),
    onSuccess: (fresh) => queryClient.setQueryData(['water'], fresh),
  })

  const buddyMutation = useMutation({
    mutationFn: (buddy: BuddyId) =>
      api.put<{ buddy: string; goal_ml: number }>('/water/settings', { buddy }),
    onSuccess: (res) => {
      queryClient.setQueryData<WaterToday>(['water'], (old) =>
        old ? { ...old, buddy: res.buddy } : old,
      )
      setShowPicker(false)
    },
  })

  const measurementSystem = useMeasurementSystem()
  const volumeUnit = measurementVolumeUnit(measurementSystem)

  const goalMl = data?.goal_ml ?? 2000
  const totalMl = data?.total_ml ?? 0
  const glassMl = data?.glass_ml ?? 250
  
  const displayGoal = convertVolume(goalMl, measurementSystem)
  const displayTotal = convertVolume(totalMl, measurementSystem)
  const displayGlass = convertVolume(glassMl, measurementSystem)

  const pct = Math.min(totalMl / goalMl, 1)
  // Waterline is capped below the vessel top so the buddy never rides out of frame
  const fillPct = pct * 72
  const goalMet = data?.goal_met ?? false
  const buddyId: BuddyId = isBuddyId(data?.buddy) ? data.buddy : 'frog'
  const buddy = BUDDIES[buddyId]

  const waterTop = goalMet ? 'rgba(56,189,248,0.52)' : 'rgba(56,189,248,0.40)'
  const waterBottom = goalMet ? 'rgba(14,165,233,0.26)' : 'rgba(14,165,233,0.16)'

  const nudge = data ? hydrationNudge({ totalMl, goalMl, glassMl, goalMet }) : null

  const handleLog = () => {
    if (!logMutation.isPending) logMutation.mutate(undefined)
  }

  return (
    <div
      className="glass"
      style={{
        padding: compact ? 18 : 24,
        marginBottom: compact ? 14 : undefined,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="eyebrow">Hydration</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => undoMutation.mutate()}
            disabled={totalMl === 0 || undoMutation.isPending}
            aria-label="Undo last glass"
            title="Undo last glass"
            style={{ background: 'none', border: 'none', cursor: totalMl === 0 ? 'default' : 'pointer', padding: 4, color: totalMl === 0 ? 'var(--fg-faint)' : 'var(--fg-quiet)' }}
          >
            <Minus size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setShowPicker((v) => !v)}
            aria-label="Change water buddy"
            title="Change water buddy"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: showPicker ? 'var(--sky-400)' : 'var(--fg-quiet)' }}
          >
            <Repeat size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="num" style={{ fontSize: compact ? 26 : 30, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--fg-primary)' }}>
            {data && displayTotal != null ? Math.round(displayTotal) : '—'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>/ {displayGoal != null ? Math.round(displayGoal) : '—'} {volumeUnit}</span>
        </div>
        <div style={{ fontSize: compact ? 18 : 22, fontWeight: 600, color: 'var(--sky-400)', fontFamily: 'var(--font-mono)' }}>
          {Math.round(pct * 100)}%
        </div>
      </div>

      {showPicker ? (
        <div style={{ flex: 1, minHeight: compact ? 190 : 220, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {BUDDY_IDS.map((id) => {
            const b = BUDDIES[id]
            const selected = id === buddyId
            return (
              <button
                key={id}
                onClick={() => buddyMutation.mutate(id)}
                disabled={buddyMutation.isPending}
                aria-label={`Choose ${b.label}`}
                className="glass-inset"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: 8,
                  cursor: 'pointer',
                  color: b.color,
                  border: selected ? `1px solid ${b.color}` : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(0,0,0,0.25)',
                }}
              >
                <BuddySprite buddy={id} size={42} />
                <span style={{ fontSize: 10, color: selected ? 'var(--fg-secondary)' : 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{b.label}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 12 : 20, justifyContent: 'center', width: '100%' }}>
          <div
            role="button"
            tabIndex={0}
            aria-label="Log a glass of water"
            onClick={handleLog}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleLog() } }}
            className="glass-inset"
            style={{
              position: 'relative',
              flex: 1,
              minHeight: compact ? 190 : 220,
              borderRadius: 20,
              overflow: 'hidden',
              cursor: 'pointer',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Goal line */}
            <div style={{ position: 'absolute', left: 10, right: 10, bottom: '72%', borderTop: '1px dashed rgba(255,255,255,0.14)', pointerEvents: 'none' }} />

            {/* Water fill */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: `${fillPct}%`,
                background: `linear-gradient(180deg, ${waterTop}, ${waterBottom})`,
                transition: 'height 0.9s cubic-bezier(0.22, 0.8, 0.3, 1)',
              }}
            >
              <svg
                className="water-wave"
                viewBox="0 0 120 10"
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{ position: 'absolute', top: -7, left: 0, width: '200%', height: 8, display: 'block' }}
              >
                <path d="M0 8 Q7.5 2 15 8 T30 8 T45 8 T60 8 T75 8 T90 8 T105 8 T120 8 V10 H0 Z" fill={waterTop} />
              </svg>
            </div>

            {/* Buddy riding the water surface */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: `calc(${fillPct}% - 4px)`,
                transform: 'translateX(-50%)',
                transition: 'bottom 0.9s cubic-bezier(0.22, 0.8, 0.3, 1)',
                color: buddy.color,
                pointerEvents: 'none',
              }}
            >
              <div className="water-buddy">
                <div key={hopKey} className={hopKey > 0 ? 'water-buddy-hop' : undefined}>
                  <BuddySprite buddy={buddyId} size={compact ? 76 : 82} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick presets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', height: compact ? 190 : 220, flex: 1, maxWidth: compact ? 100 : 120 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', marginBottom: 2 }}>Quick Log</span>
            {(data?.presets || (measurementSystem === 'imperial' ? [237, 473, 710] : [250, 500, 750])).map((mlVal) => {
              const displayVal = measurementSystem === 'imperial' ? Math.round(convertVolume(mlVal, 'imperial') || 0) : mlVal;
              const displayLabel = measurementSystem === 'imperial' ? `+${displayVal}oz` : `+${displayVal}ml`;
              return (
                <button
                  key={mlVal}
                  onClick={() => !logMutation.isPending && logMutation.mutate(mlVal)}
                  className="btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    height: compact ? 38 : 42,
                    fontSize: compact ? 11 : 12,
                    fontWeight: 600,
                    borderRadius: 12,
                    width: '100%',
                    background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(56,189,248,0.02))',
                    borderColor: 'rgba(56,189,248,0.18)',
                    color: 'var(--sky-300)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    fontFamily: 'var(--font-mono)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(56,189,248,0.05))'
                    e.currentTarget.style.borderColor = 'rgba(56,189,248,0.35)'
                    e.currentTarget.style.color = 'var(--sky-200)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(56,189,248,0.02))'
                    e.currentTarget.style.borderColor = 'rgba(56,189,248,0.18)'
                    e.currentTarget.style.color = 'var(--sky-300)'
                  }}
                >
                  <Droplet size={compact ? 10 : 12} strokeWidth={2.5} style={{ opacity: 0.8 }} />
                  <span>{displayLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!showPicker && (
        nudge ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--sky-400)' }}>
            <Droplet size={12} strokeWidth={1.5} />
            <span>{nudge}</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--fg-quiet)', textAlign: 'center' }}>
            Tap to add {displayGlass != null ? Math.round(displayGlass) : '—'} {volumeUnit}
          </div>
        )
      )}
    </div>
  )
}
