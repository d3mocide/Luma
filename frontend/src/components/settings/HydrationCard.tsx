import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, WaterSettings } from '../../lib/api'
import { BUDDIES, BUDDY_IDS, BuddyId, isBuddyId } from '../../lib/water-buddies'
import { BuddySprite } from '../today/WaterBuddies'

const GOAL_OPTIONS = [
  { ml: 1500, label: '1.5 L' },
  { ml: 2000, label: '2 L' },
  { ml: 2500, label: '2.5 L' },
  { ml: 3000, label: '3 L' },
  { ml: 3500, label: '3.5 L' },
]

const GLASS_OPTIONS = [
  { ml: 200, label: '200 ml' },
  { ml: 237, label: '237 ml · 8 oz' },
  { ml: 250, label: '250 ml' },
  { ml: 355, label: '355 ml · 12 oz' },
  { ml: 500, label: '500 ml' },
]

function selectStyle(): React.CSSProperties {
  return {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--fg-primary)',
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
    cursor: 'pointer',
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
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
          border: '1px solid var(--glass-edge)',
          borderRadius: 14,
          background: 'var(--glass-1)',
        }}
      >
        {children}
      </div>
    </label>
  )
}

export function HydrationCard() {
  const queryClient = useQueryClient()

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

  return (
    <div className="glass settings-card settings-card-spacious" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Hydration</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
        Set your daily water goal and the size of one glass. That's {goalGlasses} glasses a day.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <Field label="Daily goal" hint="per day">
          <select
            value={goalMl}
            disabled={busy}
            onChange={(e) => mutation.mutate({ goal_ml: Number(e.target.value) })}
            aria-label="Daily water goal"
            style={selectStyle()}
          >
            {GOAL_OPTIONS.map((o) => (
              <option key={o.ml} value={o.ml}>{o.label}</option>
            ))}
            {!GOAL_OPTIONS.some((o) => o.ml === goalMl) && (
              <option value={goalMl}>{goalMl} ml</option>
            )}
          </select>
        </Field>

        <Field label="Glass size" hint="one tap">
          <select
            value={glassMl}
            disabled={busy}
            onChange={(e) => mutation.mutate({ glass_ml: Number(e.target.value) })}
            aria-label="Glass size"
            style={selectStyle()}
          >
            {GLASS_OPTIONS.map((o) => (
              <option key={o.ml} value={o.ml}>{o.label}</option>
            ))}
            {!GLASS_OPTIONS.some((o) => o.ml === glassMl) && (
              <option value={glassMl}>{glassMl} ml</option>
            )}
          </select>
        </Field>
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
                filter: `drop-shadow(0 0 6px ${b.glow})`,
              }}
            >
              <BuddySprite buddy={id} size={44} />
              <span style={{ fontSize: 10, color: selected ? 'var(--fg-secondary)' : 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{b.label}</span>
            </button>
          )
        })}
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
