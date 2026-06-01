import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

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

const SCALES = [
  {
    key: 'energy' as const,
    label: 'Energy',
    options: ['😴', '😐', '🙂', '⚡', '🚀'],
    captions: ['Drained', 'Low', 'OK', 'Good', 'Excellent'],
  },
  {
    key: 'digestion' as const,
    label: 'Digestion',
    options: ['😣', '😕', '😐', '🙂', '😊'],
    captions: ['Painful', 'Uncomfortable', 'OK', 'Good', 'Great'],
  },
  {
    key: 'mood' as const,
    label: 'Mood',
    options: ['😢', '😕', '😐', '🙂', '😄'],
    captions: ['Low', 'Down', 'Neutral', 'Good', 'Great'],
  },
  {
    key: 'satiety' as const,
    label: 'Satiety',
    options: ['🫙', '😕', '😐', '🙂', '🫃'],
    captions: ['Still hungry', 'A bit hungry', 'OK', 'Satisfied', 'Very full'],
  },
]

const SYMPTOMS = [
  'Bloating', 'Brain fog', 'Heartburn', 'Heaviness',
  'Nausea', 'Fatigue', 'Headache', 'Reflux',
]

type Scores = Record<'energy' | 'digestion' | 'mood' | 'satiety', number>

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{scale.label}</span>
        {value > 0 && (
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
            {scale.captions[value - 1]}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {scale.options.map((emoji, i) => {
          const score = i + 1
          const selected = value === score
          return (
            <button
              key={score}
              onClick={() => onChange(score)}
              style={{
                flex: 1, height: 44, borderRadius: 10, fontSize: 20,
                border: selected ? '2px solid var(--sky-400)' : '1px solid var(--glass-edge)',
                background: selected ? 'rgba(56,189,248,0.12)' : 'var(--glass-1)',
                cursor: 'pointer',
                transition: 'all 120ms',
                transform: selected ? 'scale(1.08)' : 'scale(1)',
              }}
            >
              {emoji}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export function JournalDrawer({ prefill, onClose }: Props) {
  const queryClient = useQueryClient()

  const [mealName, setMealName] = useState(prefill?.meal_name ?? '')
  const [loggedAt] = useState(prefill?.logged_at ?? new Date().toISOString())
  const [scores, setScores] = useState<Scores>({ energy: 0, digestion: 0, mood: 0, satiety: 0 })
  const [symptoms, setSymptoms] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post('/journal', {
      meal_event_id: prefill?.meal_event_id ?? null,
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
        background: 'rgba(9,11,16,0.6)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="glass"
        style={{
          width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto',
          borderRadius: '20px 20px 0 0',
          padding: '0 0 32px',
          border: '1px solid var(--glass-edge)',
          boxShadow: '0 -24px 48px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Handle + header */}
        <div style={{ padding: '12px 20px 0', position: 'sticky', top: 0, background: 'inherit', zIndex: 1 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-edge)', margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 400, color: 'var(--fg-primary)' }}>
                How did you feel?
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--fg-tertiary)' }}>
                Log how this meal made you feel
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--fg-quiet)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Meal name */}
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Meal</div>
            <input
              type="text"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="e.g. Grilled salmon with broccoli"
              className="field-input"
              style={{
                width: '100%', height: 42, borderRadius: 10,
                fontSize: 14, border: '1px solid var(--glass-edge)',
                background: 'var(--glass-1)', color: 'var(--fg-primary)',
                padding: '0 14px', outline: 'none', boxSizing: 'border-box',
              }}
            />
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

          {/* Submit */}
          <button
            className="btn btn-primary"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
            style={{ padding: '13px 20px', fontSize: 14, opacity: canSubmit ? 1 : 0.4 }}
          >
            <Check size={15} />
            {mutation.isPending ? 'Saving…' : 'Save journal entry'}
          </button>
        </div>
      </div>
    </div>
  )
}
