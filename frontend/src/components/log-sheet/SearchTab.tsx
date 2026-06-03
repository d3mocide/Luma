import { IngredientBuilder } from './IngredientBuilder'
import type { DraftItem, Favorite } from './types'
import { Zap } from 'lucide-react'

type Props = {
  draftItems: DraftItem[]
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
  favorites?: Favorite[]
  onLogFavoriteDirect?: (items: DraftItem[], name: string) => void
  isLoggingFavorite?: boolean
}

export function SearchTab({
  draftItems,
  onAddItem,
  onRemoveItem,
  onUpdateWeight,
  favorites,
  onLogFavoriteDirect,
  isLoggingFavorite,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <IngredientBuilder
        draftItems={draftItems}
        onAddItem={onAddItem}
        onRemoveItem={onRemoveItem}
        onUpdateWeight={onUpdateWeight}
      />

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
                const draftItems: DraftItem[] = fav.items.map((i) => ({
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
                    onClick={() => onLogFavoriteDirect?.(draftItems, fav.name)}
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
