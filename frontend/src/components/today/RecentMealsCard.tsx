import { useState } from 'react'
import { Trash2, ChevronRight } from 'lucide-react'
import { NutrientBreakdownSheet } from './NutrientBreakdownSheet'

type RecentMeal = {
  id: string
  ts: string
  slot: string
  source: string
  item_count: number
  calories: number
  headline: string
  nutrition?: Record<string, number>
}

function formatMealTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function RecentMealsCard({
  meals,
  compact,
  onDelete,
  deletingId,
}: {
  meals?: RecentMeal[]
  compact?: boolean
  onDelete?: (id: string) => void
  deletingId?: string | null
}) {
  const safeMeals = Array.isArray(meals) ? meals : []
  const [breakdownMeal, setBreakdownMeal] = useState<RecentMeal | null>(null)

  return (
    <>
      <div className="glass" style={{ padding: compact ? 18 : 24, marginTop: compact ? 14 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="eyebrow">Recent meals</div>
            <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
              Latest meal logs from today. Tap a meal to see full nutrient breakdown.
            </div>
          </div>
        </div>

        {safeMeals.length === 0 ? (
          <p style={{ color: 'var(--fg-quiet)', fontSize: compact ? 12 : 13, margin: 0 }}>
            No meals logged yet today.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {safeMeals.map((meal) => {
              const isDeleting = deletingId === meal.id
              return (
                <div
                  key={meal.id}
                  className="glass-inset"
                  style={{
                    padding: compact ? '10px 12px' : '12px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    opacity: isDeleting ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                    cursor: meal.nutrition ? 'pointer' : 'default',
                  }}
                  onClick={() => { if (meal.nutrition && !isDeleting) setBreakdownMeal(meal) }}
                  role={meal.nutrition ? 'button' : undefined}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: compact ? 13 : 14, color: 'var(--fg-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {meal.headline}
                    </div>
                    <div style={{ marginTop: 3, fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                      {meal.slot} · {meal.source} · {meal.item_count} items
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
                      {Math.round(meal.calories)} kcal
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'var(--fg-quiet)' }}>
                      {formatMealTime(meal.ts)}
                    </div>
                  </div>
                  {meal.nutrition && !onDelete && (
                    <ChevronRight size={13} strokeWidth={1.8} style={{ color: 'var(--fg-quiet)', flexShrink: 0 }} />
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      className="btn"
                      disabled={isDeleting}
                      onClick={(e) => { e.stopPropagation(); onDelete(meal.id) }}
                      title="Delete meal"
                      style={{
                        padding: '6px',
                        borderRadius: 8,
                        border: '1px solid var(--glass-edge)',
                        background: 'transparent',
                        color: 'var(--fg-quiet)',
                        flexShrink: 0,
                        lineHeight: 0,
                      }}
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {breakdownMeal?.nutrition && (
        <NutrientBreakdownSheet
          title={breakdownMeal.headline}
          nutrition={breakdownMeal.nutrition}
          onClose={() => setBreakdownMeal(null)}
        />
      )}
    </>
  )
}
