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
  flags?: string[]
}

type Props = {
  draftItems: DraftItem[]
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
}

const FILTER_CHIPS: { label: string; flag: string; color: string }[] = [
  { label: 'Heart Healthy', flag: 'heart-healthy',    color: 'rgba(34,197,94,0.15)'  },
  { label: 'Anti-Inflam',   flag: 'anti-inflammatory', color: 'rgba(20,184,166,0.15)' },
  { label: 'Gluten Free',   flag: 'gluten-free',       color: 'rgba(139,92,246,0.15)' },
  { label: 'High Protein',  flag: 'high-protein',      color: 'rgba(56,189,248,0.15)' },
  { label: 'High Fiber',    flag: 'high-fiber',        color: 'rgba(132,204,22,0.15)' },
  { label: 'Keto',          flag: 'keto-friendly',     color: 'rgba(249,115,22,0.15)' },
]

const FLAG_BADGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  'heart-healthy':    { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', label: '♥ Heart' },
  'anti-inflammatory':{ bg: 'rgba(20,184,166,0.15)',  color: '#2dd4bf', label: 'Anti-Inflam' },
  'gluten-free':      { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa', label: 'GF' },
  'keto-friendly':    { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c', label: 'Keto' },
  'high-protein':     { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8', label: 'Hi-Protein' },
  'high-fiber':       { bg: 'rgba(132,204,22,0.15)',  color: '#a3e635', label: 'Hi-Fiber' },
  'low-sodium':       { bg: 'rgba(34,197,94,0.10)',   color: '#86efac', label: 'Low-Na' },
  'high-saturated-fat':{ bg: 'rgba(251,146,60,0.15)', color: '#fb923c', label: '⚠ Sat-Fat' },
  'high-sodium':      { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: '⚠ Hi-Na' },
  'high-sugar':       { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', label: '⚠ Hi-Sugar' },
  'inflammatory':     { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: '⚠ Inflam' },
  'processed':        { bg: 'rgba(161,161,170,0.15)', color: '#a1a1aa', label: 'Processed' },
}

const POSITIVE_FLAGS = new Set(['heart-healthy','anti-inflammatory','gluten-free','keto-friendly','high-protein','high-fiber','low-sodium'])

function FlagBadges({ flags }: { flags?: string[] }) {
  if (!flags?.length) return null
  const sorted = [...flags].sort((a, b) => (POSITIVE_FLAGS.has(b) ? 1 : 0) - (POSITIVE_FLAGS.has(a) ? 1 : 0))
  const visible = sorted.slice(0, 3)
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
      {visible.map((f) => {
        const style = FLAG_BADGE_STYLES[f]
        if (!style) return null
        return (
          <span key={f} style={{
            fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 999,
            background: style.bg, color: style.color, letterSpacing: '0.02em',
          }}>
            {style.label}
          </span>
        )
      })}
    </div>
  )
}

export function PlateTab({ draftItems, onAddItem, onRemoveItem, onUpdateWeight }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FoodResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedFlags, setSelectedFlags] = useState<string[]>([])

  function toggleFlag(flag: string) {
    setSelectedFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    )
  }

  useEffect(() => {
    if (!searchQuery.trim() && selectedFlags.length === 0) {
      setSearchResults([])
      return
    }
    const delay = setTimeout(async () => {
      setIsSearching(true)
      try {
        const params = new URLSearchParams()
        if (searchQuery.trim()) params.set('q', searchQuery.trim())
        if (selectedFlags.length) params.set('flags', selectedFlags.join(','))
        const res: unknown = await api.get(`/foods/search?${params.toString()}`)
        const foods = Array.isArray(res) ? res : ((res as Record<string, unknown>)?.results ?? []) as FoodResult[]
        setSearchResults(foods as FoodResult[])
      } catch (err) {
        console.error(err)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(delay)
  }, [searchQuery, selectedFlags])

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
      {/* ── Filter chips ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTER_CHIPS.map(({ label, flag, color }) => {
          const active = selectedFlags.includes(flag)
          return (
            <button
              key={flag}
              onClick={() => toggleFlag(flag)}
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10,
                fontWeight: 600, cursor: 'pointer', transition: 'all 150ms',
                background: active ? color : 'var(--glass-1)',
                border: active ? `1px solid ${color.replace('0.15', '0.5')}` : '1px solid var(--glass-edge)',
                color: active ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Search input ── */}
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
              <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                <span className="text-sm font-semibold block" style={{ color: 'var(--fg-primary)' }}>{food.name}</span>
                <span className="text-xs" style={{ color: 'var(--fg-quiet)' }}>{food.brand || 'USDA reference'}</span>
                <FlagBadges flags={food.flags} />
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ color: 'var(--sky-300)', background: 'rgba(56,189,248,0.10)' }}>
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

                {/* Preset Chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, justifyContent: 'flex-end' }}>
                  {['50', '100', '150', '200', '300'].map((preset) => {
                    const active = Math.round(item.estimated_weight_g) === parseInt(preset, 10)
                    return (
                      <button
                        key={preset}
                        onClick={() => onUpdateWeight(idx, parseInt(preset, 10))}
                        className={`serving-chip ${active ? 'active' : ''}`}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                          border: active ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                          color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          cursor: 'pointer',
                          transition: 'all 150ms',
                        }}
                      >
                        {preset}g
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
