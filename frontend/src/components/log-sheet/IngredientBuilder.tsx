import { useState, useEffect, useRef } from 'react'
import { Search, Plus, X, Utensils } from 'lucide-react'
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

const FLAG_BADGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  'heart-healthy':      { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', label: '♥ Heart' },
  'anti-inflammatory':  { bg: 'rgba(20,184,166,0.15)',  color: '#2dd4bf', label: 'Anti-Inflam' },
  'gluten-free':        { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa', label: 'GF' },
  'keto-friendly':      { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c', label: 'Keto' },
  'high-protein':       { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8', label: 'Hi-Protein' },
  'high-fiber':         { bg: 'rgba(132,204,22,0.15)',  color: '#a3e635', label: 'Hi-Fiber' },
  'low-sodium':         { bg: 'rgba(34,197,94,0.10)',   color: '#86efac', label: 'Low-Na' },
  'high-saturated-fat': { bg: 'rgba(251,146,60,0.15)',  color: '#fb923c', label: '⚠ Sat-Fat' },
  'high-sodium':        { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: '⚠ Hi-Na' },
  'high-sugar':         { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', label: '⚠ Hi-Sugar' },
  'inflammatory':       { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: '⚠ Inflam' },
  'processed':          { bg: 'rgba(161,161,170,0.15)', color: '#a1a1aa', label: 'Processed' },
}

const POSITIVE_FLAGS = new Set([
  'heart-healthy', 'anti-inflammatory', 'gluten-free',
  'keto-friendly', 'high-protein', 'high-fiber', 'low-sodium',
])

const FILTER_CHIPS = [
  { label: 'Heart Healthy', flag: 'heart-healthy',     color: 'rgba(34,197,94,0.15)'  },
  { label: 'Anti-Inflam',   flag: 'anti-inflammatory', color: 'rgba(20,184,166,0.15)' },
  { label: 'Gluten Free',   flag: 'gluten-free',       color: 'rgba(139,92,246,0.15)' },
  { label: 'High Protein',  flag: 'high-protein',      color: 'rgba(56,189,248,0.15)' },
  { label: 'High Fiber',    flag: 'high-fiber',        color: 'rgba(132,204,22,0.15)' },
  { label: 'Keto',          flag: 'keto-friendly',     color: 'rgba(249,115,22,0.15)' },
]

const GRAM_PRESETS = [50, 100, 150, 200]

function FlagBadges({ flags }: { flags?: string[] }) {
  if (!flags?.length) return null
  const sorted = [...flags].sort((a, b) => (POSITIVE_FLAGS.has(b) ? 1 : 0) - (POSITIVE_FLAGS.has(a) ? 1 : 0))
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 3 }}>
      {sorted.slice(0, 3).map((f) => {
        const s = FLAG_BADGE_STYLES[f]
        if (!s) return null
        return (
          <span key={f} style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 999, background: s.bg, color: s.color, letterSpacing: '0.02em' }}>
            {s.label}
          </span>
        )
      })}
    </div>
  )
}

function nutrientsAt(food: FoodResult, grams: number): DraftItem['nutrients'] {
  const n = food.nutrients_per_100g
  const f = grams / 100
  return {
    calories:        (n.calories        || 0) * f,
    saturated_fat_g: (n.saturated_fat_g || 0) * f,
    soluble_fiber_g: (n.soluble_fiber_g || 0) * f,
    protein_g:       (n.protein_g       || 0) * f,
    carbohydrates_g: (n.carbohydrates_g || 0) * f,
    fat_g:           (n.fat_g           || 0) * f,
    fiber_g:         (n.fiber_g         || 0) * f,
    sodium_mg:       (n.sodium_mg       || 0) * f,
  }
}

type Props = {
  draftItems: DraftItem[]
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
  emptyStateMessage?: string
}

export function IngredientBuilder({ draftItems, onAddItem, onRemoveItem, onUpdateWeight, emptyStateMessage }: Props) {
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<FoodResult[]>([])
  const [isSearching, setIsSearching]   = useState(false)
  const [activeFlags, setActiveFlags]   = useState<string[]>([])
  const [pending, setPending]           = useState<FoodResult | null>(null)
  const [pendingGrams, setPendingGrams] = useState('')
  const gramsRef = useRef<HTMLInputElement>(null)

  function toggleFlag(flag: string) {
    setActiveFlags((prev) => prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag])
  }

  useEffect(() => {
    if (pending) { setResults([]); return }
    if (!query.trim() && activeFlags.length === 0) { setResults([]); return }
    const t = setTimeout(async () => {
      setIsSearching(true)
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('q', query.trim())
        if (activeFlags.length) params.set('flags', activeFlags.join(','))
        const res: unknown = await api.get(`/foods/search?${params.toString()}`)
        const foods = Array.isArray(res) ? res : ((res as Record<string, unknown>)?.results ?? []) as FoodResult[]
        setResults(foods as FoodResult[])
      } catch { /* ignore */ } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, activeFlags, pending])

  function selectFood(food: FoodResult) {
    setPending(food)
    setPendingGrams(String(Math.round(food.serving_size_g || 100)))
    setQuery('')
    setResults([])
    setTimeout(() => gramsRef.current?.select(), 60)
  }

  function confirmAdd() {
    if (!pending) return
    const grams = Math.max(1, parseFloat(pendingGrams) || 100)
    onAddItem({
      name: pending.name,
      brand: pending.brand,
      quantity: grams,
      unit: 'g',
      estimated_weight_g: grams,
      nutrients: nutrientsAt(pending, grams),
    })
    setPending(null)
    setPendingGrams('')
  }

  const pendingG = parseFloat(pendingGrams) || 0
  const pendingKcal = pending ? Math.round((pending.nutrients_per_100g.calories || 0) * (pendingG / 100)) : 0
  const pendingProtein = pending ? ((pending.nutrients_per_100g.protein_g || 0) * (pendingG / 100)).toFixed(1) : '0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Filter chips ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTER_CHIPS.map(({ label, flag, color }) => {
          const on = activeFlags.includes(flag)
          return (
            <button
              key={flag}
              onClick={() => toggleFlag(flag)}
              style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                cursor: 'pointer', transition: 'all 150ms', letterSpacing: '0.02em',
                background: on ? color : 'var(--glass-1)',
                border: on ? `1px solid ${color.replace('0.15', '0.5')}` : '1px solid var(--glass-edge)',
                color: on ? 'var(--fg-primary)' : 'var(--fg-secondary)',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Search input or gram picker ── */}
      {pending ? (
        <div className="glass-inset" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pending.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{pending.brand || 'USDA reference'}</div>
            </div>
            <button
              onClick={() => { setPending(null); setPendingGrams('') }}
              style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              ref={gramsRef}
              type="number"
              min={1}
              value={pendingGrams}
              onChange={(e) => setPendingGrams(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAdd()}
              className="field-input"
              style={{
                width: 68, textAlign: 'center', borderRadius: 8, padding: '7px 6px',
                fontSize: 15, fontWeight: 700, border: '1px solid var(--glass-edge)',
                fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--fg-tertiary)', flexShrink: 0 }}>g</span>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {GRAM_PRESETS.map((p) => {
                const active = Math.round(pendingG) === p
                return (
                  <button
                    key={p}
                    onClick={() => setPendingGrams(String(p))}
                    style={{
                      flex: 1, padding: '5px 2px', borderRadius: 7, fontSize: 10,
                      fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 150ms',
                      background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                      border: active ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                      color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                    }}
                  >
                    {p}g
                  </button>
                )
              })}
            </div>
          </div>

          {pendingG > 0 && (
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', paddingLeft: 2 }}>
              ≈ <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingKcal}</span> kcal ·{' '}
              <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingProtein}g</span> protein
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={confirmAdd}
            disabled={!pendingGrams || pendingG <= 0}
            style={{ padding: '9px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={14} />
            Add to meal
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search oats, salmon, chicken breast…"
            className="field-input"
            style={{
              width: '100%', borderRadius: 10, padding: '9px 34px', fontSize: 13,
              border: '1px solid var(--glass-edge)', color: 'var(--fg-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          />
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)', pointerEvents: 'none' }} />
          {isSearching && (
            <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--sky-400)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'block' }} />
          )}
        </div>
      )}

      {/* ── Search results ── */}
      {results.length > 0 && (
        <div className="glass-inset" style={{ borderRadius: 12, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
          {results.map((food) => (
            <button
              key={food.id}
              onClick={() => selectFood(food)}
              style={{
                width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                borderBottom: '1px solid var(--glass-edge)', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {food.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{food.brand || 'USDA reference'}</div>
                <FlagBadges flags={food.flags} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sky-300)', background: 'rgba(56,189,248,0.10)', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>
                {Math.round(food.nutrients_per_100g.calories || 0)} /100g
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Meal items ── */}
      {draftItems.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', border: '1px dashed var(--glass-edge)', borderRadius: 12 }}>
          <Utensils size={22} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)', margin: '0 auto 8px', display: 'block' }} />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-quiet)' }}>
            {emptyStateMessage ?? 'Search above to start building your meal.'}
          </p>
        </div>
      ) : (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Meal items ({draftItems.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {draftItems.map((item, idx) => (
              <div key={idx} className="glass-inset" style={{ padding: '10px 12px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                      {Math.round(item.nutrients.calories)} kcal · {item.nutrients.protein_g.toFixed(1)}g protein
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveItem(idx)}
                    style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                    aria-label={`Remove ${item.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>

                {/* Weight chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={Math.round(item.estimated_weight_g)}
                    onChange={(e) => onUpdateWeight(idx, Math.max(1, parseInt(e.target.value) || 0))}
                    className="field-input"
                    style={{
                      width: 56, textAlign: 'center', borderRadius: 7, padding: '4px 4px',
                      fontSize: 13, fontWeight: 700, border: '1px solid var(--glass-edge)',
                      fontFamily: 'var(--font-mono)', color: 'var(--sky-400)',
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', flexShrink: 0 }}>g</span>
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    {[50, 100, 150, 200, 300].map((p) => {
                      const active = Math.round(item.estimated_weight_g) === p
                      return (
                        <button
                          key={p}
                          onClick={() => onUpdateWeight(idx, p)}
                          style={{
                            flex: 1, padding: '4px 2px', borderRadius: 6, fontSize: 9,
                            fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 150ms',
                            background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                            border: active ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                            color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                          }}
                        >
                          {p}g
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
