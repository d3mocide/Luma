import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { api } from '../lib/api'
import { type FoodResult } from '../components/plan/types'
import { FOOD_CATEGORIES, SAT_FAT_COLORS, type FoodCategory } from '../lib/food-categories'
import PlanRoute from './plan'

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
    }}>
      {range}
      <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>/ 100g</span>
    </span>
  )
}

// ── Category grid ─────────────────────────────────────────────────────────────

function CategoryGrid({
  onSelect,
}: {
  onSelect: (category: FoodCategory) => void
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 12,
    }}>
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
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 2 }}>
                  {food.name}
                </div>
                {food.brand && (
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleQueryChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300)
  }

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const { data: searchResults, isFetching } = useQuery<FoodResult[]>({
    queryKey: ['foods', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const showResults = debouncedQuery.length > 1

  function handleCategorySelect(cat: FoodCategory) {
    handleQueryChange(cat.searchQuery)
    inputRef.current?.focus()
  }

  return (
    <div>
      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
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

      {showResults ? (
        <>
          <SatFatLegend />
          <div style={{ marginTop: 12 }}>
            <FoodSearchResults results={searchResults} isLoading={isFetching && !searchResults} />
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Food groups</div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-tertiary)' }}>
              Typical saturated fat per 100g. Click any group to search those foods.
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

// ── Main Foods route ──────────────────────────────────────────────────────────

export default function FoodsRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'plan' ? 'plan' : 'foods'
  const [activeTab, setActiveTab] = useState<'foods' | 'plan'>(initialTab)

  function switchTab(tab: 'foods' | 'plan') {
    setActiveTab(tab)
    if (tab === 'plan') {
      setSearchParams({ tab: 'plan' }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }

  return (
    <div style={{ padding: '24px 20px 80px', maxWidth: 960, margin: '0 auto' }}>
      {/* Page header */}
      <header style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>FOODS</div>
        <h1 style={{
          margin: '0 0 6px', fontSize: 32, fontWeight: 400,
          letterSpacing: '-0.02em', color: 'var(--fg-primary)',
        }}>
          Your{' '}
          <span
            className="serif-italic gradient-accent-text"
            style={{ background: 'var(--accent-gradient-hero)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >
            food database.
          </span>
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
          Browse food groups by saturated fat · search the full database · plan your week.
        </p>
      </header>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 24,
        background: 'var(--bg-3)', borderRadius: 10, padding: 3,
        width: 'fit-content',
      }}>
        {([
          { key: 'foods', label: 'Foods' },
          { key: 'plan', label: 'Plan' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            style={{
              padding: '7px 20px', borderRadius: 8,
              fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: activeTab === key ? 'var(--glass-1)' : 'transparent',
              color: activeTab === key ? 'var(--fg-primary)' : 'var(--fg-quiet)',
              boxShadow: activeTab === key ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              transition: 'all 150ms',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'foods' && <FoodsTab />}
      {activeTab === 'plan' && (
        <div style={{ margin: '0 -20px' }}>
          <PlanRoute />
        </div>
      )}
    </div>
  )
}
