import { useState } from 'react'
import { Trash2, ChevronRight, Pencil } from 'lucide-react'
import { NutrientBreakdownSheet } from './NutrientBreakdownSheet'
import type { DraftItem } from '../log-sheet/types'

export type RecentMeal = {
  id: string
  ts: string
  slot: string
  source: string
  item_count: number
  calories: number
  headline: string
  nutrition?: Record<string, number>
  items?: DraftItem[]
  raw_input?: string | null
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
  onEdit,
  title = "Recent meals",
  subtitle = "Latest meal logs from today. Tap a meal to see full nutrient breakdown.",
  emptyText = "No meals logged yet today.",
}: {
  meals?: RecentMeal[]
  compact?: boolean
  onDelete?: (id: string) => void
  deletingId?: string | null
  onEdit?: (meal: RecentMeal) => void
  title?: string
  subtitle?: string
  emptyText?: string
}) {
  const safeMeals = Array.isArray(meals) ? meals : []
  const [breakdownMeal, setBreakdownMeal] = useState<RecentMeal | null>(null)

  return (
    <>
      <div className="glass" style={{ padding: compact ? 18 : 24, marginTop: compact ? 14 : 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="eyebrow">{title}</div>
            <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
              {subtitle}
            </div>
          </div>
        </div>

        {safeMeals.length === 0 ? (
          <p style={{ color: 'var(--fg-quiet)', fontSize: compact ? 12 : 13, margin: 0 }}>
            {emptyText}
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
                    flexDirection: 'column',
                    gap: 10,
                    opacity: isDeleting ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                    cursor: meal.nutrition ? 'pointer' : 'default',
                  }}
                  onClick={() => { if (meal.nutrition && !isDeleting) setBreakdownMeal(meal) }}
                  role={meal.nutrition ? 'button' : undefined}
                >
                  {/* Top row: Headline/Details (left) and Time/Actions (right) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: compact ? 13 : 14, color: 'var(--fg-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {meal.headline}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                        {meal.slot} · {meal.source} · {meal.item_count} items
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        {!meal.nutrition && (
                          <div className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
                            {Math.round(meal.calories)} kcal
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                          {formatMealTime(meal.ts)}
                        </div>
                      </div>
                      {meal.nutrition && !onDelete && !onEdit && (
                        <ChevronRight size={13} strokeWidth={1.8} style={{ color: 'var(--fg-quiet)', flexShrink: 0 }} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {onEdit && (
                          <button
                            type="button"
                            className="btn"
                            disabled={isDeleting}
                            onClick={(e) => { e.stopPropagation(); onEdit(meal) }}
                            title="Edit meal"
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
                            <Pencil size={13} strokeWidth={1.8} />
                          </button>
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
                    </div>
                  </div>

                  {/* Bottom row: Macro chips spanning the width */}
                  {meal.nutrition && (
                    <div className="favorite-macro-grid" style={{ width: '100%', maxWidth: compact ? '100%' : '360px' }}>
                      <div className="favorite-macro-col">
                        <span className="favorite-macro-label">Cal</span>
                        <span className="num favorite-macro-val" style={{ color: 'var(--sky-400)' }}>{Math.round(meal.nutrition.calories ?? 0)}</span>
                      </div>
                      <div className="favorite-macro-col">
                        <span className="favorite-macro-label">Sat Fat</span>
                        <span className="num favorite-macro-val" style={{ color: 'var(--bad)' }}>{(meal.nutrition.saturated_fat_g ?? 0).toFixed(1)}g</span>
                      </div>
                      <div className="favorite-macro-col">
                        <span className="favorite-macro-label">Sol Fib</span>
                        <span className="num favorite-macro-val" style={{ color: 'var(--good)' }}>{(meal.nutrition.soluble_fiber_g ?? 0).toFixed(1)}g</span>
                      </div>
                      <div className="favorite-macro-col">
                        <span className="favorite-macro-label">Sodium</span>
                        <span className="num favorite-macro-val" style={{ color: '#fb923c' }}>{Math.round(meal.nutrition.sodium_mg ?? 0)}mg</span>
                      </div>
                      <div className="favorite-macro-col">
                        <span className="favorite-macro-label">Protein</span>
                        <span className="num favorite-macro-val" style={{ color: '#a78bfa' }}>{(meal.nutrition.protein_g ?? 0).toFixed(1)}g</span>
                      </div>
                    </div>
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
