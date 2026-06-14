import { useState, useEffect, useRef, useId } from 'react'
import { Search, Plus, X, Camera, Star } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { api } from '../../lib/api'
import {
  type PortionUnit, type HouseholdMeasure, PORTION_UNITS, PORTION_UNIT_LABELS, PRESETS_BY_UNIT,
  unitToGrams, densityForFood, defaultQtyForUnit,
} from '../../lib/portions'
import { scaleNutrients, toNutrients } from '../../lib/nutrients'
import { DraftItemList } from './DraftItemList'
import type { DraftItem, Favorite } from './types'

const FOOD_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
]

type FoodResult = {
  id: string
  name: string
  brand?: string
  source?: string
  serving_size_g?: number
  nutrients_per_100g: Record<string, number>
  household_measures?: HouseholdMeasure[]
  flags?: string[]
}

// A household measure is identified in the unit picker as "hm:<index>".
function gramsForUnit(food: FoodResult, unit: string, qty: number): number {
  if (unit.startsWith('hm:')) {
    const m = food.household_measures?.[Number(unit.slice(3))]
    return m ? qty * m.grams : qty
  }
  return unitToGrams(qty, unit as PortionUnit, {
    density: densityForFood(food.name),
    servingSizeG: food.serving_size_g,
  })
}

const FLAG_BADGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  'heart-healthy':      { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', label: 'Heart' },
  'anti-inflammatory':  { bg: 'rgba(20,184,166,0.15)',  color: '#2dd4bf', label: 'Anti-Inflam' },
  'gluten-free':        { bg: 'rgba(139,92,246,0.15)',  color: '#a78bfa', label: 'GF' },
  'keto-friendly':      { bg: 'rgba(249,115,22,0.15)',  color: '#fb923c', label: 'Keto' },
  'high-protein':       { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8', label: 'Hi-Protein' },
  'high-fiber':         { bg: 'rgba(132,204,22,0.15)',  color: '#a3e635', label: 'Hi-Fiber' },
  'low-sodium':         { bg: 'rgba(34,197,94,0.10)',   color: '#86efac', label: 'Low-Na' },
  'high-saturated-fat': { bg: 'rgba(251,146,60,0.15)',  color: '#fb923c', label: 'Sat-Fat' },
  'high-sodium':        { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: 'Hi-Na' },
  'high-sugar':         { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', label: 'Hi-Sugar' },
  'inflammatory':       { bg: 'rgba(239,68,68,0.15)',   color: '#f87171', label: 'Inflam' },
  'processed':          { bg: 'rgba(161,161,170,0.15)', color: '#a1a1aa', label: 'Processed' },
}

const POSITIVE_FLAGS = new Set([
  'heart-healthy', 'anti-inflammatory', 'gluten-free',
  'keto-friendly', 'high-protein', 'high-fiber', 'low-sodium',
])

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

type Props = {
  draftItems: DraftItem[]
  onAddItem: (item: DraftItem) => void
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
  onUpdateName: (index: number, name: string) => void
  emptyStateMessage?: string
  favorites?: Favorite[]
  onPickFavorite?: (items: DraftItem[], name: string) => void
  // Forwarded to the item list so each ingredient shows its per-serving weight.
  servings?: number
}

export function IngredientBuilder({ draftItems, onAddItem, onRemoveItem, onUpdateWeight, onUpdateName, emptyStateMessage, favorites, onPickFavorite, servings }: Props) {
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<FoodResult[]>([])
  const [isSearching, setIsSearching]   = useState(false)
  const [pending, setPending]           = useState<FoodResult | null>(null)
  const [pendingQty, setPendingQty]     = useState('')
  const [pendingUnit, setPendingUnit]   = useState<string>('g')
  const [isScanning, setIsScanning]     = useState(false)
  const [barcodeError, setBarcodeError] = useState('')
  const [recentFoods, setRecentFoods]   = useState<FoodResult[]>([])
  const qtyRef = useRef<HTMLInputElement>(null)
  // Cleared once the user adjusts qty/unit, so async enrichment doesn't clobber
  // a portion they've already chosen.
  const autoUnitRef = useRef(true)
  const selectFoodRef = useRef<(food: FoodResult) => void>(() => {})
  const uid = useId()
  const scannerDomId = `ingredient-scanner-${uid.replace(/:/g, '')}`

  useEffect(() => {
    api.get<FoodResult[] | { results: FoodResult[] }>('/foods/recent')
      .then((res) => {
        const foods = Array.isArray(res) ? res : ((res as { results?: FoodResult[] }).results ?? [])
        setRecentFoods(foods as FoodResult[])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (pending) { setResults([]); return }
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setIsSearching(true)
      try {
        const params = new URLSearchParams()
        params.set('q', query.trim())
        const res: unknown = await api.get(`/foods/search?${params.toString()}`)
        const foods = Array.isArray(res) ? res : ((res as Record<string, unknown>)?.results ?? []) as FoodResult[]
        setResults(foods as FoodResult[])
      } catch { /* ignore */ } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, pending])

  function selectFood(food: FoodResult) {
    setPending(food)
    autoUnitRef.current = true
    // Default to the food's own first household measure when it has one
    // (e.g. a scanned product logs as "1 serving"); otherwise fall back to grams.
    const hasMeasures = (food.household_measures?.length ?? 0) > 0
    setPendingUnit(hasMeasures ? 'hm:0' : 'g')
    setPendingQty(String(hasMeasures ? 1 : Math.round(food.serving_size_g || 100)))
    setQuery('')
    setResults([])
    setIsScanning(false)
    setTimeout(() => qtyRef.current?.select(), 60)

    // USDA search hits are abridged. Pull the full FDC record once to surface
    // household portions ("1 cup", "1 slice") and complete nutrients.
    if (food.source === 'usda' && !hasMeasures && food.id) {
      api.post<FoodResult>(`/foods/${food.id}/enrich`, {})
        .then((enriched) => {
          setPending((cur) => (cur && cur.id === food.id ? { ...cur, ...enriched } : cur))
          if (autoUnitRef.current && (enriched.household_measures?.length ?? 0) > 0) {
            setPendingUnit('hm:0')
            setPendingQty('1')
          }
        })
        .catch(() => { /* keep generic units */ })
    }
  }
  selectFoodRef.current = selectFood

  function changeUnit(unit: string) {
    autoUnitRef.current = false
    setPendingUnit(unit)
    const qty = unit.startsWith('hm:') ? 1 : defaultQtyForUnit(unit as PortionUnit, pending?.serving_size_g)
    setPendingQty(String(qty))
  }

  useEffect(() => {
    if (!isScanning) return
    const scanner = new Html5Qrcode(scannerDomId, { formatsToSupport: FOOD_FORMATS, verbose: false })
    let fired = false
    let startResolved = false
    let stopRequested = false

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 130 } },
        async (code: string) => {
          if (fired) return
          fired = true
          setBarcodeError('')
          try {
            const food = await api.post<Record<string, unknown>>('/log/meal/barcode', { barcode: code })
            selectFoodRef.current({
              id: food.id as string,
              name: food.name as string,
              brand: food.brand as string | undefined,
              serving_size_g: food.serving_size_g as number | undefined,
              nutrients_per_100g: food.nutrients_per_100g as Record<string, number>,
              household_measures: food.household_measures as HouseholdMeasure[] | undefined,
              flags: food.flags as string[] | undefined,
            })
          } catch {
            setBarcodeError('Product not found')
            setIsScanning(false)
          }
        },
        () => {},
      )
      .then(() => {
        startResolved = true
        if (stopRequested) scanner.stop().catch(() => {})
      })
      .catch(() => setIsScanning(false))

    return () => {
      stopRequested = true
      if (startResolved) scanner.stop().catch(() => {})
    }
  }, [isScanning, scannerDomId])

  function confirmAdd() {
    if (!pending) return
    const qty = Math.max(0, parseFloat(pendingQty) || 0)
    const grams = Math.max(1, Math.round(gramsForUnit(pending, pendingUnit, qty)))
    const unitLabel = pendingUnit.startsWith('hm:')
      ? (pending.household_measures?.[Number(pendingUnit.slice(3))]?.label ?? 'serving')
      : pendingUnit
    onAddItem({
      name: pending.name,
      brand: pending.brand,
      quantity: qty,
      unit: unitLabel,
      estimated_weight_g: grams,
      base_weight_g: grams,
      nutrients: scaleNutrients(pending.nutrients_per_100g, grams),
      food_id: pending.id,
      source: 'search',
    })
    setPending(null)
    setPendingQty('')
    setPendingUnit('g')
  }

  // Surface the user's saved favorites at the very top of search results so a
  // whole meal can be dropped in with one tap (and its name carried along).
  const favQuery = query.trim().toLowerCase()
  const matchingFavorites = !pending && favQuery && favorites
    ? favorites.filter((f) => f.name.toLowerCase().includes(favQuery)).slice(0, 4)
    : []

  function pickFavorite(fav: Favorite) {
    const items: DraftItem[] = fav.items.map((i) => ({
      name: i.food_name,
      brand: i.brand ?? undefined,
      quantity: i.quantity_g,
      unit: 'g',
      estimated_weight_g: i.quantity_g,
      base_weight_g: i.quantity_g,
      nutrients: toNutrients(i.nutrients),
    }))
    onPickFavorite?.(items, fav.name)
    setQuery('')
    setResults([])
  }

  const pendingMeasures = pending?.household_measures ?? []
  const pendingQtyNum = parseFloat(pendingQty) || 0
  const pendingG = pending ? gramsForUnit(pending, pendingUnit, pendingQtyNum) : 0
  const pendingKcal = pending ? Math.round((pending.nutrients_per_100g.calories || 0) * (pendingG / 100)) : 0
  const pendingProtein = pending ? ((pending.nutrients_per_100g.protein_g || 0) * (pendingG / 100)).toFixed(1) : '0'
  const pendingPresets = pendingUnit.startsWith('hm:') ? [0.5, 1, 2, 3] : PRESETS_BY_UNIT[pendingUnit as PortionUnit]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

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
              onClick={() => { setPending(null); setPendingQty(''); setPendingUnit('g') }}
              style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              ref={qtyRef}
              type="number"
              min={0}
              step="any"
              value={pendingQty}
              onChange={(e) => { autoUnitRef.current = false; setPendingQty(e.target.value) }}
              onKeyDown={(e) => e.key === 'Enter' && confirmAdd()}
              className="field-input"
              style={{
                width: 60, textAlign: 'center', borderRadius: 8, padding: '7px 6px',
                fontSize: 15, fontWeight: 700, border: '1px solid var(--glass-edge)',
                fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)',
              }}
            />
            <select
              value={pendingUnit}
              onChange={(e) => changeUnit(e.target.value)}
              className="field-input"
              style={{
                borderRadius: 8, padding: '7px 8px', fontSize: 12, flexShrink: 0, maxWidth: 150,
                border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                color: 'var(--fg-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {pendingMeasures.map((m, i) => (
                <option key={`hm:${i}`} value={`hm:${i}`} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>
                  {m.label} ({Math.round(m.grams)}g)
                </option>
              ))}
              {PORTION_UNITS.map((u) => (
                <option key={u} value={u} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>
                  {PORTION_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {pendingPresets.map((p) => {
                const active = pendingQtyNum === p
                return (
                  <button
                    key={p}
                    onClick={() => { autoUnitRef.current = false; setPendingQty(String(p)) }}
                    style={{
                      flex: 1, padding: '5px 2px', borderRadius: 7, fontSize: 10,
                      fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 150ms',
                      background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                      border: active ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                      color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                    }}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>

          {pendingG > 0 && (
            <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', paddingLeft: 2 }}>
              {pendingUnit !== 'g' && (
                <>= <span className="num" style={{ color: 'var(--fg-secondary)' }}>{Math.round(pendingG)}</span> g · </>
              )}
              ≈ <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingKcal}</span> kcal ·{' '}
              <span className="num" style={{ color: 'var(--fg-secondary)' }}>{pendingProtein}g</span> protein
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={confirmAdd}
            disabled={!pendingQty || pendingG <= 0}
            style={{ padding: '9px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Plus size={14} />
            Add to meal
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 12px 0 34px', borderRadius: 10, position: 'relative',
              border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
            }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search oats, salmon, chicken breast…"
                className="field-input"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  padding: '9px 0', fontSize: 13,
                  color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)',
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              )}
              {isSearching && (
                <span style={{ width: 14, height: 14, border: '2px solid var(--sky-400)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'block', flexShrink: 0 }} />
              )}
            </div>
            <button
              type="button"
              onClick={() => { setBarcodeError(''); setIsScanning((v) => !v) }}
              style={{
                padding: '0 14px', borderRadius: 10, flexShrink: 0,
                background: isScanning ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                border: isScanning ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                color: isScanning ? 'var(--sky-300)' : 'var(--fg-secondary)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, transition: 'all 150ms',
              }}
            >
              <Camera size={15} />
              Scan
            </button>
          </div>
          {isScanning && (
            <div style={{ marginTop: 8 }}>
              <div
                id={scannerDomId}
                style={{ borderRadius: 12, overflow: 'hidden', minHeight: 220, background: '#000' }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--fg-quiet)', textAlign: 'center' }}>
                Hold steady over the barcode
              </p>
            </div>
          )}
          {barcodeError && !isScanning && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--bad)' }}>{barcodeError}</p>
          )}
        </div>
      )}

      {/* ── Recent foods (shown when search is empty, no pending selection) ── */}
      {!pending && !query.trim() && recentFoods.length > 0 && (
        <div>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>Recent</div>
          <div className="glass-inset" style={{ borderRadius: 12, overflow: 'hidden' }}>
            {recentFoods.map((food, idx) => {
              const servingG = food.serving_size_g ?? 100
              const kcal = Math.round((food.nutrients_per_100g.calories ?? 0) * servingG / 100)
              const isLast = idx === recentFoods.length - 1
              const sourceLabel = food.source === 'off' ? 'Barcode scan'
                : food.source === 'usda' ? 'USDA'
                : 'Your food'
              return (
                <button
                  key={food.id}
                  onClick={() => selectFood(food)}
                  style={{
                    width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                    borderBottom: isLast ? 'none' : '1px solid var(--glass-edge)',
                    textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    transition: 'background 150ms',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {food.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                      {food.brand ? `${food.brand} · ` : ''}{sourceLabel} · <span className="num">{kcal}</span> kcal / serving
                    </div>
                  </div>
                  <Plus size={14} style={{ color: 'var(--sky-400)', flexShrink: 0 }} />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Matching favorites (surfaced above food results) ── */}
      {matchingFavorites.length > 0 && (
        <div className="glass-inset" style={{ borderRadius: 12, overflow: 'hidden' }}>
          {matchingFavorites.map((fav) => {
            const kcal = Math.round(fav.items.reduce((sum, i) => sum + (i.nutrients.calories ?? 0), 0))
            return (
              <button
                key={fav.id}
                onClick={() => pickFavorite(fav)}
                style={{
                  width: '100%', padding: '10px 12px', background: 'none', border: 'none',
                  borderBottom: '1px solid var(--glass-edge)', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Star size={13} fill="var(--aurora-pink)" style={{ color: 'var(--aurora-pink)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fav.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                      Favorite · {fav.items.length} {fav.items.length === 1 ? 'item' : 'items'}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--aurora-pink)', background: 'rgba(244,114,182,0.10)', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>
                  {kcal} kcal
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Search results ── */}
      {results.length > 0 && (
        <div className="glass-inset thin-scroll" style={{ borderRadius: 12, overflowX: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
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
      <DraftItemList
        draftItems={draftItems}
        onRemoveItem={onRemoveItem}
        onUpdateWeight={onUpdateWeight}
        onUpdateName={onUpdateName}
        emptyStateMessage={emptyStateMessage ?? 'Search above to start building your meal.'}
        servings={servings}
      />
    </div>
  )
}
