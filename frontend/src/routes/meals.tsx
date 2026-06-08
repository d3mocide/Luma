import { useState, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Plus, BookOpen, ArrowLeft, BatteryLow, Battery, BatteryMedium, Zap, Flame, Frown, Meh, Smile, SmilePlus, Laugh, CircleDashed, Circle, CircleDot, Disc, CheckCircle2, RotateCcw, Heart, Check, ChevronDown, ChevronUp, Camera } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import { type FoodResult } from '../components/plan/types'
import { FOOD_CATEGORIES, SAT_FAT_COLORS, type FoodCategory } from '../lib/food-categories'
import { JournalDrawer, type PendingMeal } from '../components/journal/JournalDrawer'
import { IngredientBuilder } from '../components/log-sheet/IngredientBuilder'
import type { DraftItem } from '../components/log-sheet/types'
import { scaleByRatio, sumNutrients as sumNutrientList } from '../lib/nutrients'
import { unitToGrams } from '../lib/portions'
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


// ── Example food card (curated comparisons) ───────────────────────────────────

function ExampleFoodCard({ name, onClick }: { name: string; onClick: () => void }) {
  const { data: results, isLoading } = useQuery<FoodResult[]>({
    queryKey: ['foods', 'example', name],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(name)}`),
    staleTime: 5 * 60_000,
  })

  const food = results?.[0]

  if (isLoading) {
    return (
      <div className="glass" style={{ padding: '14px 16px', borderRadius: 14, height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 0.3; }
          }
        `}</style>
        <div style={{ width: '60%', height: 14, background: 'var(--bg-3)', borderRadius: 4, marginBottom: 12, animation: 'pulse 1.5s infinite ease-in-out' }} />
        <div style={{ width: '80%', height: 10, background: 'var(--bg-3)', borderRadius: 4, animation: 'pulse 1.5s infinite ease-in-out' }} />
      </div>
    )
  }

  if (!food) {
    return (
      <div className="glass" style={{ padding: '14px 16px', borderRadius: 14, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-quiet)', fontStyle: 'italic' }}>{name} (No data)</span>
      </div>
    )
  }

  const satFat = food.nutrients_per_100g?.saturated_fat_g ?? 0
  const calories = food.nutrients_per_100g?.calories ?? 0
  const protein = food.nutrients_per_100g?.protein_g ?? 0
  const fiber = food.nutrients_per_100g?.dietary_fiber_g ?? food.nutrients_per_100g?.soluble_fiber_g ?? 0

  return (
    <button
      onClick={onClick}
      className="glass-bright"
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        textAlign: 'left',
        cursor: 'pointer',
        border: '1px solid var(--glass-edge)',
        transition: 'border-color 150ms, background 150ms, transform 150ms',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--glass-edge-strong)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--glass-edge)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', width: '100%', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{food.name}</div>
        <div className="num" style={{ fontSize: 11, color: 'var(--fg-secondary)', flexShrink: 0 }}>{Math.round(calories)} kcal</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 2 }}>
            <span className="eyebrow" style={{ fontSize: 8 }}>Sat fat / 100g</span>
            <span className="num" style={{ fontWeight: 600, color: satFat < 3 ? 'var(--good)' : satFat < 8 ? 'var(--warn)' : 'var(--bad)' }}>{satFat.toFixed(1)}g</span>
          </div>
          <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min((satFat / 30) * 100, 100)}%`, background: satFat < 3 ? 'var(--good)' : satFat < 8 ? 'var(--warn)' : 'var(--bad)', borderRadius: 2 }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, borderTop: '1px solid var(--glass-edge)', paddingTop: 6, marginTop: 2 }}>
          <span style={{ color: 'var(--fg-tertiary)' }}>Protein: <span className="num" style={{ color: '#a78bfa', fontWeight: 600 }}>{protein.toFixed(1)}g</span></span>
          {fiber > 0 && (
            <span style={{ color: 'var(--fg-tertiary)' }}>Fiber: <span className="num" style={{ color: 'var(--sky-400)', fontWeight: 600 }}>{fiber.toFixed(1)}g</span></span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Category grid ─────────────────────────────────────────────────────────────

function CategoryGrid({
  onSelect,
}: {
  onSelect: (category: FoodCategory) => void
}) {
  return (
    <div className="food-category-grid">
      {FOOD_CATEGORIES.map((cat) => (
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

// ── Sat fat level indicator (inline bar) ──────────────────────────────────────

function SatFatBar({ value }: { value: number }) {
  // Scale: 0–30g maps to 0–100%, cap at 30g visually
  const pct = Math.min((value / 30) * 100, 100)
  const color = value < 3 ? 'var(--good)' : value < 8 ? 'var(--warn)' : 'var(--bad)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <span className="num" style={{ fontSize: 11, color, fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
        {value.toFixed(1)}g
      </span>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {results.map((food) => {
        const satFat = food.nutrients_per_100g?.saturated_fat_g ?? 0
        const calories = food.nutrients_per_100g?.calories ?? 0
        const protein = food.nutrients_per_100g?.protein_g ?? 0
        return (
          <div
            key={food.id}
            className="glass"
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--glass-edge)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>
                    {food.name}
                  </span>
                  {food.brand === 'USDA Reference' ? (
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 20,
                      background: 'rgba(56,189,248,0.15)', color: 'var(--sky-400)',
                      border: '1px solid rgba(56,189,248,0.25)', fontWeight: 600,
                      fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                    }}>
                      USDA Reference
                    </span>
                  ) : food.source === 'user' ? (
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 20,
                      background: 'rgba(167,139,250,0.15)', color: '#c084fc',
                      border: '1px solid rgba(167,139,250,0.25)', fontWeight: 600,
                      fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                    }}>
                      Custom
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 20,
                      background: 'rgba(255,255,255,0.06)', color: 'var(--fg-tertiary)',
                      border: '1px solid rgba(255,255,255,0.08)', fontWeight: 500,
                      fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                    }}>
                      {food.source === 'off' ? 'Open Food Facts' : 'USDA API'}
                    </span>
                  )}
                </div>
                {food.brand && food.brand !== 'USDA Reference' && (
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{food.brand}</div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{Math.round(calories)} kcal</div>
                <div style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>per 100g</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Sat fat / 100g</div>
                <SatFatBar value={satFat} />
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="eyebrow" style={{ fontSize: 9, marginBottom: 2 }}>Protein</div>
                <span className="num" style={{ fontSize: 11, color: '#a78bfa' }}>{protein.toFixed(1)}g</span>
              </div>
            </div>
          </div>
        )
      })}
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

function FoodsTab() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
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
    queryKey: ['foods', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const showResults = debouncedQuery.length > 1

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
            <div className="food-category-grid">
              {selectedCategory.examples.map((ex) => (
                <ExampleFoodCard
                  key={ex}
                  name={ex}
                  onClick={() => {
                    handleQueryChange(ex)
                    setSelectedCategory(null)
                    inputRef.current?.focus()
                  }}
                />
              ))}
            </div>
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
            <CategoryGrid onSelect={handleCategorySelect} />
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
  energy:    [BatteryLow, Battery, BatteryMedium, Zap, Flame],
  digestion: [Frown, Meh, Smile, SmilePlus, Laugh],
  mood:      [Frown, Meh, Smile, SmilePlus, Laugh],
  satiety:   [CircleDashed, Circle, CircleDot, Disc, CheckCircle2],
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
  { label: 'Carbohydrates', key: 'carbohydrates_g', unit: 'g' },
  { label: 'Total fat',     key: 'fat_g',           unit: 'g' },
  { label: 'Saturated fat', key: 'saturated_fat_g', unit: 'g',    indent: true },
  { label: 'Fiber',         key: 'fiber_g',         unit: 'g' },
  { label: 'Sodium',        key: 'sodium_mg',        unit: 'mg' },
]

function NutritionPanel({ totals, label }: { totals: NutrientTotals; label: string }) {
  return (
    <div className="glass-inset" style={{ borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--glass-edge)' }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>{label}</span>
      </div>
      <div>
        {NUTRIENT_ROWS.map(({ label: rowLabel, key, unit, color, indent }) => {
          const val = totals[key]
          const formatted = key === 'sodium_mg'
            ? Math.round(val)
            : key === 'calories'
              ? Math.round(val)
              : val.toFixed(1)
          return (
            <div
              key={key}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 14px', borderBottom: '1px solid var(--glass-edge)',
                paddingLeft: indent ? 26 : 14,
              }}
            >
              <span style={{ fontSize: 13, color: indent ? 'var(--fg-quiet)' : 'var(--fg-secondary)' }}>
                {rowLabel}
              </span>
              <span
                className="num"
                style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--fg-primary)' }}
              >
                {formatted} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--fg-tertiary)' }}>{unit}</span>
              </span>
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
  const [anchorIndex, setAnchorIndex] = useState(0)
  const [totalQty, setTotalQty] = useState('')
  const [totalUnit, setTotalUnit] = useState<'g' | 'oz' | 'lb'>('lb')

  const idx = anchorIndex < items.length ? anchorIndex : 0
  const anchor = items[idx]
  const anchorPerPortionG = anchor?.estimated_weight_g ?? 0
  const haveG = unitToGrams(parseFloat(totalQty) || 0, totalUnit)
  const portions = anchorPerPortionG > 0 ? Math.floor(haveG / anchorPerPortionG) : 0
  const leftoverG = portions > 0 ? haveG - portions * anchorPerPortionG : haveG
  const batchTotals = scaleByRatio(total, portions)

  const selectStyle = {
    borderRadius: 8, padding: '7px 8px', fontSize: 12,
    border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
    color: 'var(--fg-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
  } as const

  return (
    <div className="glass-inset" style={{ padding: '14px 16px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 3 }}>Batch planner</div>
        <div style={{ fontSize: 12, color: 'var(--fg-quiet)', lineHeight: 1.5 }}>
          Each ingredient's weight above is one portion. Pick what you're cooking around and enter how much you have — Luma scales the rest and tells you how many portions you'll get.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={idx} onChange={(e) => setAnchorIndex(Number(e.target.value))} style={{ ...selectStyle, flex: 1, minWidth: 120, maxWidth: 200 }}>
          {items.map((it, i) => (
            <option key={i} value={i} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>{it.name}</option>
          ))}
        </select>
        <input
          type="number" min={0} step="any" value={totalQty}
          onChange={(e) => setTotalQty(e.target.value)}
          placeholder="Amount"
          className="field-input num"
          style={{ width: 84, textAlign: 'center', borderRadius: 8, padding: '7px 6px', fontSize: 14, fontWeight: 700, border: '1px solid var(--glass-edge)', color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}
        />
        <select value={totalUnit} onChange={(e) => setTotalUnit(e.target.value as 'g' | 'oz' | 'lb')} style={selectStyle}>
          {(['lb', 'oz', 'g'] as const).map((u) => (
            <option key={u} value={u} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>{u}</option>
          ))}
        </select>
      </div>

      {haveG > 0 && anchorPerPortionG > 0 && (
        portions < 1 ? (
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
            Not enough for a full portion — one portion needs {formatWeight(anchorPerPortionG)}.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="num" style={{ fontSize: 28, fontWeight: 700, color: 'var(--sky-400)' }}>{portions}</span>
              <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>portions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="eyebrow" style={{ fontSize: 10 }}>Shopping / prep amounts</div>
              {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <span style={{ color: 'var(--fg-secondary)' }}>
                    {it.name}{i === idx ? ' (anchor)' : ''}
                  </span>
                  <span className="num" style={{ color: 'var(--fg-primary)' }}>{formatWeight(it.estimated_weight_g * portions)}</span>
                </div>
              ))}
            </div>
            {leftoverG > 1 && (
              <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                Leftover {anchor.name.toLowerCase()}: {formatWeight(leftoverG)}
              </div>
            )}
            <NutritionPanel totals={batchTotals} label={`BATCH TOTAL (${portions} portions)`} />
          </>
        )
      )}
    </div>
  )
}

function CalculatorTab() {
  const queryClient = useQueryClient()
  const [items, setItems] = useState<DraftItem[]>([])
  const [servings, setServings] = useState(1)
  const [mealName, setMealName] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [showPerServing, setShowPerServing] = useState(true)

  const total = useMemo(() => sumNutrients(items), [items])
  const perServing = useMemo(() => divideNutrients(total, servings), [total, servings])
  const hasItems = items.length > 0

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

  return (
    <div style={{ paddingTop: 0, paddingBottom: 60, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Ingredient builder */}
      <IngredientBuilder
        draftItems={items}
        onAddItem={addItem}
        onRemoveItem={removeItem}
        onUpdateWeight={updateWeight}
        emptyStateMessage="Search above to add ingredients. No logging — just numbers."
      />

      {/* Meal name + reset row */}
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

      {/* Servings + results — only shown when there are items */}
      {hasItems && (
        <>
          {/* Servings control */}
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
          </div>

          {/* Nutrition results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <NutritionPanel totals={total} label={`TOTAL RECIPE (${items.length} ingredient${items.length === 1 ? '' : 's'})`} />

            {servings > 1 && (
              <div>
                <button
                  onClick={() => setShowPerServing((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '4px 0 10px', color: 'var(--fg-secondary)',
                  }}
                >
                  <span className="eyebrow" style={{ fontSize: 10 }}>PER SERVING (÷ {servings})</span>
                  {showPerServing
                    ? <ChevronUp size={13} strokeWidth={2} style={{ color: 'var(--fg-quiet)' }} />
                    : <ChevronDown size={13} strokeWidth={2} style={{ color: 'var(--fg-quiet)' }} />
                  }
                </button>
                {showPerServing && (
                  <NutritionPanel totals={perServing} label={`PER SERVING (÷ ${servings})`} />
                )}
              </div>
            )}
          </div>

          {/* Batch planner */}
          <BatchPlanner items={items} total={total} />

          {/* Save as favorite */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || saveSuccess}
              className="btn btn-primary"
              style={{
                flex: 1, padding: '11px', fontSize: 13, justifyContent: 'center',
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
      )}
    </div>
  )
}

// ── Main Meals route ──────────────────────────────────────────────────────────

type TabKey = 'foods' | 'plan' | 'journal' | 'calculator' | 'recipes'

export default function MealsRoute() {
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab: TabKey = (() => {
    const t = searchParams.get('tab')
    if (t === 'foods' || t === 'journal' || t === 'calculator' || t === 'recipes') return t
    return 'plan'
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
    setSearchParams(tab === 'plan' ? {} : { tab }, { replace: true })
  }

  return (
    <div className="meals-page thin-scroll">
      {/* Page header */}
      <header style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>MEALS</div>
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
