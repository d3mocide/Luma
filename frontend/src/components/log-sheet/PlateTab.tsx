import { useState, useEffect } from 'react'
import { Search, Utensils } from 'lucide-react'
import { api } from '../../lib/api'
import type { DraftItem } from './types'

type FoodResult = {
  id: string
  name: string
  brand?: string
  serving_size_g?: number
  nutrients_per_100g: Record<string, number>
}

type Props = {
  draftItems: DraftItem[]
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
}

export function PlateTab({ draftItems, onAddItem, onRemoveItem, onUpdateWeight }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FoodResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const delay = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res: unknown = await api.get(`/foods/search?q=${encodeURIComponent(searchQuery)}`)
        const foods = Array.isArray(res) ? res : ((res as Record<string, unknown>)?.results ?? []) as FoodResult[]
        setSearchResults(foods as FoodResult[])
      } catch (err) {
        console.error(err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(delay)
  }, [searchQuery])

  const addSearchItem = (food: FoodResult) => {
    const defaultWeight = food.serving_size_g || 100.0
    const n = food.nutrients_per_100g
    onAddItem({
      name: food.name,
      brand: food.brand,
      quantity: 1,
      unit: 'portion',
      estimated_weight_g: defaultWeight,
      nutrients: {
        calories: n.calories * (defaultWeight / 100.0),
        saturated_fat_g: n.saturated_fat_g * (defaultWeight / 100.0),
        soluble_fiber_g: n.soluble_fiber_g * (defaultWeight / 100.0),
        protein_g: n.protein_g * (defaultWeight / 100.0),
        carbohydrates_g: n.carbohydrates_g * (defaultWeight / 100.0),
        fat_g: n.fat_g * (defaultWeight / 100.0),
        fiber_g: n.fiber_g * (defaultWeight / 100.0),
        sodium_mg: n.sodium_mg * (defaultWeight / 100.0),
      },
    })
    setSearchQuery('')
    setSearchResults([])
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search oats, salmon, fruits, vegetables..."
          className="field-input w-full rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none"
          style={{ border: '1px solid var(--glass-edge)' }}
        />
        <span className="absolute left-3 top-2.5 text-slate-500 text-sm"><Search size={14} strokeWidth={1.5} /></span>
        {isSearching && (
          <span className="absolute right-3 top-2.5 w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {searchResults.length > 0 && (
        <div className="glass-inset overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-800/80">
          {searchResults.map((food) => (
            <button
              key={food.id}
              onClick={() => addSearchItem(food)}
              className="w-full p-2.5 text-left flex items-center justify-between transition-colors"
              style={{ color: 'var(--fg-secondary)' }}
            >
              <div>
                <span className="text-sm font-semibold block" style={{ color: 'var(--fg-primary)' }}>{food.name}</span>
                <span className="text-xs" style={{ color: 'var(--fg-quiet)' }}>{food.brand || 'USDA reference'}</span>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--sky-300)', background: 'rgba(56,189,248,0.10)' }}>
                {Math.round(food.nutrients_per_100g.calories)} kcal
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="eyebrow block">Plate Items ({draftItems.length})</h4>
        {draftItems.length === 0 ? (
          <div className="p-8 text-center glass-inset rounded-xl" style={{ borderStyle: 'dashed' }}>
            <span className="text-2xl block mb-2 opacity-50"><Utensils size={20} strokeWidth={1.5} /></span>
            <p className="text-xs" style={{ color: 'var(--fg-quiet)' }}>Your plate is currently empty.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {draftItems.map((item, idx) => (
              <div key={idx} className="glass-inset rounded-xl p-3 flex flex-col gap-2 relative group">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold block" style={{ color: 'var(--fg-primary)' }}>{item.name}</span>
                    <span className="text-xs" style={{ color: 'var(--fg-quiet)' }}>{item.brand || 'Generic'}</span>
                  </div>
                  <button
                    onClick={() => onRemoveItem(idx)}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--fg-quiet)' }}
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center justify-between gap-4 mt-1 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>Weight</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={Math.round(item.estimated_weight_g)}
                      onChange={(e) => onUpdateWeight(idx, Math.max(1, parseInt(e.target.value) || 0))}
                      className="field-input w-16 text-center text-xs font-bold py-1 rounded focus:outline-none"
                      style={{ border: '1px solid var(--glass-edge)' }}
                    />
                    <span className="eyebrow" style={{ fontSize: 10 }}>g</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
