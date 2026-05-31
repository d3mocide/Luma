import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, Search } from 'lucide-react'
import { api, TodayData } from '../../lib/api'

export function round1(value: number) {
  return Math.round(value * 10) / 10
}

type FoodResult = {
  id: string
  name: string
  brand: string | null
  serving_size_g: number | null
  nutrients_per_100g: Record<string, number>
}

export type FoodAddPayload = {
  name: string
  serving_g: number
  nutrition: Record<string, number>
}

function BudgetStat({
  label,
  remaining,
  projected,
  unit,
  showProjected,
  noTarget,
}: {
  label: string
  remaining: number
  projected: number
  unit: string
  showProjected: boolean
  noTarget: boolean
}) {
  const over = showProjected && projected < 0
  return (
    <div className="glass-inset" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 20, color: over ? 'var(--bad)' : noTarget ? 'var(--fg-quiet)' : 'var(--fg-primary)' }}>
          {noTarget ? '—' : remaining}
        </span>
        {!noTarget && <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: over ? 'var(--bad)' : 'var(--fg-quiet)' }}>
        {noTarget
          ? 'no target set'
          : showProjected
            ? <>after add: <span className="num">{projected}</span> {unit}</>
            : 'remaining'}
      </div>
    </div>
  )
}

export function NutritionCalculatorCard({
  adherence,
  onAdd,
  isAdding,
  compact,
}: {
  adherence: TodayData['adherence_today']
  onAdd: (payload: FoodAddPayload) => void
  isAdding?: boolean
  compact?: boolean
}) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingG, setServingG] = useState('150')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(t)
  }, [query])

  const { data: results = [], isFetching } = useQuery<FoodResult[]>({
    queryKey: ['foods', 'search', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 2 && !selectedFood,
    staleTime: 60_000,
  })

  const grams = Math.max(1, Number(servingG) || 0)
  const factor = grams / 100
  const n = selectedFood?.nutrients_per_100g ?? {}

  const addCalories  = round1((n.calories         ?? 0) * factor)
  const addSatFat    = round1((n.saturated_fat_g   ?? 0) * factor)
  const addSolFiber  = round1((n.soluble_fiber_g   ?? 0) * factor)

  const calTarget  = adherence.calories.target ?? 0
  const calLogged  = adherence.calories.logged ?? 0
  const calRemain  = round1(calTarget - calLogged)
  const calProjected = round1(calRemain - addCalories)

  const satTarget  = adherence.sat_fat_g.target ?? 0
  const satLogged  = adherence.sat_fat_g.logged ?? 0
  const satRemain  = round1(satTarget - satLogged)
  const satProjected = round1(satRemain - addSatFat)

  const solTarget  = adherence.soluble_fiber_g.target ?? 0
  const solLogged  = adherence.soluble_fiber_g.logged ?? 0
  const solRemain  = round1(solTarget - solLogged)
  const solProjected = round1(solRemain - addSolFiber)

  const hasFood = selectedFood !== null
  const showResults = !selectedFood && debouncedQuery.length >= 2

  // Fit signal — only meaningful when goals are set and food is selected
  type FitSignal = 'fits' | 'tight' | 'over'
  let fitSignal: FitSignal | null = null
  if (hasFood && calTarget > 0) {
    if (calProjected < 0 || (satTarget > 0 && satProjected < 0)) {
      fitSignal = 'over'
    } else if (calProjected < calTarget * 0.08 || (satTarget > 0 && satProjected < satTarget * 0.08)) {
      fitSignal = 'tight'
    } else {
      fitSignal = 'fits'
    }
  }

  const fitColor = fitSignal === 'fits' ? 'var(--aurora-mint)' : fitSignal === 'tight' ? 'var(--sun-400)' : 'var(--bad)'
  const fitLabel = fitSignal === 'fits' ? '✓ Fits your budget' : fitSignal === 'tight' ? '⚠ Tight — close to limit' : '✗ Exceeds budget'

  const handleSelect = (food: FoodResult) => {
    setSelectedFood(food)
    setQuery(food.name)
    if (food.serving_size_g) setServingG(String(Math.round(food.serving_size_g)))
  }

  const handleClear = () => {
    setSelectedFood(null)
    setQuery('')
    setDebouncedQuery('')
  }

  const handleAdd = () => {
    if (!selectedFood) return
    const nutrition: Record<string, number> = {}
    for (const [k, v] of Object.entries(selectedFood.nutrients_per_100g)) {
      if (typeof v === 'number') nutrition[k] = round1(v * factor)
    }
    onAdd({ name: selectedFood.name, serving_g: grams, nutrition })
  }

  return (
    <div className="glass" style={{ padding: compact ? 18 : 24, marginTop: compact ? 14 : 0, marginBottom: compact ? 14 : 0 }}>
      <div style={{ marginBottom: 12 }}>
        <div className="eyebrow">Budget check</div>
        <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
          Will this fit?
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
        <BudgetStat label="Calories" remaining={calRemain} projected={calProjected} unit="kcal" showProjected={hasFood} noTarget={calTarget === 0} />
        <BudgetStat label="Sat fat"  remaining={satRemain} projected={satProjected} unit="g"    showProjected={hasFood} noTarget={satTarget === 0} />
        <BudgetStat label="Sol fiber" remaining={solRemain} projected={solProjected} unit="g"   showProjected={hasFood} noTarget={solTarget === 0} />
      </div>

      <div className="glass-inset" style={{ padding: compact ? 10 : 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.3fr 0.7fr', gap: 10 }}>

          {/* Food search */}
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Food
            </span>
            <div style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${selectedFood ? 'var(--sky-400)' : 'var(--glass-edge)'}`,
                background: 'var(--glass-1)',
              }}>
                <Search size={13} style={{ color: 'var(--fg-quiet)', flexShrink: 0 }} />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    if (selectedFood) setSelectedFood(null)
                  }}
                  placeholder="Search foods…"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--fg-primary)', fontSize: 13, minWidth: 0,
                  }}
                />
                {selectedFood && (
                  <button type="button" onClick={handleClear} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center' }}>
                    <X size={13} />
                  </button>
                )}
                {isFetching && !selectedFood && (
                  <span style={{ fontSize: 10, color: 'var(--fg-quiet)', flexShrink: 0 }}>…</span>
                )}
              </div>

              {/* Results list */}
              {showResults && results.length > 0 && (
                <div
                  className="glass-bright"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    marginTop: 4,
                    overflow: 'hidden',
                  }}
                >
                  {results.slice(0, 6).map((food) => (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => handleSelect(food)}
                      style={{
                        width: '100%', textAlign: 'left', background: 'none', border: 'none',
                        borderBottom: '1px solid var(--glass-edge)', padding: '9px 12px',
                        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {food.name}
                        </div>
                        {food.brand && (
                          <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 1 }}>{food.brand}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--fg-quiet)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                        {Math.round(food.nutrients_per_100g.calories ?? 0)} kcal
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {showResults && results.length === 0 && !isFetching && (
                <div
                  className="glass-bright"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    marginTop: 4,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: 'var(--fg-quiet)',
                  }}
                >
                  No results found.
                </div>
              )}
            </div>
          </label>

          {/* Serving */}
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Serving (g)
            </span>
            <input
              type="number"
              min={1}
              value={servingG}
              onChange={(e) => setServingG(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                color: 'var(--fg-primary)', fontSize: 13,
              }}
            />
          </label>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            {hasFood ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                  Adds <span className="num">{addCalories}</span> kcal · <span className="num">{addSatFat}</span>g sat fat · <span className="num">{addSolFiber}</span>g soluble fiber
                </div>
                {fitSignal && (
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 500, color: fitColor }}>
                    {fitLabel}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>
                Search for a food to check your budget.
              </div>
            )}
          </div>
          <button
            className="btn"
            onClick={handleAdd}
            disabled={!hasFood || !!isAdding}
            style={{ padding: '8px 12px', fontSize: 12, flexShrink: 0 }}
          >
            <Plus size={12} strokeWidth={2} /> {isAdding ? 'Adding…' : 'Add to log'}
          </button>
        </div>
      </div>
    </div>
  )
}
