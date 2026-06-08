import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Zap } from 'lucide-react'
import type { DraftItem, Favorite } from './types'

type FrequentMeal = {
  slot: string
  items: DraftItem[]
  nutrition: Record<string, number>
  count: number
  last_logged: string
}

const MAX_QUICK_PICKS = 5

type Props = {
  currentSlot: string
  onAddItems: (items: DraftItem[]) => void
  favorites?: Favorite[]
  onLogFavoriteDirect?: (items: DraftItem[], name: string) => void
  isLoggingFavorite?: boolean
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export function QuickTab({ currentSlot, onAddItems, favorites, onLogFavoriteDirect, isLoggingFavorite }: Props) {
  const { data, isLoading } = useQuery<{ suggestions: FrequentMeal[] }>({
    queryKey: ['meals', 'frequent'],
    queryFn: () => api.get('/log/meals/frequent'),
    staleTime: 5 * 60 * 1000,
  })

  const suggestions = data?.suggestions ?? []

  // Sort: current slot first, then surface only the top picks
  const sorted = [...suggestions]
    .sort((a, b) => {
      if (a.slot === currentSlot) return -1
      if (b.slot === currentSlot) return 1
      return 0
    })
    .slice(0, MAX_QUICK_PICKS)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {isLoading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13 }}>
          Loading…
        </div>
      ) : !sorted.length ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13 }}>
          No meal history yet. Log a few meals and your usuals will appear here.
        </div>
      ) : (
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
      )}

      {favorites !== undefined && (
        <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 18 }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: 12, color: 'var(--fg-quiet)' }}>
            My favorites
          </span>
          {favorites.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: 0 }}>
              Save a meal as a favorite from the footer to see it here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {favorites.map((fav) => {
                const kcal = Math.round(fav.items.reduce((sum, i) => sum + (i.nutrients.calories ?? 0), 0))
                const favDraftItems: DraftItem[] = fav.items.map((i) => ({
                  name: i.food_name,
                  brand: i.brand ?? undefined,
                  quantity: i.quantity_g,
                  unit: 'g',
                  estimated_weight_g: i.quantity_g,
                  nutrients: {
                    calories: i.nutrients.calories ?? 0,
                    saturated_fat_g: i.nutrients.saturated_fat_g ?? 0,
                    soluble_fiber_g: i.nutrients.soluble_fiber_g ?? 0,
                    protein_g: i.nutrients.protein_g ?? 0,
                    carbohydrates_g: i.nutrients.carbohydrates_g ?? 0,
                    fat_g: i.nutrients.fat_g ?? 0,
                    fiber_g: i.nutrients.fiber_g ?? 0,
                    sodium_mg: i.nutrients.sodium_mg ?? 0,
                  },
                }))
                return (
                  <button
                    key={fav.id}
                    onClick={() => onLogFavoriteDirect?.(favDraftItems, fav.name)}
                    disabled={isLoggingFavorite}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--glass-edge)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      textAlign: 'left',
                      cursor: isLoggingFavorite ? 'default' : 'pointer',
                      opacity: isLoggingFavorite ? 0.5 : 1,
                      transition: 'all 150ms',
                    }}
                  >
                    <span style={{ color: 'var(--fg-secondary)', fontSize: 13, fontWeight: 500 }}>{fav.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--fg-quiet)', fontSize: 11, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                      <Zap size={10} />
                      {isLoggingFavorite ? 'Logging…' : `${kcal} kcal`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
