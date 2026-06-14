import { useState, useEffect, useMemo } from 'react'
import { X, Check, BatteryLow, Battery, BatteryMedium, BatteryFull, Flame, Frown, Meh, Smile, Laugh, Angry, CircleDashed, Circle, CircleDot, Disc, CheckCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { TodayData } from '../../lib/api'

export interface PendingMeal {
  meal_event_id: string
  meal_name: string
  logged_at: string
  slot: string
}

interface Props {
  prefill?: PendingMeal | null
  onClose: () => void
}

// ── Scale definitions ─────────────────────────────────────────────────────────

const SCALES: Array<{
  key: 'energy' | 'digestion' | 'mood' | 'satiety'
  label: string
  options: LucideIcon[]
  captions: string[]
}> = [
  {
    key: 'energy',
    label: 'Energy',
    options: [Battery, BatteryLow, BatteryMedium, BatteryFull, Flame],
    captions: ['Drained', 'Low', 'OK', 'Good', 'Excellent'],
  },
  {
    key: 'digestion',
    label: 'Digestion',
    options: [Angry, Frown, Meh, Smile, Laugh],
    captions: ['Painful', 'Uncomfortable', 'OK', 'Good', 'Great'],
  },
  {
    key: 'mood',
    label: 'Mood',
    options: [Angry, Frown, Meh, Smile, Laugh],
    captions: ['Low', 'Down', 'Neutral', 'Good', 'Great'],
  },
  {
    key: 'satiety',
    label: 'Satiety',
    options: [CircleDashed, Circle, CircleDot, CheckCircle2, Disc],
    captions: ['Still hungry', 'A bit hungry', 'OK', 'Satisfied', 'Very full'],
  },
]

const SYMPTOMS = [
  'Bloating', 'Brain fog', 'Heartburn', 'Heaviness',
  'Nausea', 'Fatigue', 'Headache', 'Reflux',
]

type Scores = Record<'energy' | 'digestion' | 'mood' | 'satiety', number>
// Helper functions for rating button styling
function getScoreClass(key: string, score: number): string {
  if (key === 'digestion' || key === 'mood') {
    switch (score) {
      case 1: return 'score-bad'
      case 2: return 'score-warn-heavy'
      case 3: return 'score-warn-light'
      case 4: return 'score-mint'
      case 5: return 'score-good'
    }
  } else if (key === 'energy') {
    switch (score) {
      case 1: return 'score-bad'
      case 2: return 'score-warn-heavy'
      case 3: return 'score-warn-light'
      case 4: return '' // default sky-400
      case 5: return 'score-pink'
    }
  } else if (key === 'satiety') {
    switch (score) {
      case 1: return 'score-sky'
      case 2: return '' // default sky-400
      case 3: return 'score-mint'
      case 4: return 'score-good'
      case 5: return 'score-warn-heavy'
    }
  }
  return ''
}

function getScaleTextColor(key: string, score: number): string {
  if (key === 'digestion' || key === 'mood') {
    switch (score) {
      case 1: return 'var(--bad)'
      case 2: return 'var(--sun-500)'
      case 3: return 'var(--sun-300)'
      case 4: return 'var(--aurora-mint)'
      case 5: return 'var(--good)'
    }
  } else if (key === 'energy') {
    switch (score) {
      case 1: return 'var(--bad)'
      case 2: return 'var(--sun-500)'
      case 3: return 'var(--sun-300)'
      case 4: return 'var(--sky-400)'
      case 5: return 'var(--aurora-pink)'
    }
  } else if (key === 'satiety') {
    switch (score) {
      case 1: return 'var(--sky-300)'
      case 2: return 'var(--sky-400)'
      case 3: return 'var(--aurora-mint)'
      case 4: return 'var(--good)'
      case 5: return 'var(--warn)'
    }
  }
  return 'var(--sky-400)'
}

// ── Scale row ─────────────────────────────────────────────────────────────────

function ScaleRow({
  scale,
  value,
  onChange,
}: {
  scale: typeof SCALES[number]
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{scale.label}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        {scale.options.map((Icon, i) => {
          const score = i + 1
          const selected = value === score
          const scoreClass = getScoreClass(scale.key, score)
          const btnClass = `journal-scale-btn ${selected ? 'selected' : ''} ${selected && scoreClass ? scoreClass : ''}`
          
          return (
            <div key={score} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => onChange(score)}
                className={btnClass}
              >
                <Icon size={20} />
              </button>
              <span style={{
                fontSize: 9,
                color: selected ? getScaleTextColor(scale.key, score) : 'var(--fg-quiet)',
                textAlign: 'center',
                fontWeight: selected ? 600 : 400,
                lineHeight: 1.1,
                minHeight: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 120ms',
              }}>
                {scale.captions[i]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────

type RecentMeal = TodayData['recent_meals'][number]

function fmtTime(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function JournalDrawer({ prefill, onClose }: Props) {
  const queryClient = useQueryClient()

  const [mealName, setMealName] = useState(prefill?.meal_name ?? '')
  const [mealEventId, setMealEventId] = useState<string | null>(prefill?.meal_event_id ?? null)
  const [loggedAt, setLoggedAt] = useState(prefill?.logged_at ?? new Date().toISOString())
  const [scores, setScores] = useState<Scores>({ energy: 0, digestion: 0, mood: 0, satiety: 0 })
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const { data: todayData } = useQuery<TodayData>({
    queryKey: ['today'],
    queryFn: () => api.get('/today'),
    enabled: !prefill,
    staleTime: 60_000,
  })
  const recentMeals: RecentMeal[] = prefill
    ? [
        {
          id: prefill.meal_event_id,
          ts: prefill.logged_at,
          slot: prefill.slot,
          source: 'prefill',
          item_count: 1,
          calories: 0,
          headline: prefill.meal_name,
        }
      ]
    : (todayData?.recent_meals ?? [])

  const { data: journalData } = useQuery<{ entries: Array<{ meal_event_id: string | null }> }>({
    queryKey: ['journal'],
    queryFn: () => api.get('/journal?limit=50'),
    enabled: !prefill,
    staleTime: 30_000,
  })

  const journaledIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of journalData?.entries ?? []) {
      if (e.meal_event_id) ids.add(e.meal_event_id)
    }
    return ids
  }, [journalData])

  const availableMeals = useMemo(
    () => recentMeals.filter(m => !journaledIds.has(m.id)),
    [recentMeals, journaledIds],
  )

  useEffect(() => {
    if (!prefill && !mealEventId && availableMeals.length > 0) {
      const first = availableMeals[0]
      setMealName(first.headline)
      setMealEventId(first.id)
      setLoggedAt(first.ts)
    }
  }, [availableMeals, prefill, mealEventId])

  function selectMeal(meal: RecentMeal) {
    setMealName(meal.headline)
    setMealEventId(meal.id)
    setLoggedAt(meal.ts)
  }

  const mutation = useMutation({
    mutationFn: () => api.post('/journal', {
      meal_event_id: mealEventId,
      meal_name: mealName.trim(),
      logged_at: loggedAt,
      energy: scores.energy,
      digestion: scores.digestion,
      mood: scores.mood,
      satiety: scores.satiety,
      symptoms,
      notes: notes.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal'] })
      queryClient.invalidateQueries({ queryKey: ['journal-pending'] })
      onClose()
    },
  })

  const canSubmit = mealName.trim().length > 0
    && scores.energy > 0 && scores.digestion > 0
    && scores.mood > 0 && scores.satiety > 0

  function toggleSymptom(s: string) {
    setSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    )
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(5,8,17,0.75)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', justifyContent: 'flex-end', alignItems: 'stretch',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="glass"
        style={{
          width: '100%', maxWidth: 480,
          background: 'linear-gradient(180deg, rgba(13,20,37,0.98), rgba(8,13,26,0.98))',
          borderLeft: '1px solid var(--glass-edge)',
          display: 'flex', flexDirection: 'column', height: '100%',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.4)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        <div className="log-sheet-atmo" aria-hidden="true" />

        {/* Header */}
        <header
          style={{
            padding: 'calc(env(safe-area-inset-top) + 18px) 20px 16px',
            borderBottom: '1px solid var(--glass-edge)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Journal logging</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
              How did you feel?
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-tertiary)' }}>
              Log how this meal made you feel
            </p>
          </div>
          <button
            onClick={onClose}
            className="log-sheet-close btn btn-ghost"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(251,113,133,0.08)',
              border: '1px solid rgba(251,113,133,0.22)',
              color: 'var(--bad)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 160ms ease-out, background 160ms ease-out',
            }}
          >
            <span className="log-sheet-close-icon" style={{ display: 'inline-flex', transition: 'transform 160ms ease-out' }}>
              <X size={14} strokeWidth={2} />
            </span>
          </button>
        </header>

        {/* Scrollable Body */}
        <div
          className="thin-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px calc(env(safe-area-inset-bottom) + 20px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Meal name */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Meal</div>
            {recentMeals.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--fg-tertiary)', fontStyle: 'italic', padding: '4px 0' }}>
                No logged meals found today. Log a meal first to record how you felt after.
              </div>
            ) : availableMeals.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--fg-tertiary)', fontStyle: 'italic', padding: '4px 0' }}>
                All meals today have already been journaled.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableMeals.map((meal) => {
                  const selected = mealEventId === meal.id
                  return (
                    <button
                      key={meal.id}
                      onClick={() => selectMeal(meal)}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12,
                        border: selected ? '1px solid var(--sky-400)' : '1px solid var(--glass-edge)',
                        background: selected ? 'rgba(56,189,248,0.12)' : 'var(--glass-1)',
                        color: selected ? 'var(--sky-400)' : 'var(--fg-secondary)',
                        cursor: 'pointer', transition: 'all 120ms',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <span style={{ textTransform: 'capitalize', opacity: 0.7 }}>{meal.slot}</span>
                      <span style={{ color: selected ? 'var(--sky-400)' : 'var(--fg-primary)', fontWeight: 500 }}>{meal.headline}</span>
                      <span style={{ opacity: 0.5 }}>{fmtTime(meal.ts)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Score scales */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="eyebrow">How did you feel after?</div>
            {SCALES.map((scale) => (
              <ScaleRow
                key={scale.key}
                scale={scale}
                value={scores[scale.key]}
                onChange={(v) => setScores((prev) => ({ ...prev, [scale.key]: v }))}
              />
            ))}
          </div>

          {/* Symptoms */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Any symptoms? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--fg-quiet)', fontSize: 10 }}>(optional)</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SYMPTOMS.map((s) => {
                const active = symptoms.includes(s)
                return (
                  <button
                    key={s}
                    onClick={() => toggleSymptom(s)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12,
                      border: active ? '1px solid var(--bad)' : '1px solid var(--glass-edge)',
                      background: active ? 'rgba(239,68,68,0.12)' : 'var(--glass-1)',
                      color: active ? 'var(--bad)' : 'var(--fg-secondary)',
                      cursor: 'pointer', transition: 'all 120ms',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--fg-quiet)', fontSize: 10 }}>(optional)</span></div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth noting…"
              rows={2}
              className="field-input"
              style={{
                width: '100%', resize: 'none', borderRadius: 10, fontSize: 13,
                border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                color: 'var(--fg-primary)', padding: '10px 14px', outline: 'none',
                fontFamily: 'var(--font-sans)', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Fixed Footer */}
        <div
          style={{
            padding: '16px 20px calc(env(safe-area-inset-bottom) + 16px)',
            borderTop: '1px solid var(--glass-edge)',
            background: 'linear-gradient(180deg, rgba(8,13,26,0.98), rgba(5,8,17,0.98))',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <button
            className="btn btn-primary"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
            style={{ width: '100%', padding: '13px', fontSize: 14, opacity: canSubmit ? 1 : 0.4 }}
          >
            <Check size={15} />
            {mutation.isPending ? 'Saving…' : 'Save journal entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
