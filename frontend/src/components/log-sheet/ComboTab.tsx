import { useState, useEffect, useRef } from 'react'
import { Search, Plus, X, FlaskConical } from 'lucide-react'
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
  'heart-healthy':     { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', label: '♥ Heart' },
  'anti-inflammatory': { bg: 'rgba(20,184,166,0.15)',  color: '#2dd4bf', label: 'Anti-Inflam' },
  'gluten-free':       { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa', label: 'GF' },
  'keto-friendly':     { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c', label: 'Keto' },
  'high-protein':      { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8', label: 'Hi-Protein' },
  'high-fiber':        { bg: 'rgba(132,204,22,0.15)',  color: '#a3e635', label: 'Hi-Fiber' },
  'low-sodium':        { bg: 'rgba(34,197,94,0.10)',   color: '#86efac', label: 'Low-Na' },
  'high-saturated-fat':{ bg: 'rgba(251,146,60,0.15)',  color: '#fb923c', label: '⚠ Sat-Fat' },
  'high-sodium':       { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: '⚠ Hi-Na' },
  'high-sugar':        { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', label: '⚠ Hi-Sugar' },
  'inflammatory':      { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: '⚠ Inflam' },
  'processed':         { bg: 'rgba(161,161,170,0.15)', color: '#a1a1aa', label: 'Processed' },
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

type Props = {
  draftItems: DraftItem[]
  comboName: string
  onComboNameChange: (name: string) => void
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
}

const GRAM_PRESETS = [50, 100, 150, 200]

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

export function ComboTab({ draftItems, comboName, onComboNameChange, onAddItem, onRemoveItem }: Props) {
  const [searchQuery, setSearchQuery]     = useState('')
  const [searchResults, setSearchResults] = useState<FoodResult[]>([])
  const [isSearching, setIsSearching]     = useState(false)
  const [pendingFood, setPendingFood]     = useState<FoodResult | null>(null)
  const [pendingGrams, setPendingGrams]   = useState('')
  const gramsRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!searchQuery.trim() || pendingFood) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res: unknown = await api.get(`/foods/search?q=${encodeURIComponent(searchQuery)}`)
        const foods = Array.isArray(res)
          ? res
          : ((res as Record<string, unknown>)?.results ?? []) as FoodResult[]
        setSearchResults(foods as FoodResult[])
      } catch { /* ignore */ } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, pendingFood])

  function selectFood(food: FoodResult) {
    setPendingFood(food)
    setPendingGrams(String(Math.round(food.serving_size_g || 100)))
    setSearchQuery('')
    setSearchResults([])
    setTimeout(() => gramsRef.current?.select(), 60)
  }

  function cancelPending() {
    setPendingFood(null)
    setPendingGrams('')
  }

  function confirmAdd() {
    if (!pendingFood) return
    const grams = Math.max(1, parseFloat(pendingGrams) || 100)
    onAddItem({
      name: pendingFood.name,
      brand: pendingFood.brand,
      quantity: grams,
      unit: 'g',
      estimated_weight_g: grams,
      nutrients: nutrientsAt(pendingFood, grams),
    })
    setPendingFood(null)
    setPendingGrams('')
  }

  const pending = parseFloat(pendingGrams) || 0
  const pendingKcal = pendingFood
    ? Math.round((pendingFood.nutrients_per_100g.calories || 0) * (pending / 100))
    : 0
  const pendingProtein = pendingFood
    ? ((pendingFood.nutrients_per_100g.protein_g || 0) * (pending / 100)).toFixed(1)
    : '0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Combo name ── */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Combo name (optional)</div>
        <input
          type="text"
          value={comboName}
          onChange={(e) => onComboNameChange(e.target.value)}
          placeholder="e.g. Batch Bowl — Rice + Chicken + Broccoli"
          className="field-input"
          style={{
            width: '100%', borderRadius: 10, padding: '9px 12px', fontSize: 13,
            border: '1px solid var(--glass-edge)', color: 'var(--fg-primary)',
            fontFamily: 'var(--font-sans)',
          }}
        />
      </div>

      {/* ── Ingredient picker ── */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Add ingredient</div>

        {pendingFood ? (
          /* Gram picker for selected food */
          <div className="glass-inset" style={{ padding: 14, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pendingFood.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                  {pendingFood.brand || 'USDA reference'}
                </div>
              </div>
              <button
                onClick={cancelPending}
                style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>

            {/* Gram input + presets */}
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
                  const active = Math.round(pending) === p
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

            {/* Live preview */}
            {pending > 0 && (
              <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', paddingLeft: 2 }}>
                ≈ <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingKcal}</span> kcal ·{' '}
                <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingProtein}g</span> protein
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={confirmAdd}
              disabled={!pendingGrams || pending <= 0}
              style={{ padding: '9px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Plus size={14} />
              Add to combo
            </button>
          </div>
        ) : (
          /* Search input */
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wild rice, chicken breast, broccoli…"
              className="field-input"
              style={{
                width: '100%', borderRadius: 10, padding: '9px 34px', fontSize: 13,
                border: '1px solid var(--glass-edge)', color: 'var(--fg-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            />
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)', pointerEvents: 'none' }} />
            {isSearching && (
              <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg) } }`}</style>
            )}
            {isSearching && (
              <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--sky-400)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'block' }} />
            )}
          </div>
        )}

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="glass-inset" style={{ borderRadius: 12, overflow: 'hidden', marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
            {searchResults.map((food) => (
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
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                    {food.brand || 'USDA reference'}
                  </div>
                  <FlagBadges flags={food.flags} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sky-300)', background: 'rgba(56,189,248,0.10)', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>
                  {Math.round(food.nutrients_per_100g.calories || 0)} /100g
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Ingredient list ── */}
      {draftItems.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', border: '1px dashed var(--glass-edge)', borderRadius: 12 }}>
          <FlaskConical size={24} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)', margin: '0 auto 8px', display: 'block' }} />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-quiet)' }}>
            Search for an ingredient above to start building your combo.
          </p>
        </div>
      ) : (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Ingredients ({draftItems.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {draftItems.map((item, idx) => (
              <div
                key={idx}
                className="glass-inset"
                style={{ padding: '10px 12px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                    {Math.round(item.nutrients.calories)} kcal · {item.nutrients.protein_g.toFixed(1)}g protein
                  </div>
                </div>
                <div className="num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--sky-400)', flexShrink: 0 }}>
                  {Math.round(item.estimated_weight_g)}g
                </div>
                <button
                  onClick={() => onRemoveItem(idx)}
                  style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                  aria-label={`Remove ${item.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
