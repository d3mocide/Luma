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
                    }}>
                      <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }} className="thin-scroll">
                        <div className="meal-items-table">
                          <div className="meal-items-header">
                            <div className="meal-items-header-cell">Item</div>
                            <div className="meal-items-header-cell">Weight</div>
                            <div className="meal-items-header-cell">Cal</div>
                            <div className="meal-items-header-cell">Sat Fat</div>
                            <div className="meal-items-header-cell">Sol Fib</div>
                            <div className="meal-items-header-cell">Sodium</div>
                            <div className="meal-items-header-cell">Protein</div>
                          </div>
                          {meal.items.map((item, idx) => (
                            <div key={idx} className="meal-items-row">
                              <div className="meal-item-name-cell">
                                <span className="meal-item-name">{item.name}</span>
                                {item.brand && <span className="meal-item-brand">{item.brand}</span>}
                              </div>
                              <div className="meal-items-cell-num weight-cell">
                                {Math.round(item.estimated_weight_g || item.quantity)}
                                <span className="sm-hidden">g</span>
                              </div>
                              <div className="meal-items-cell-num cal-cell">
                                {Math.round(item.nutrients?.calories ?? 0)}
                                <span className="sm-hidden"> kcal</span>
                              </div>
                              <div className="meal-items-cell-num sat-cell">
                                {((item.nutrients?.saturated_fat_g) ?? 0).toFixed(1)}g
                                <span className="sm-hidden"> sat</span>
                              </div>
                              <div className="meal-items-cell-num fib-cell">
                                {((item.nutrients?.soluble_fiber_g) ?? 0).toFixed(1)}g
                                <span className="sm-hidden"> fiber</span>
                              </div>
                              <div className="meal-items-cell-num sod-cell">
                                {Math.round(item.nutrients?.sodium_mg ?? 0)}mg
                                <span className="sm-hidden"> sod</span>
                              </div>
                              <div className="meal-items-cell-num prot-cell">
                                {((item.nutrients?.protein_g) ?? 0).toFixed(1)}g
                                <span className="sm-hidden"> prot</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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
