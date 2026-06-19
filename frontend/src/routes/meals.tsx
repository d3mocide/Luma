import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Plus, BookOpen, ArrowLeft, BatteryLow, Battery, BatteryMedium, BatteryFull, Flame, Frown, Meh, Smile, Laugh, Angry, CircleDashed, Circle, CircleDot, Disc, CheckCircle2, RotateCcw, Heart, Check, Camera, Shield, Wheat, Dumbbell, Sprout } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { type FoodResult } from '../components/plan/types'
import { FOOD_CATEGORIES, SAT_FAT_COLORS, categoryMatchesFlags, type FoodCategory } from '../lib/food-categories'
import { JournalDrawer, type PendingMeal } from '../components/journal/JournalDrawer'
import { IngredientBuilder } from '../components/log-sheet/IngredientBuilder'
import type { DraftItem, Favorite } from '../components/log-sheet/types'
import { scaleByRatio, sumNutrients as sumNutrientList } from '../lib/nutrients'
import PlanRoute from './plan'
import RecipesRoute from './recipes'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

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

function FoodsTab() {
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

interface JournalEntry {
  id: string
  meal_event_id: string | null
  meal_name: string
  logged_at: string
  energy: number
  digestion: number
  mood: number
  satiety: number
  symptoms: string[]
  notes: string | null
  created_at: string
}

interface Correlation {
  meal_name: string
  count: number
  avg_energy: number
  avg_digestion: number
  avg_mood: number
  avg_satiety: number
}

// ── Score chip ────────────────────────────────────────────────────────────────

type ScoreType = 'energy' | 'digestion' | 'mood' | 'satiety'

const SCORE_ICONS: Record<ScoreType, LucideIcon[]> = {
  energy:    [Battery, BatteryLow, BatteryMedium, BatteryFull, Flame],
  digestion: [Angry, Frown, Meh, Smile, Laugh],
  mood:      [Angry, Frown, Meh, Smile, Laugh],
  satiety:   [CircleDashed, Circle, CircleDot, CheckCircle2, Disc],
}

function ScoreChip({ label, value, type }: { label: string; value: number; type: ScoreType }) {
  const Icon = SCORE_ICONS[type]?.[value - 1]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {Icon ? <Icon size={16} /> : <span style={{ fontSize: 16 }}>—</span>}
      <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

function AvgBar({ label, value }: { label: string; value: number }) {
  const color = value >= 4 ? 'var(--good)' : value >= 3 ? 'var(--warn)' : 'var(--bad)'
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>{label}</span>
        <span className="num" style={{ fontSize: 10, color, fontWeight: 600 }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / 5) * 100}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}

// ── Journal tab ───────────────────────────────────────────────────────────────

function JournalTab({ openWithPrefill }: { openWithPrefill?: PendingMeal | null }) {
  const [drawerOpen, setDrawerOpen] = useState(!!openWithPrefill)
  const [prefill, setPrefill] = useState<PendingMeal | null>(openWithPrefill ?? null)

  const { data: entriesData } = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ['journal'],
    queryFn: () => api.get('/journal?limit=50'),
    staleTime: 30_000,
  })

  const { data: corrData } = useQuery<{ correlations: Correlation[] }>({
    queryKey: ['journal-correlations'],
    queryFn: () => api.get('/journal/correlations'),
    staleTime: 60_000,
  })

  const entries = entriesData?.entries ?? []
  const correlations = corrData?.correlations ?? []

  function openDrawer(meal?: PendingMeal) {
    setPrefill(meal ?? null)
    setDrawerOpen(true)
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <div>
      {/* Correlation cards */}
      {correlations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Patterns over time</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {correlations.map((c) => (
              <div
                key={c.meal_name}
                className="glass"
                style={{
                  minWidth: 180, padding: '12px 14px',
                  borderRadius: 14, border: '1px solid var(--glass-edge)',
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.meal_name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 10 }}>
                  {c.count} {c.count === 1 ? 'entry' : 'entries'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <AvgBar label="Energy" value={c.avg_energy} />
                  <AvgBar label="Digestion" value={c.avg_digestion} />
                  <AvgBar label="Mood" value={c.avg_mood} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entry list header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="eyebrow">Journal entries</div>
        <button
          className="btn"
          style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => openDrawer()}
        >
          <Plus size={13} />
          Log how I feel
        </button>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="glass" style={{ padding: '40px 24px', textAlign: 'center', borderRadius: 16, border: '1px solid var(--glass-edge)' }}>
          <BookOpen size={32} style={{ color: 'var(--fg-quiet)', marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-secondary)', fontWeight: 500 }}>No journal entries yet.</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
            Log how a meal makes you feel and patterns will appear here.
          </p>
        </div>
      )}

      {/* Entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="glass"
            style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid var(--glass-edge)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 2 }}>
                  {entry.meal_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                  {timeAgo(entry.logged_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
                <ScoreChip label="Energy" value={entry.energy} type="energy" />
                <ScoreChip label="Digestion" value={entry.digestion} type="digestion" />
                <ScoreChip label="Mood" value={entry.mood} type="mood" />
                <ScoreChip label="Satiety" value={entry.satiety} type="satiety" />
              </div>
            </div>

            {entry.symptoms.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: entry.notes ? 8 : 0 }}>
                {entry.symptoms.map((s) => (
                  <span key={s} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.1)', color: 'var(--bad)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            )}

            {entry.notes && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-tertiary)', fontStyle: 'italic' }}>
                "{entry.notes}"
              </p>
            )}
          </div>
        ))}
      </div>

      {drawerOpen && (
        <JournalDrawer
          prefill={prefill}
          onClose={() => { setDrawerOpen(false); setPrefill(null) }}
        />
      )}
    </div>
  )
}

// ── Calculator tab ────────────────────────────────────────────────────────────

type NutrientTotals = DraftItem['nutrients']

function sumNutrients(items: DraftItem[]): NutrientTotals {
  return sumNutrientList(items)
}

function divideNutrients(totals: NutrientTotals, divisor: number): NutrientTotals {
  return scaleByRatio(totals, 1 / Math.max(1, divisor))
}

type NutrientRow = { label: string; key: keyof NutrientTotals; unit: string; color?: string; indent?: boolean }

const NUTRIENT_ROWS: NutrientRow[] = [
  { label: 'Calories',      key: 'calories',        unit: 'kcal', color: 'var(--sky-400)' },
  { label: 'Protein',       key: 'protein_g',       unit: 'g',    color: 'rgba(56,189,248,0.8)' },
  { label: 'Carbohydrates', key: 'carbohydrates_g', unit: 'g',    color: 'var(--fg-secondary)' },
  { label: 'Total fat',     key: 'fat_g',           unit: 'g',    color: 'var(--fg-secondary)' },
  { label: 'Saturated fat', key: 'saturated_fat_g', unit: 'g',    color: 'var(--sun-400)',  indent: true },
  { label: 'Fiber',         key: 'fiber_g',         unit: 'g',    color: '#34d399' },
  { label: 'Sodium',        key: 'sodium_mg',        unit: 'mg',   color: 'rgba(251,191,36,0.65)' },
]

function UnifiedNutritionPanel({
  total,
  perServing,
  servings,
  label,
}: {
  total: NutrientTotals
  perServing: NutrientTotals
  servings: number
  label: string
}) {
  const [mobileMode, setMobileMode] = useState<'serving' | 'total'>(servings > 1 ? 'serving' : 'total')

  useEffect(() => {
    setMobileMode(servings > 1 ? 'serving' : 'total')
  }, [servings])

  const is3Col = servings > 1

  return (
    <div className={`unified-nutrition-table ${is3Col ? 'unified-nutrition-table--3col' : ''}`}>
      <div className="unified-nutrition-header">
        <div className="unified-nutrition-cell--header" style={{ paddingLeft: 14 }}>{label}</div>
        {is3Col ? (
          <>
            <div className="unified-nutrition-cell--header hidden sm:block text-right">Total</div>
            <div className="unified-nutrition-cell--header hidden sm:block text-right" style={{ paddingRight: 14 }}>Per Serving</div>
            <div className="sm:hidden flex justify-end" style={{ padding: '4px 8px' }}>
              <div className="segmented-picker" style={{ margin: 0 }}>
                <button
                  type="button"
                  data-active={mobileMode === 'total' ? 'true' : 'false'}
                  onClick={() => setMobileMode('total')}
                >
                  Total
                </button>
                <button
                  type="button"
                  data-active={mobileMode === 'serving' ? 'true' : 'false'}
                  onClick={() => setMobileMode('serving')}
                >
                  Serving
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="unified-nutrition-cell--header text-right" style={{ paddingRight: 14 }}>Value</div>
        )}
      </div>
      <div>
        {NUTRIENT_ROWS.map(({ label: rowLabel, key, unit, color, indent }) => {
          const totalVal = total[key]
          const perServingVal = perServing[key]

          const format = (val: number) => {
            return key === 'sodium_mg'
              ? Math.round(val)
              : key === 'calories'
                ? Math.round(val)
                : val.toFixed(1)
          }

          return (
            <div key={key} className={`unified-nutrition-row ${is3Col ? 'unified-nutrition-row--3col' : ''}`}>
              <div className="unified-nutrition-cell" style={{ paddingLeft: indent ? 24 : 14, color: indent ? 'var(--fg-quiet)' : 'var(--fg-secondary)' }}>
                {rowLabel}
              </div>
              {is3Col ? (
                <>
                  <div
                    className={`unified-nutrition-cell unified-nutrition-cell--value text-right sm:block ${mobileMode === 'total' ? 'block' : 'hidden'}`}
                    style={{ color: color ?? 'var(--fg-primary)' }}
                  >
                    {format(totalVal)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--fg-tertiary)' }}>{unit}</span>
                  </div>
                  <div
                    className={`unified-nutrition-cell unified-nutrition-cell--value text-right sm:block ${mobileMode === 'serving' ? 'block' : 'hidden'}`}
                    style={{ color: color ?? 'var(--fg-primary)', paddingRight: 14 }}
                  >
                    {format(perServingVal)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--fg-tertiary)' }}>{unit}</span>
                  </div>
                </>
              ) : (
                <div
                  className="unified-nutrition-cell unified-nutrition-cell--value text-right"
                  style={{ color: color ?? 'var(--fg-primary)', paddingRight: 14 }}
                >
                  {format(totalVal)} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--fg-tertiary)' }}>{unit}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const LB_IN_G = 453.592
const OZ_IN_G = 28.3495

function formatWeight(g: number): string {
  if (g >= LB_IN_G) return `${Math.round(g)} g · ${(g / LB_IN_G).toFixed(2)} lb`
  return `${Math.round(g)} g · ${(g / OZ_IN_G).toFixed(1)} oz`
}

// Batch planner: treat each ingredient's weight as one portion, anchor the
// batch to however much of one ingredient you have, and scale the rest to match.
function BatchPlanner({ items, total }: { items: DraftItem[]; total: NutrientTotals }) {
  const [portions, setPortions] = useState(6)

  const batchTotals = scaleByRatio(total, portions)

  return (
    <div className="glass-inset" style={{ padding: '16px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10, marginBottom: 3 }}>Batch planner</div>
          <div style={{ fontSize: 12, color: 'var(--fg-quiet)', lineHeight: 1.5 }}>
            Specify the number of portions you want to prepare. Luma calculates how much of each ingredient you need to buy or measure.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setPortions((p) => Math.max(1, p - 1))}
            style={{
              width: 30, height: 30, borderRadius: 8, fontSize: 16,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              color: 'var(--fg-primary)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Decrease portions"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={1000}
            value={portions}
            onChange={(e) => setPortions(Math.max(1, parseInt(e.target.value) || 1))}
            className="field-input num"
            style={{
              width: 52, textAlign: 'center', borderRadius: 8, padding: '5px 4px',
              fontSize: 16, fontWeight: 700, border: '1px solid var(--glass-edge)',
              color: 'var(--sky-400)', fontFamily: 'var(--font-mono)',
            }}
          />
          <button
            type="button"
            onClick={() => setPortions((p) => Math.min(1000, p + 1))}
            style={{
              width: 30, height: 30, borderRadius: 8, fontSize: 16,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              color: 'var(--fg-primary)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
            aria-label="Increase portions"
          >
            +
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 4 }}>Shopping / prep amounts</div>
        {items.map((it, i) => {
          const singlePortionG = it.base_weight_g ?? it.estimated_weight_g
          const totalWeightG = singlePortionG * portions

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                fontSize: 13,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'var(--glass-1)',
                border: '1px solid var(--glass-edge)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 500, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                  Portion size: <span className="num">{formatWeight(singlePortionG)}</span>
                </span>
              </div>
              <span className="num" style={{ fontWeight: 700, color: 'var(--sky-400)', fontSize: 14, flexShrink: 0 }}>
                {formatWeight(totalWeightG)}
              </span>
            </div>
          )
        })}
      </div>

      <UnifiedNutritionPanel
        total={batchTotals}
        perServing={total}
        servings={portions}
        label={`BATCH TOTAL (${portions} portions)`}
      />

      {/* Shopping Checklist Card */}
      <div className="glass-inset" style={{ padding: '16px', borderRadius: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="eyebrow" style={{ fontSize: 10 }}>Shopping Checklist</span>
          <button
            type="button"
            className="btn"
            style={{ padding: '6px 12px', fontSize: 11, height: 'auto', borderRadius: 8 }}
            onClick={() => {
              const text = items
                .map((it) => {
                  const singleG = it.base_weight_g ?? it.estimated_weight_g
                  const totalG = singleG * portions
                  return `[ ] ${it.name}: ${formatWeight(totalG)}`
                })
                .join('\n')
              navigator.clipboard.writeText(text)
            }}
          >
            Copy list
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((it, i) => {
            const singleG = it.base_weight_g ?? it.estimated_weight_g
            const totalG = singleG * portions
            return (
              <label
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  cursor: 'pointer',
                  color: 'var(--fg-secondary)',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: 'var(--sky-400)',
                    cursor: 'pointer',
                  }}
                />
                <span>
                  <strong>{formatWeight(totalG)}</strong> of {it.name}
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CalculatorTab() {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<DraftItem[]>([])
  const [servings, setServings] = useState(1)
  const [mealName, setMealName] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [mode, setMode] = useState<'portions' | 'batch'>('portions')

  const total = useMemo(() => sumNutrients(items), [items])
  const perServing = useMemo(() => divideNutrients(total, servings), [total, servings])
  const totalWeightG = useMemo(
    () => items.reduce((sum, it) => sum + (it.estimated_weight_g || 0), 0),
    [items],
  )
  const perServingWeightG = servings > 0 ? totalWeightG / servings : 0
  const hasItems = items.length > 0

  const { data: favoritesData } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites', 'frequency'],
    queryFn: () => api.get('/favorites?sort=frequency'),
    staleTime: 30_000,
  })
  const favorites = favoritesData?.favorites ?? []

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/favorites', {
        name: mealName.trim() || 'Calculator meal',
        items: items.map((item) => ({
          food_name: item.name,
          brand: item.brand ?? null,
          quantity_g: item.estimated_weight_g,
          nutrients: item.nutrients,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    },
  })

  function addItem(item: DraftItem) { setItems((prev) => [...prev, item]) }
  function removeItem(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)) }
  function updateWeight(index: number, newWeight: number) {
    setItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }
      const ratio = newWeight / item.estimated_weight_g
      item.estimated_weight_g = newWeight
      item.nutrients = scaleByRatio(item.nutrients, ratio)
      updated[index] = item
      return updated
    })
  }
  function updateName(index: number, name: string) {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], name }
      return updated
    })
  }

  return (
    <div style={{ paddingTop: 0, paddingBottom: 60 }}>
      <div className={hasItems ? 'calculator-grid' : ''}>
        
        {/* Left Column / Builder */}
        <div className={hasItems ? 'calculator-left-col' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <IngredientBuilder
            draftItems={items}
            onAddItem={addItem}
            onRemoveItem={removeItem}
            onUpdateWeight={updateWeight}
            onUpdateName={updateName}
            emptyStateMessage="Search above to add ingredients. No logging — just numbers."
            favorites={favorites}
            onPickFavorite={(favItems, name) => {
              setItems((prev) => [...prev, ...favItems])
              setMealName((p) => (p.trim() ? p : name))
            }}
            servings={mode === 'portions' ? servings : undefined}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 6, fontSize: 10 }}>Meal name (optional)</div>
              <input
                type="text"
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                placeholder="e.g. Chicken meal prep"
                className="field-input"
                style={{
                  width: '100%', borderRadius: 10, padding: '9px 12px',
                  fontSize: 13, border: '1px solid var(--glass-edge)',
                  color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)',
                }}
              />
            </div>
            {hasItems && (
              <button
                onClick={() => { setItems([]); setMealName(''); setServings(1) }}
                style={{
                  padding: '9px 12px', borderRadius: 10, fontSize: 12,
                  background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                  color: 'var(--fg-quiet)', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 5, flexShrink: 0,
                  marginBottom: 0,
                }}
                title="Clear all"
              >
                <RotateCcw size={13} strokeWidth={1.75} />
                Clear
              </button>
            )}
          </div>

          {hasItems && (
            <div className="segmented-picker" style={{ width: '100%', marginBottom: 0 }}>
              <button
                type="button"
                data-active={mode === 'portions' ? 'true' : 'false'}
                onClick={() => setMode('portions')}
              >
                Recipe / Portions
              </button>
              <button
                type="button"
                data-active={mode === 'batch' ? 'true' : 'false'}
                onClick={() => setMode('batch')}
              >
                Batch / Bulk Planner
              </button>
            </div>
          )}
        </div>

        {/* Right Column / Sticky Results */}
        {hasItems && (
          <div className="calculator-sticky-right">
            {mode === 'portions' ? (
              <>
                <div className="glass-inset" style={{ padding: '14px 16px', borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div className="eyebrow" style={{ fontSize: 10, marginBottom: 3 }}>Servings / portions</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>
                        How many servings does this recipe make?
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => setServings((s) => Math.max(1, s - 1))}
                        style={{
                          width: 30, height: 30, borderRadius: 8, fontSize: 16,
                          background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                          color: 'var(--fg-primary)', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-label="Decrease servings"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={servings}
                        onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                        className="field-input num"
                        style={{
                          width: 52, textAlign: 'center', borderRadius: 8, padding: '5px 4px',
                          fontSize: 16, fontWeight: 700, border: '1px solid var(--glass-edge)',
                          color: 'var(--sky-400)', fontFamily: 'var(--font-mono)',
                        }}
                      />
                      <button
                        onClick={() => setServings((s) => Math.min(100, s + 1))}
                        style={{
                          width: 30, height: 30, borderRadius: 8, fontSize: 16,
                          background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                          color: 'var(--fg-primary)', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-label="Increase servings"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {totalWeightG > 0 && (
                    <div style={{
                      marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-edge)',
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
                    }}>
                      <span className="eyebrow" style={{ fontSize: 10 }}>
                        {servings > 1 ? 'Weigh out per serving' : 'Total weight'}
                      </span>
                      <span className="num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--sky-400)' }}>
                        {formatWeight(perServingWeightG)}
                      </span>
                    </div>
                  )}
                </div>

                <UnifiedNutritionPanel
                  total={total}
                  perServing={perServing}
                  servings={servings}
                  label="NUTRITION BREAKDOWN"
                />

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending || saveSuccess}
                    className="btn btn-primary"
                    style={{
                      width: '100%', padding: '11px', fontSize: 13, justifyContent: 'center',
                      gap: 7, opacity: saveMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    {saveSuccess
                      ? <><Check size={14} /> Saved to favorites</>
                      : saveMutation.isPending
                        ? 'Saving…'
                        : <><Heart size={14} strokeWidth={2} /> Save as favorite</>
                    }
                  </button>
                </div>
              </>
            ) : (
              <BatchPlanner items={items} total={total} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ── Main Meals route ──────────────────────────────────────────────────────────

type TabKey = 'foods' | 'plan' | 'journal' | 'calculator' | 'recipes'

export default function MealsRoute() {
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab: TabKey = (() => {
    const t = searchParams.get('tab')
    if (t === 'plan' || t === 'journal' || t === 'calculator' || t === 'recipes') return t
    return 'foods'
  })()

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  // Journal prefill from URL (mealId + mealName passed from Today nudge)
  const prefillMealId = searchParams.get('mealId')
  const prefillMealName = searchParams.get('mealName')
  const prefillLoggedAt = searchParams.get('loggedAt')
  const prefillSlot = searchParams.get('slot')

  const journalPrefill: PendingMeal | null =
    prefillMealId && prefillMealName
      ? { meal_event_id: prefillMealId, meal_name: prefillMealName, logged_at: prefillLoggedAt ?? new Date().toISOString(), slot: prefillSlot ?? 'meal' }
      : null

  function switchTab(tab: TabKey) {
    setActiveTab(tab)
    setSearchParams(tab === 'foods' ? {} : { tab }, { replace: true })
  }

  return (
    <div className="meals-page thin-scroll">
      {/* Page header */}
      <header style={{ marginBottom: 24 }}>
        <h1 style={{
          margin: '0 0 6px', fontSize: 32, fontWeight: 400,
          letterSpacing: '-0.02em', color: 'var(--fg-primary)',
        }}>
          Your{' '}
          <span
            className="serif-italic gradient-accent-text"
            style={{ background: 'var(--accent-gradient-hero)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >
            meal database.
          </span>
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
          Browse food groups by saturated fat · search the full database · plan your week · calculate portions.
        </p>
      </header>

      {/* Tab bar */}
      <div className="settings-tabs" role="tablist">
        {([
          { key: 'foods',      label: 'Foods'      },
          { key: 'plan',       label: 'Plan'       },
          { key: 'journal',    label: 'Journal'    },
          { key: 'calculator', label: 'Calculator' },
          { key: 'recipes',    label: 'Recipes'    },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className="settings-tab"
            onClick={() => switchTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'foods' && <FoodsTab />}
      {activeTab === 'plan' && <PlanRoute />}
      {activeTab === 'journal' && (
        <JournalTab openWithPrefill={journalPrefill} />
      )}
      {activeTab === 'calculator' && <CalculatorTab />}
      {activeTab === 'recipes' && <RecipesRoute />}
    </div>
  )
}
