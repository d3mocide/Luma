import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, BookOpen, BatteryLow, Battery, BatteryMedium, BatteryFull, Flame, Frown, Meh, Smile, Laugh, Angry, CircleDashed, Circle, CircleDot, Disc, CheckCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../../lib/api'
import { JournalDrawer, type PendingMeal } from '../journal/JournalDrawer'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface JournalEntry {
  id: string
  meal_event_id: string | null
  meal_name: string
  logged_at: string
  energy: number
  digestion: number
  mood: number
  satiety: number
  symptoms: string[]
  notes: string | null
  created_at: string
}

interface Correlation {
  meal_name: string
  count: number
  avg_energy: number
  avg_digestion: number
  avg_mood: number
  avg_satiety: number
}

// ── Score chip ────────────────────────────────────────────────────────────────

type ScoreType = 'energy' | 'digestion' | 'mood' | 'satiety'

const SCORE_ICONS: Record<ScoreType, LucideIcon[]> = {
  energy:    [Battery, BatteryLow, BatteryMedium, BatteryFull, Flame],
  digestion: [Angry, Frown, Meh, Smile, Laugh],
  mood:      [Angry, Frown, Meh, Smile, Laugh],
  satiety:   [CircleDashed, Circle, CircleDot, CheckCircle2, Disc],
}

function ScoreChip({ label, value, type }: { label: string; value: number; type: ScoreType }) {
  const Icon = SCORE_ICONS[type]?.[value - 1]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {Icon ? <Icon size={16} /> : <span style={{ fontSize: 16 }}>—</span>}
      <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

function AvgBar({ label, value }: { label: string; value: number }) {
  const color = value >= 4 ? 'var(--good)' : value >= 3 ? 'var(--warn)' : 'var(--bad)'
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>{label}</span>
        <span className="num" style={{ fontSize: 10, color, fontWeight: 600 }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / 5) * 100}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}

// ── Journal tab ───────────────────────────────────────────────────────────────

export function JournalTab({ openWithPrefill }: { openWithPrefill?: PendingMeal | null }) {
  const [drawerOpen, setDrawerOpen] = useState(!!openWithPrefill)
  const [prefill, setPrefill] = useState<PendingMeal | null>(openWithPrefill ?? null)

  const { data: entriesData } = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ['journal'],
    queryFn: () => api.get('/journal?limit=50'),
    staleTime: 30_000,
  })

  const { data: corrData } = useQuery<{ correlations: Correlation[] }>({
    queryKey: ['journal-correlations'],
    queryFn: () => api.get('/journal/correlations'),
    staleTime: 60_000,
  })

  const entries = entriesData?.entries ?? []
  const correlations = corrData?.correlations ?? []

  function openDrawer(meal?: PendingMeal) {
    setPrefill(meal ?? null)
    setDrawerOpen(true)
  }

  return (
    <div>
      {/* Correlation cards */}
      {correlations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Patterns over time</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {correlations.map((c) => (
              <div
                key={c.meal_name}
                className="glass"
                style={{
                  minWidth: 180, padding: '12px 14px',
                  borderRadius: 14, border: '1px solid var(--glass-edge)',
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.meal_name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 10 }}>
                  {c.count} {c.count === 1 ? 'entry' : 'entries'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <AvgBar label="Energy" value={c.avg_energy} />
                  <AvgBar label="Digestion" value={c.avg_digestion} />
                  <AvgBar label="Mood" value={c.avg_mood} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entry list header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="eyebrow">Journal entries</div>
        <button
          className="btn"
          style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => openDrawer()}
        >
          <Plus size={13} />
          Log how I feel
        </button>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="glass" style={{ padding: '40px 24px', textAlign: 'center', borderRadius: 16, border: '1px solid var(--glass-edge)' }}>
          <BookOpen size={32} style={{ color: 'var(--fg-quiet)', marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-secondary)', fontWeight: 500 }}>No journal entries yet.</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
            Log how a meal makes you feel and patterns will appear here.
          </p>
        </div>
      )}

      {/* Entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="glass"
            style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid var(--glass-edge)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 2 }}>
                  {entry.meal_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                  {timeAgo(entry.logged_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                <ScoreChip label="Energy" value={entry.energy} type="energy" />
                <ScoreChip label="Digestion" value={entry.digestion} type="digestion" />
                <ScoreChip label="Mood" value={entry.mood} type="mood" />
                <ScoreChip label="Satiety" value={entry.satiety} type="satiety" />
              </div>
            </div>

            {entry.symptoms.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: entry.notes ? 8 : 0 }}>
                {entry.symptoms.map((s) => (
                  <span key={s} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.1)', color: 'var(--bad)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            )}

            {entry.notes && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>
                "{entry.notes}"
              </p>
            )}
          </div>
        ))}
      </div>

      {drawerOpen && (
        <JournalDrawer
          prefill={prefill}
          onClose={() => { setDrawerOpen(false); setPrefill(null) }}
        />
      )}
    </div>
  )
}

// ── Calculator tab ────────────────────────────────────────────────────────────
