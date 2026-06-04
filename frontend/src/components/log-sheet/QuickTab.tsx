import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { DraftItem } from './types'

type FrequentMeal = {
  slot: string
  items: DraftItem[]
  nutrition: Record<string, number>
  count: number
  last_logged: string
}

type Props = {
  currentSlot: string
  onAddItems: (items: DraftItem[]) => void
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export function QuickTab({ currentSlot, onAddItems }: Props) {
  const { data, isLoading } = useQuery<{ suggestions: FrequentMeal[] }>({
    queryKey: ['meals', 'frequent'],
    queryFn: () => api.get('/log/meals/frequent'),
    staleTime: 5 * 60 * 1000,
  })

  const suggestions = data?.suggestions ?? []

  // Sort: current slot first
  const sorted = [...suggestions].sort((a, b) => {
    if (a.slot === currentSlot) return -1
    if (b.slot === currentSlot) return 1
    return 0
  })

  if (isLoading) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (!sorted.length) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13 }}>
        No meal history yet. Log a few meals and your usuals will appear here.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map((meal) => {
        const isCurrentSlot = meal.slot === currentSlot
        const cal = Math.round(meal.nutrition?.calories ?? 0)
        const protein = (meal.nutrition?.protein_g ?? 0).toFixed(0)
        const itemNames = meal.items.map((i) => i.name).join(', ')
        const freq = meal.count === 1 ? '1× this week' : `${meal.count}× this week`

        return (
          <div
            key={meal.slot}
            className="glass-inset"
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              border: isCurrentSlot
                ? '1px solid rgba(14,165,233,0.35)'
                : '1px solid var(--glass-edge)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {isCurrentSlot && (
              <div
                style={{
                  position: 'absolute', inset: 0, opacity: 0.04,
                  background: 'var(--sky-400)', pointerEvents: 'none',
                }}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    className="eyebrow"
                    style={{ color: isCurrentSlot ? 'var(--sky-400)' : 'var(--fg-quiet)' }}
                  >
                    {SLOT_LABELS[meal.slot] ?? meal.slot}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
                    {freq}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--fg-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '28ch',
                    marginBottom: 6,
                  }}
                  title={itemNames}
                >
                  {itemNames}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span className="num" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
                    {cal} kcal
                  </span>
                  <span className="num" style={{ fontSize: 11, color: 'var(--aurora-violet)' }}>
                    {protein}g protein
                  </span>
                </div>
              </div>
              <button
                onClick={() => onAddItems(meal.items)}
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: 12, flexShrink: 0 }}
              >
                Re-log
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
