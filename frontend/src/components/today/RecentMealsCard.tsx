import { useState } from 'react'
import { Trash2, ChevronDown, Pencil } from 'lucide-react'
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
  subtitle = "Latest meal logs from today. Tap a meal to see constituent items.",
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
  const [expandedMealIds, setExpandedMealIds] = useState<Record<string, boolean>>({})

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedMealIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

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
              const hasItems = meal.items && meal.items.length > 0
              const isExpanded = !!expandedMealIds[meal.id]

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
                    cursor: isDeleting ? 'default' : 'pointer',
                  }}
                  onClick={(e) => { if (!isDeleting) toggleExpand(meal.id, e) }}
                  role="button"
                >
                  {/* Top row: Headline/Details (left) and Time/Actions (right) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: compact ? 13 : 14, color: 'var(--fg-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {meal.headline}
                      </div>
                      <div style={{
                        marginTop: 3,
                        fontSize: 10,
                        color: 'var(--fg-quiet)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontFamily: 'var(--font-mono)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '2px 5px',
                        alignItems: 'center'
                      }}>
                        <span>{meal.slot}</span>
                        <span style={{ color: 'var(--fg-faint)', userSelect: 'none' }}>·</span>
                        <span>{meal.source}</span>
                        <span style={{ color: 'var(--fg-faint)', userSelect: 'none' }}>·</span>
                        <span>{meal.item_count} {meal.item_count === 1 ? 'item' : 'items'}</span>
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
                      {hasItems && (
                        <ChevronDown
                          size={13}
                          strokeWidth={1.8}
                          style={{
                            color: 'var(--fg-quiet)',
                            flexShrink: 0,
                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s ease',
                          }}
                        />
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

                  {/* Expanded ingredients drawer list */}
                  {isExpanded && hasItems && meal.items && (
                    <div style={{
                      marginTop: 12,
                      borderTop: '1px solid var(--glass-edge)',
                      paddingTop: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}>
                      {meal.items.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                          }}
                        >
                          {/* Ingredient Name & Brand */}
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', lineHeight: 1.4 }}>
                              {item.name}
                            </span>
                            {item.brand && (
                              <span style={{ fontSize: 10, color: 'var(--fg-quiet)', whiteSpace: 'nowrap' }}>
                                {item.brand}
                              </span>
                            )}
                          </div>

                          {/* Metrics Breakdown */}
                          <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px 6px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            marginTop: 4,
                          }}>
                            {/* Weight */}
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--glass-2)',
                              color: 'var(--fg-secondary)',
                              border: '1px solid var(--glass-edge)',
                            }}>
                              {item.estimated_weight_g || item.quantity}g
                            </span>
                            {/* Calories */}
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(56, 189, 248, 0.08)',
                              color: 'var(--sky-300)',
                              border: '1px solid rgba(56, 189, 248, 0.15)',
                            }}>
                              {Math.round(item.nutrients?.calories ?? 0)} kcal
                            </span>
                            {/* Sat Fat */}
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(239, 68, 68, 0.08)',
                              color: 'var(--bad)',
                              border: '1px solid rgba(239, 68, 68, 0.15)',
                            }}>
                              {((item.nutrients?.saturated_fat_g) ?? 0).toFixed(1)}g sat
                            </span>
                            {/* Soluble Fiber */}
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(52, 211, 153, 0.08)',
                              color: 'var(--good)',
                              border: '1px solid rgba(52, 211, 153, 0.15)',
                            }}>
                              {((item.nutrients?.soluble_fiber_g) ?? 0).toFixed(1)}g fiber
                            </span>
                            {/* Sodium */}
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(251, 146, 60, 0.08)',
                              color: '#fb923c',
                              border: '1px solid rgba(251, 146, 60, 0.15)',
                            }}>
                              {Math.round(item.nutrients?.sodium_mg ?? 0)}mg sod
                            </span>
                            {/* Protein */}
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(167, 139, 250, 0.08)',
                              color: '#a78bfa',
                              border: '1px solid rgba(167, 139, 250, 0.15)',
                            }}>
                              {((item.nutrients?.protein_g) ?? 0).toFixed(1)}g prot
                            </span>
                          </div>
                        </div>
                      ))}
                      {/* View full breakdown button */}
                      {meal.nutrition && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                          <button
                            type="button"
                            className="btn"
                            style={{
                              fontSize: 11,
                              padding: '5px 10px',
                              borderRadius: 8,
                              border: '1px solid var(--glass-edge)',
                              background: 'transparent',
                              color: 'var(--fg-secondary)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setBreakdownMeal(meal);
                            }}
                          >
                            View full nutrient breakdown
                          </button>
                        </div>
                      )}
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
