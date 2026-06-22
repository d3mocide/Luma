import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown } from 'lucide-react'
import { api, WaterSettings } from '../../lib/api'
import { BUDDIES, BUDDY_IDS, BuddyId, isBuddyId } from '../../lib/water-buddies'
import { BuddySprite } from '../today/WaterBuddies'
import { useMeasurementSystem, convertVolume, convertVolumeToMl } from '../../lib/measurements'

const GOAL_OPTIONS_METRIC = [
  { ml: 1500, label: '1.5 L' },
  { ml: 2000, label: '2 L' },
  { ml: 2500, label: '2.5 L' },
  { ml: 3000, label: '3 L' },
  { ml: 3500, label: '3.5 L' },
]

const GOAL_OPTIONS_IMPERIAL = [
  { ml: 1479, label: '50 fl oz' },
  { ml: 1893, label: '64 fl oz' },
  { ml: 2366, label: '80 fl oz' },
  { ml: 2957, label: '100 fl oz' },
  { ml: 3549, label: '120 fl oz' },
]

const GLASS_OPTIONS_METRIC = [
  { ml: 200, label: '200 ml' },
  { ml: 250, label: '250 ml' },
  { ml: 300, label: '300 ml' },
  { ml: 400, label: '400 ml' },
  { ml: 500, label: '500 ml' },
]

const GLASS_OPTIONS_IMPERIAL = [
  { ml: 237, label: '8 fl oz' },
  { ml: 296, label: '10 fl oz' },
  { ml: 355, label: '12 fl oz' },
  { ml: 473, label: '16 fl oz' },
  { ml: 591, label: '20 fl oz' },
]



function Field({ 
  label, 
  hint, 
  children, 
  isOpen, 
  dropdown 
}: { 
  label: string; 
  hint?: string; 
  children: React.ReactNode; 
  isOpen?: boolean; 
  dropdown?: React.ReactNode 
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, position: 'relative' }}>
      <div className="eyebrow" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
        <span>{label}</span>
        {hint && <span style={{ color: 'var(--fg-quiet)' }}>{hint}</span>}
      </div>
      <div
        className="field-input"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 14px',
          border: `1px solid ${isOpen ? 'rgba(56,189,248,0.3)' : 'var(--glass-edge)'}`,
          borderRadius: 14,
          background: isOpen ? 'var(--glass-1)' : 'var(--glass-2)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        {children}
      </div>
      {dropdown}
    </div>
  )
}

function optionStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    background: active ? 'rgba(56,189,248,0.1)' : 'transparent',
    color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
    fontSize: 13,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s, color 0.1s',
  }
}

function handleOptionEnter(e: React.MouseEvent<HTMLButtonElement>) {
  const active = e.currentTarget.getAttribute('aria-selected') === 'true'
  if (!active) {
    e.currentTarget.style.background = 'var(--glass-3)'
    e.currentTarget.style.color = 'var(--fg-primary)'
  }
}

function handleOptionLeave(e: React.MouseEvent<HTMLButtonElement>) {
  const active = e.currentTarget.getAttribute('aria-selected') === 'true'
  if (!active) {
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.color = 'var(--fg-secondary)'
  }
}

export function HydrationCard() {
  const queryClient = useQueryClient()
  const measurementSystem = useMeasurementSystem()
  const isImperial = measurementSystem === 'imperial'

  const { data, isLoading } = useQuery<WaterSettings>({
    queryKey: ['water', 'settings'],
    queryFn: () => api.get('/water/settings'),
  })

  const mutation = useMutation({
    mutationFn: (update: Partial<WaterSettings>) =>
      api.put<WaterSettings>('/water/settings', update),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['water', 'settings'], fresh)
      // The home widget keys its summary by timezone; refetch so the new goal,
      // glass size and buddy show up immediately.
      queryClient.invalidateQueries({ queryKey: ['water'] })
    },
  })

  const goalMl = data?.goal_ml ?? 2000
  const glassMl = data?.glass_ml ?? 250
  const buddyId: BuddyId = isBuddyId(data?.buddy) ? data.buddy : 'frog'
  const goalGlasses = Math.max(1, Math.round(goalMl / glassMl))
  const busy = isLoading || mutation.isPending

  const [goalOpen, setGoalOpen] = useState(false)
  const [glassOpen, setGlassOpen] = useState(false)
  const goalRef = useRef<HTMLDivElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!goalOpen && !glassOpen) return
    const handler = (e: MouseEvent) => {
      if (goalOpen && goalRef.current && !goalRef.current.contains(e.target as Node)) {
        setGoalOpen(false)
      }
      if (glassOpen && glassRef.current && !glassRef.current.contains(e.target as Node)) {
        setGlassOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [goalOpen, glassOpen])

  const [localPresets, setLocalPresets] = useState<string[]>(['', '', ''])

  const serializedPresets = data?.water_presets ? data.water_presets.join(',') : ''
  useEffect(() => {
    if (data?.water_presets) {
      setLocalPresets(
        data.water_presets.map((ml) => {
          const val = isImperial ? convertVolume(ml, 'imperial') : ml
          return val != null ? Math.round(val).toString() : ''
        })
      )
    }
  }, [serializedPresets, isImperial])

  const handleBlur = (index: number, val: string) => {
    const num = parseInt(val, 10)
    if (isNaN(num) || num <= 0) {
      if (data?.water_presets) {
        const dbMl = data.water_presets[index]
        const dbVal = isImperial ? convertVolume(dbMl, 'imperial') : dbMl
        const next = [...localPresets]
        next[index] = dbVal != null ? Math.round(dbVal).toString() : ''
        setLocalPresets(next)
      }
      return
    }

    const next = [...localPresets]
    next[index] = num.toString()
    setLocalPresets(next)

    const mlValues = next.map((v) => {
      const n = parseInt(v, 10)
      if (isNaN(n)) return isImperial ? 237 : 250
      return isImperial ? Math.round(convertVolumeToMl(n, 'imperial') || 0) : n
    })

    const allValid = mlValues.every((v) => v >= 50 && v <= 2000)
    if (allValid) {
      mutation.mutate({ water_presets: mlValues })
    }
  }

  const goalOptions = isImperial ? GOAL_OPTIONS_IMPERIAL : GOAL_OPTIONS_METRIC
  const glassOptions = isImperial ? GLASS_OPTIONS_IMPERIAL : GLASS_OPTIONS_METRIC

  const currentGoalOption = goalOptions.find(o => o.ml === goalMl)
  const currentGoalLabel = currentGoalOption 
    ? currentGoalOption.label 
    : (isImperial 
        ? `${Math.round(convertVolume(goalMl, 'imperial') || 0)} fl oz` 
        : `${(goalMl / 1000).toFixed(1)} L`)

  const currentGlassOption = glassOptions.find(o => o.ml === glassMl)
  const currentGlassLabel = currentGlassOption 
    ? currentGlassOption.label 
    : `${Math.round(convertVolume(glassMl, measurementSystem) || 0)} ${isImperial ? 'fl oz' : 'ml'}`

  return (
    <div className="glass settings-card settings-card-spacious" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Hydration</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
        Set your daily water goal and the size of one glass. That's {goalGlasses} glasses a day.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div ref={goalRef} style={{ width: '100%' }}>
          <Field
            label="Daily goal"
            hint="per day"
            isOpen={goalOpen}
            dropdown={
              goalOpen && (
                <div
                  role="listbox"
                  aria-label="Daily water goal options"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-3)',
                    border: '1px solid var(--glass-edge)',
                    borderRadius: 12,
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 50,
                    padding: 4,
                    overflow: 'hidden',
                  }}
                >
                  {goalOptions.map((o) => {
                    const active = goalMl === o.ml
                    return (
                      <button
                        key={o.ml}
                        role="option"
                        aria-selected={active}
                        type="button"
                        onClick={() => {
                          mutation.mutate({ goal_ml: o.ml })
                          setGoalOpen(false)
                        }}
                        style={optionStyle(active)}
                        onMouseEnter={handleOptionEnter}
                        onMouseLeave={handleOptionLeave}
                      >
                        <span>{o.label}</span>
                        {active && (
                          <Check size={12} strokeWidth={2.5} style={{ color: 'var(--sky-400)', flexShrink: 0 }} />
                        )}
                      </button>
                    )
                  })}
                  {!goalOptions.some((o) => o.ml === goalMl) && (
                    <button
                      role="option"
                      aria-selected={true}
                      type="button"
                      style={optionStyle(true)}
                    >
                      <span>{currentGoalLabel}</span>
                      <Check size={12} strokeWidth={2.5} style={{ color: 'var(--sky-400)', flexShrink: 0 }} />
                    </button>
                  )}
                </div>
              )
            }
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => setGoalOpen((v) => !v)}
              aria-label="Daily water goal"
              aria-expanded={goalOpen}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span>{currentGoalLabel}</span>
              <ChevronDown
                size={14}
                strokeWidth={2}
                style={{
                  color: 'var(--fg-quiet)',
                  transform: goalOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                  marginLeft: 6,
                }}
              />
            </button>
          </Field>
        </div>

        <div ref={glassRef} style={{ width: '100%' }}>
          <Field
            label="Glass size"
            hint="one tap"
            isOpen={glassOpen}
            dropdown={
              glassOpen && (
                <div
                  role="listbox"
                  aria-label="Glass size options"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-3)',
                    border: '1px solid var(--glass-edge)',
                    borderRadius: 12,
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    zIndex: 50,
                    padding: 4,
                    overflow: 'hidden',
                  }}
                >
                  {glassOptions.map((o) => {
                    const active = glassMl === o.ml
                    return (
                      <button
                        key={o.ml}
                        role="option"
                        aria-selected={active}
                        type="button"
                        onClick={() => {
                          mutation.mutate({ glass_ml: o.ml })
                          setGlassOpen(false)
                        }}
                        style={optionStyle(active)}
                        onMouseEnter={handleOptionEnter}
                        onMouseLeave={handleOptionLeave}
                      >
                        <span>{o.label}</span>
                        {active && (
                          <Check size={12} strokeWidth={2.5} style={{ color: 'var(--sky-400)', flexShrink: 0 }} />
                        )}
                      </button>
                    )
                  })}
                  {!glassOptions.some((o) => o.ml === glassMl) && (
                    <button
                      role="option"
                      aria-selected={true}
                      type="button"
                      style={optionStyle(true)}
                    >
                      <span>{currentGlassLabel}</span>
                      <Check size={12} strokeWidth={2.5} style={{ color: 'var(--sky-400)', flexShrink: 0 }} />
                    </button>
                  )}
                </div>
              )
            }
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => setGlassOpen((v) => !v)}
              aria-label="Glass size"
              aria-expanded={glassOpen}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span>{currentGlassLabel}</span>
              <ChevronDown
                size={14}
                strokeWidth={2}
                style={{
                  color: 'var(--fg-quiet)',
                  transform: glassOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease',
                  marginLeft: 6,
                }}
              />
            </button>
          </Field>
        </div>
      </div>

      <div className="eyebrow" style={{ fontSize: 10, margin: '20px 0 10px' }}>Spirit buddy</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {BUDDY_IDS.map((id) => {
          const b = BUDDIES[id]
          const selected = id === buddyId
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => mutation.mutate({ buddy: id })}
              aria-label={`Choose ${b.label}`}
              className="glass-inset"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: 10,
                cursor: 'pointer',
                color: b.color,
                border: selected ? `1px solid ${b.color}` : '1px solid rgba(255,255,255,0.05)',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(0,0,0,0.25)',
              }}
            >
              <BuddySprite buddy={id} size={44} />
              <span style={{ fontSize: 10, color: selected ? 'var(--fg-secondary)' : 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{b.label}</span>
            </button>
          )
        })}
      </div>

      <div className="eyebrow" style={{ fontSize: 10, margin: '20px 0 10px' }}>Quick presets</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
        Customize the three quick log preset values on your hydration card.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 8 }}>
        {[0, 1, 2].map((idx) => (
          <Field key={idx} label={`Preset ${idx + 1}`} hint={isImperial ? 'fl oz' : 'ml'}>
            <input
              type="number"
              value={localPresets[idx] || ''}
              disabled={busy}
              onChange={(e) => {
                const next = [...localPresets]
                next[idx] = e.target.value
                setLocalPresets(next)
              }}
              onBlur={(e) => handleBlur(idx, e.target.value)}
              aria-label={`Quick Preset ${idx + 1}`}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
              }}
            />
          </Field>
        ))}
      </div>

      {mutation.isError && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)',
          borderRadius: 12, fontSize: 13, color: 'var(--bad)',
        }}>
          Could not update hydration settings. Please try again.
        </div>
      )}
    </div>
  )
}
