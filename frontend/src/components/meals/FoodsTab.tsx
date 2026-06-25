import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, ArrowLeft, Flame, CheckCircle2, Heart, Camera, Shield, Wheat, Dumbbell, Sprout } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { api } from '../../lib/api'
import { type FoodResult } from '../plan/types'
import { FOOD_CATEGORIES, SAT_FAT_COLORS, categoryMatchesFlags, type FoodCategory } from '../../lib/food-categories'

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
]

// ── Sat fat level label/badge ─────────────────────────────────────────────────

function SatFatBadge({ level, range }: { level: FoodCategory['satFatLevel']; range: string }) {
  const color = SAT_FAT_COLORS[level]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontFamily: 'var(--font-mono)',
      color, background: color + '18',
      border: `1px solid ${color}33`,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {range}
      <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>/ 100g</span>
    </span>
  )
}


// ── Shared Food Database Card Component ───────────────────────────────────────

function FoodLibCard({ food, onClick }: { food: FoodResult; onClick?: () => void }) {
  const satFat = food.nutrients_per_100g?.saturated_fat_g ?? 0
  const calories = food.nutrients_per_100g?.calories ?? 0
  const protein = food.nutrients_per_100g?.protein_g ?? 0
  const fiber = food.nutrients_per_100g?.dietary_fiber_g ?? food.nutrients_per_100g?.soluble_fiber_g ?? 0
  const carbs = food.nutrients_per_100g?.carbohydrates_g ?? 0
  const addedSugar = food.nutrients_per_100g?.added_sugars_g ?? 0
  const sodium = food.nutrients_per_100g?.sodium_mg ?? 0

  const CardComponent = onClick ? 'button' : 'div'
  const satFatColor = satFat < 3 ? 'var(--good)' : satFat < 8 ? 'var(--warn)' : 'var(--bad)'
  const satFatText = satFat < 3 ? 'Low' : satFat < 8 ? 'Medium' : 'High'

  return (
    <CardComponent
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`glass ${onClick ? 'food-db-card food-db-card-clickable' : 'food-db-card'}`}
    >
      {/* Header: Name, Brand/Source, Calories */}
      <div className="food-db-card-header">
        <div className="food-db-card-title-group">
          <div className="food-db-card-name-row">
            <span className="food-db-card-name">{food.name}</span>
            {food.brand === 'USDA Reference' ? (
              <span className="food-db-card-source-pill food-db-card-source-pill--usda-ref">
                USDA Reference
              </span>
            ) : food.source === 'user' ? (
              <span className="food-db-card-source-pill food-db-card-source-pill--custom">
                Custom
              </span>
            ) : food.source ? (
              <span className="food-db-card-source-pill food-db-card-source-pill--other">
                {food.source === 'off' ? 'Open Food Facts' : 'USDA API'}
              </span>
            ) : null}
          </div>
          {food.brand && food.brand !== 'USDA Reference' && (
            <div className="food-db-card-brand">{food.brand}</div>
          )}
        </div>
        <div className="food-db-card-calories">
          <div className="num food-db-card-cal-num">{Math.round(calories)} kcal</div>
          <div className="food-db-card-cal-sub">per 100g</div>
        </div>
      </div>

      {/* Saturated Fat Meter */}
      <div className="food-db-sat-fat-section">
        <div className="food-db-sat-fat-header">
          <span className="food-db-sat-fat-label">Saturated Fat / 100g</span>
          <span className="food-db-sat-fat-val" style={{ color: satFatColor }}>
            {satFat.toFixed(1)}g ({satFatText})
          </span>
        </div>
        <div className="food-db-sat-fat-bar-track">
          <div
            className="food-db-sat-fat-bar-fill"
            style={{
              width: `${Math.min((satFat / 30) * 100, 100)}%`,
              backgroundColor: satFatColor,
            }}
          />
        </div>
      </div>

      {/* Macronutrients Grid */}
      <div className="food-db-macro-grid">
        <div className="food-db-macro-col">
          <span className="food-db-macro-label">Protein</span>
          <span className="num food-db-macro-val food-db-macro-val--protein">
            {protein.toFixed(1)}g
          </span>
        </div>
        <div className="food-db-macro-col">
          <span className="food-db-macro-label">Fiber</span>
          <span className="num food-db-macro-val food-db-macro-val--fiber">
            {fiber.toFixed(1)}g
          </span>
        </div>
        <div className="food-db-macro-col">
          <span className="food-db-macro-label">Carbs</span>
          <span className="num food-db-macro-val food-db-macro-val--carbs">
            {carbs.toFixed(1)}g
          </span>
        </div>
        <div className="food-db-macro-col">
          <span className="food-db-macro-label">Add Sug</span>
          <span className="num food-db-macro-val" style={{ color: 'var(--aurora-pink)' }}>
            {addedSugar.toFixed(1)}g
          </span>
        </div>
        <div className="food-db-macro-col">
          <span className="food-db-macro-label">Sodium</span>
          <span className="num food-db-macro-val" style={{ color: '#fb923c' }}>
            {Math.round(sodium)}mg
          </span>
        </div>
      </div>
    </CardComponent>
  )
}

// ── Food comparison card (curated category browse) ────────────────────────────

function FoodCompareCard({ food, onClick }: { food: FoodResult; onClick: () => void }) {
  return <FoodLibCard food={food} onClick={onClick} />
}

// ── Curated category browse (whole group from the local database) ──────────────

function CategoryComparisonGrid({ category, onPick }: { category: FoodCategory; onPick: (name: string) => void }) {
  const { data: foods, isLoading } = useQuery<FoodResult[]>({
    queryKey: ['foods', 'category', category.id],
    queryFn: () => api.get(`/foods/search?category=${encodeURIComponent(category.id)}`),
    staleTime: 5 * 60_000,
  })

  if (isLoading) {
    return (
      <div className="food-category-grid">
        <style>{`@keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.3; } }`}</style>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass" style={{ padding: '14px 16px', borderRadius: 14, height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ width: '60%', height: 14, background: 'var(--bg-3)', borderRadius: 4, marginBottom: 12, animation: 'pulse 1.5s infinite ease-in-out' }} />
            <div style={{ width: '80%', height: 10, background: 'var(--bg-3)', borderRadius: 4, animation: 'pulse 1.5s infinite ease-in-out' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!foods?.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--fg-quiet)', fontStyle: 'italic', padding: '8px 0' }}>
        No reference foods in this group yet — try the search bar above.
      </p>
    )
  }

  return (
    <div className="food-category-grid">
      {foods.map((food) => (
        <FoodCompareCard key={food.id} food={food} onClick={() => onPick(food.name)} />
      ))}
    </div>
  )
}

// ── Category grid ─────────────────────────────────────────────────────────────

function CategoryGrid({
  onSelect,
  activeFlags = [],
}: {
  onSelect: (category: FoodCategory) => void
  activeFlags?: string[]
}) {
  const categories = FOOD_CATEGORIES.filter((cat) => categoryMatchesFlags(cat.id, activeFlags))

  if (categories.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13, padding: '40px 0' }}>
        No food groups match every selected filter. Try removing one.
      </p>
    )
  }

  return (
    <div className="food-category-grid">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat)}
          className="glass"
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            textAlign: 'left',
            cursor: 'pointer',
            border: '1px solid var(--glass-edge)',
            transition: 'border-color 150ms, background 150ms',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>{cat.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{cat.name}</span>
            </div>
            <SatFatBadge level={cat.satFatLevel} range={cat.satFatRange} />
          </div>

          <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
            {cat.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {cat.examples.slice(0, 3).map((ex) => (
              <span key={ex} style={{
                fontSize: 10, color: 'var(--fg-quiet)',
                background: 'var(--bg-3)', borderRadius: 6,
                padding: '2px 6px',
              }}>
                {ex}
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Search results list ───────────────────────────────────────────────────────

function FoodSearchResults({ results, isLoading }: { results: FoodResult[] | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!results?.length) {
    return (
      <p style={{ textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13, padding: '40px 0' }}>
        No foods found.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {results.map((food) => (
        <FoodLibCard key={food.id} food={food} />
      ))}
    </div>
  )
}

// ── Sat fat legend ────────────────────────────────────────────────────────────

function SatFatLegend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>Sat fat / 100g:</span>
      {[
        { label: 'Low  < 3g', color: 'var(--good)' },
        { label: 'Medium  3–8g', color: 'var(--warn)' },
        { label: 'High  > 8g', color: 'var(--bad)' },
      ].map(({ label, color }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Foods tab ────────────────────────────────────────────────────────────────

const FILTER_CHIPS = [
  { label: 'Heart Healthy', flag: 'heart-healthy',     color: 'rgba(34,197,94,0.15)',  icon: Heart },
  { label: 'Anti-Inflam',   flag: 'anti-inflammatory', color: 'rgba(20,184,166,0.15)', icon: Shield },
  { label: 'Gluten Free',   flag: 'gluten-free',       color: 'rgba(139,92,246,0.15)', icon: Wheat },
  { label: 'High Protein',  flag: 'high-protein',      color: 'rgba(56,189,248,0.15)', icon: Dumbbell },
  { label: 'High Fiber',    flag: 'high-fiber',        color: 'rgba(132,204,22,0.15)', icon: Sprout },
  { label: 'Keto',          flag: 'keto-friendly',     color: 'rgba(249,115,22,0.15)', icon: Flame },
]

export function FoodsTab() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeFlags, setActiveFlags] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<FoodCategory | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [barcodeScanning, setBarcodeScanning] = useState(false)
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeResult, setBarcodeResult] = useState<FoodResult | null>(null)
  const [barcodeError, setBarcodeError] = useState('')

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300)
  }

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  useEffect(() => {
    if (!barcodeScanning) return
    const scanner = new Html5Qrcode('food-lib-scanner', { formatsToSupport: BARCODE_FORMATS, verbose: false })
    let fired = false
    let startResolved = false
    let stopRequested = false
    const handleDecode = async (code: string) => {
      setBarcodeError('')
      setBarcodeLoading(true)
      try {
        const food = await api.get<FoodResult>(`/foods/barcode/${encodeURIComponent(code)}`)
        setBarcodeResult(food)
      } catch (err: unknown) {
        setBarcodeError((err as Error).message || 'Product not found')
      } finally {
        setBarcodeLoading(false)
      }
    }
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 130 } },
        (code: string) => {
          if (fired) return
          fired = true
          setBarcodeScanning(false)
          void handleDecode(code)
        },
        () => {},
      )
      .then(() => { startResolved = true; if (stopRequested) scanner.stop().catch(() => {}) })
      .catch(() => setBarcodeScanning(false))
    return () => { stopRequested = true; if (startResolved) scanner.stop().catch(() => {}) }
  }, [barcodeScanning])

  const { data: searchResults, isFetching } = useQuery<FoodResult[]>({
    queryKey: ['foods', debouncedQuery, activeFlags],
    queryFn: () => {
      const params = new URLSearchParams({ q: debouncedQuery })
      if (activeFlags.length) params.set('flags', activeFlags.join(','))
      return api.get(`/foods/search?${params.toString()}`)
    },
    enabled: debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const showResults = debouncedQuery.length > 1

  function toggleFlag(flag: string) {
    setActiveFlags((prev) => prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag])
  }

  function handleCategorySelect(cat: FoodCategory) {
    setSelectedCategory(cat)
  }

  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={15}
            style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--fg-quiet)', pointerEvents: 'none',
            }}
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search foods — try 'salmon', 'oats', 'cheddar'…"
            className="field-input"
            style={{
              width: '100%',
              paddingLeft: 38,
              paddingRight: query ? 38 : 14,
              height: 44,
              borderRadius: 12,
              fontSize: 14,
              border: '1px solid var(--glass-edge)',
              background: 'var(--glass-1)',
              color: 'var(--fg-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {query && (
            <button
              onClick={() => handleQueryChange('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: 'var(--fg-quiet)',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => { setBarcodeResult(null); setBarcodeError(''); setBarcodeScanning(true) }}
          style={{
            height: 44, padding: '0 14px', borderRadius: 12, flexShrink: 0,
            background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
            color: 'var(--fg-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, transition: 'all 150ms',
          }}
        >
          <Camera size={15} />
          Scan
        </button>
      </div>

      {/* Dietary filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {FILTER_CHIPS.map(({ label, flag, color, icon: Icon }) => {
          const on = activeFlags.includes(flag)
          return (
            <button
              key={flag}
              onClick={() => toggleFlag(flag)}
              aria-pressed={on}
              style={{
                padding: '6px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 150ms',
                background: on ? color : 'var(--glass-1)',
                border: on ? `1px solid ${color.replace('0.15', '0.5')}` : '1px solid var(--glass-edge)',
                color: on ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon size={13} strokeWidth={2.2} />
              {label}
            </button>
          )
        })}
        {activeFlags.length > 0 && (
          <button
            onClick={() => setActiveFlags([])}
            style={{
              padding: '6px 11px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', background: 'none', border: '1px solid var(--glass-edge)',
              color: 'var(--fg-quiet)', display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {barcodeScanning && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="eyebrow">Point at barcode</span>
            <button
              type="button"
              onClick={() => setBarcodeScanning(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 4 }}
            >
              <X size={16} />
            </button>
          </div>
          <div id="food-lib-scanner" style={{ width: '100%', borderRadius: 12, overflow: 'hidden', background: '#000', minHeight: 240 }} />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--fg-quiet)', textAlign: 'center' }}>Hold steady over the barcode</p>
        </div>
      )}

      {!barcodeScanning && barcodeLoading && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-tertiary)', fontSize: 13 }}>
          Looking up product…
        </div>
      )}

      {!barcodeScanning && barcodeError && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 12,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 13, color: 'var(--bad)' }}>{barcodeError}</span>
          <button
            type="button"
            onClick={() => { setBarcodeError(''); setBarcodeScanning(true) }}
            style={{ fontSize: 12, color: 'var(--sky-400)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            Try again
          </button>
        </div>
      )}

      {!barcodeScanning && !barcodeLoading && barcodeResult && (
        <div
          className="glass"
          style={{ marginBottom: 16, padding: '16px 18px', borderRadius: 16, border: '1px solid var(--glass-edge)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} strokeWidth={2} style={{ color: 'var(--good)' }} />
              <span style={{ fontSize: 11, color: 'var(--good)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Saved to food library</span>
            </div>
            <button
              type="button"
              onClick={() => setBarcodeResult(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-primary)', marginBottom: 2 }}>
            {barcodeResult.name}
          </div>
          {barcodeResult.brand && (
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 12 }}>{barcodeResult.brand}</div>
          )}
          <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
            {[
              { label: 'Cal', value: String(Math.round(barcodeResult.nutrients_per_100g.calories ?? 0)) },
              { label: 'Protein', value: `${Math.round(barcodeResult.nutrients_per_100g.protein_g ?? 0)}g` },
              { label: 'Carbs', value: `${Math.round(barcodeResult.nutrients_per_100g.carbohydrates_g ?? 0)}g` },
              { label: 'Fat', value: `${Math.round(barcodeResult.nutrients_per_100g.fat_g ?? 0)}g` },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-primary)' }}>{value}</div>
                <div style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setBarcodeResult(null); setBarcodeError(''); setBarcodeScanning(true) }}
            style={{
              marginTop: 14, width: '100%', padding: '8px 0', borderRadius: 10, fontSize: 13,
              background: 'var(--glass-2)', border: '1px solid var(--glass-edge)',
              color: 'var(--fg-secondary)', cursor: 'pointer',
            }}
          >
            Scan another
          </button>
        </div>
      )}

      {showResults ? (
        <>
          <SatFatLegend />
          <div style={{ marginTop: 12 }}>
            <FoodSearchResults results={searchResults} isLoading={isFetching && !searchResults} />
          </div>
        </>
      ) : selectedCategory ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Category Hub Header */}
          <div
            className="glass"
            style={{
              padding: '18px 20px',
              borderRadius: 16,
              border: '1px solid var(--glass-edge)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex' }}>
              <button
                onClick={() => setSelectedCategory(null)}
                className="btn btn-ghost"
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  gap: 6,
                  borderRadius: 8,
                  marginLeft: -8,
                  color: 'var(--fg-secondary)',
                  height: 'auto',
                }}
              >
                <ArrowLeft size={14} />
                Back to groups
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>{selectedCategory.emoji}</span>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--fg-primary)' }}>
                  {selectedCategory.name}
                </h2>
              </div>
              <SatFatBadge level={selectedCategory.satFatLevel} range={selectedCategory.satFatRange} />
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
              {selectedCategory.description}
            </p>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Curated Reference Comparisons</div>
            <CategoryComparisonGrid
              category={selectedCategory}
              onPick={(name) => {
                handleQueryChange(name)
                setSelectedCategory(null)
                inputRef.current?.focus()
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Food groups</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-tertiary)' }}>
              Typical saturated fat per 100g. Click any group to compare clinical-grade reference ingredients.
            </p>
          </div>
          <SatFatLegend />
          <div style={{ marginTop: 16 }}>
            <CategoryGrid onSelect={handleCategorySelect} activeFlags={activeFlags} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Journal types ─────────────────────────────────────────────────────────────
