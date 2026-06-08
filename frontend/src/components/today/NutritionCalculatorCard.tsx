import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, Search, Camera } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { api, TodayData } from '../../lib/api'

const CALC_SCANNER_ID = 'calc-barcode-scanner'
const FOOD_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
]

function round1(value: number) {
  return Math.round(value * 10) / 10
}

type FoodResult = {
  id: string
  name: string
  brand: string | null
  serving_size_g: number | null
  nutrients_per_100g: Record<string, number>
  source?: string
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
  compact,
}: {
  label: string
  remaining: number
  projected: number
  unit: string
  showProjected: boolean
  noTarget: boolean
  compact?: boolean
}) {
  const over = showProjected && projected < 0
  return (
    <div className="glass-inset" style={{ padding: compact ? '10px 8px' : '10px 12px', textAlign: compact ? 'center' : 'left' }}>
      <div style={{ fontSize: compact ? 10.5 : 11.5, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ marginTop: compact ? 4 : 6, display: 'flex', alignItems: 'baseline', gap: compact ? 4 : 6, justifyContent: compact ? 'center' : 'flex-start' }}>
        <span className="num" style={{ fontSize: compact ? 18 : 20, color: over ? 'var(--bad)' : noTarget ? 'var(--fg-quiet)' : 'var(--fg-primary)' }}>
          {noTarget ? '—' : remaining}
        </span>
        {!noTarget && <span style={{ fontSize: compact ? 11 : 13, color: 'var(--fg-quiet)' }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 3, fontSize: compact ? 10.5 : 11.5, color: over ? 'var(--bad)' : 'var(--fg-quiet)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {noTarget
          ? compact ? 'no target' : 'no target set'
          : showProjected
            ? compact
              ? <>proj: <span className="num">{projected}</span></>
              : <>after add: <span className="num">{projected}</span> {unit}</>
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
  const [isScanning, setIsScanning] = useState(false)
  const [barcodeError, setBarcodeError] = useState('')
  const handleSelectRef = useRef<(food: FoodResult) => void>(() => {})

  const renderPresetChip = (preset: string) => {
    const active = servingG === preset
    return (
      <button
        key={preset}
        type="button"
        onClick={() => setServingG(preset)}
        className={`serving-chip ${active ? 'active' : ''}`}
        style={{
          padding: '4px 10px',
          borderRadius: 8,
          background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
          border: active ? '1px solid rgba(56,189,248,0.45)' : '1px solid var(--glass-edge)',
          color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
          fontSize: 10,
          fontWeight: active ? 600 : 400,
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          transition: 'all 120ms ease-out',
          outline: 'none',
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
            e.currentTarget.style.color = 'var(--fg-primary)'
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = 'var(--glass-1)'
            e.currentTarget.style.borderColor = 'var(--glass-edge)'
            e.currentTarget.style.color = 'var(--fg-secondary)'
          }
        }}
      >
        {preset}g
      </button>
    )
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!isScanning) return
    const scanner = new Html5Qrcode(CALC_SCANNER_ID, { formatsToSupport: FOOD_FORMATS, verbose: false })
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
          setIsScanning(false)
          setBarcodeError('')
          try {
            const food = await api.post<Record<string, unknown>>('/log/meal/barcode', { barcode: code })
            handleSelectRef.current({
              id: food.id as string,
              name: food.name as string,
              brand: (food.brand as string | null) ?? null,
              serving_size_g: (food.serving_size_g as number | null) ?? null,
              nutrients_per_100g: food.nutrients_per_100g as Record<string, number>,
              source: food.source as string | undefined,
            })
          } catch {
            setBarcodeError('Product not found')
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
  }, [isScanning])

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
  handleSelectRef.current = handleSelect

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
    <div className="glass" style={{
      padding: compact ? 18 : 24,
      marginTop: compact ? 14 : 0,
      marginBottom: compact ? 14 : 0,
      position: 'relative',
      zIndex: 5,
    }}>
      <div style={{ marginBottom: 12 }}>
        <div className="eyebrow">Budget check</div>
        <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
          Will this fit?
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: compact ? 8 : 10, marginBottom: 12 }}>
        <BudgetStat label="Calories" remaining={calRemain} projected={calProjected} unit="kcal" showProjected={hasFood} noTarget={calTarget === 0} compact={compact} />
        <BudgetStat label="Sat fat"  remaining={satRemain} projected={satProjected} unit="g"    showProjected={hasFood} noTarget={satTarget === 0} compact={compact} />
        <BudgetStat label="Sol fiber" remaining={solRemain} projected={solProjected} unit="g"   showProjected={hasFood} noTarget={solTarget === 0} compact={compact} />
      </div>

      <div className="glass-inset" style={{ padding: compact ? 10 : 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr auto', gap: 12, alignItems: 'start' }}>

          {/* Food search */}
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Food
            </span>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 8,
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
                  <Camera size={14} />
                  Scan
                </button>
              </div>
              {isScanning && (
                <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden' }}>
                  <div
                    id={CALC_SCANNER_ID}
                    className="w-full bg-black"
                    style={{ minHeight: 220, borderRadius: 12, overflow: 'hidden' }}
                  />
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--fg-quiet)', textAlign: 'center' }}>
                    Hold steady over the barcode
                  </p>
                </div>
              )}
              {barcodeError && !isScanning && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--bad)' }}>{barcodeError}</p>
              )}

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                          <span style={{ fontSize: 13, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {food.name}
                          </span>
                          {food.brand === 'USDA Reference' ? (
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 20,
                              background: 'rgba(56,189,248,0.15)', color: 'var(--sky-400)',
                              border: '1px solid rgba(56,189,248,0.25)', fontWeight: 600,
                              fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                            }}>
                              USDA Reference
                            </span>
                          ) : food.source === 'user' ? (
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 20,
                              background: 'rgba(167,139,250,0.15)', color: '#c084fc',
                              border: '1px solid rgba(167,139,250,0.25)', fontWeight: 600,
                              fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                            }}>
                              Custom
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 20,
                              background: 'rgba(255,255,255,0.06)', color: 'var(--fg-tertiary)',
                              border: '1px solid rgba(255,255,255,0.08)', fontWeight: 500,
                              fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                            }}>
                              {food.source === 'off' ? 'Open Food Facts' : 'USDA API'}
                            </span>
                          )}
                        </div>
                        {food.brand && food.brand !== 'USDA Reference' && (
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
          <div style={{ display: 'grid', gap: 6, width: compact ? '100%' : '275px' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Serving (g)
            </span>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
              <input
                type="number"
                min={1}
                value={servingG}
                onChange={(e) => setServingG(e.target.value)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                  color: 'var(--fg-primary)', fontSize: 13,
                  outline: 'none', transition: 'border-color 150ms',
                  minWidth: 0,
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(56,189,248,0.5)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--glass-edge)')}
              />
              <button
                className="btn"
                onClick={handleAdd}
                disabled={!selectedFood || !!isAdding}
                style={{
                  padding: '0 12px',
                  fontSize: 12,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  borderRadius: 10,
                }}
              >
                <Plus size={12} strokeWidth={2} /> {isAdding ? 'Adding…' : 'Add to log'}
              </button>
            </div>
            {/* Preset Chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {['25', '50', '75', '100', '150'].map(renderPresetChip)}
            </div>
          </div>
        </div>

        {/* Footer */}
        {(hasFood || !compact) && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--glass-edge)', paddingTop: 10 }}>
            {hasFood ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                  Adds <span className="num">{addCalories}</span> kcal · <span className="num">{addSatFat}</span>g sat fat · <span className="num">{addSolFiber}</span>g soluble fiber
                </div>
                {fitSignal && (
                  <div style={{ fontSize: 12, fontWeight: 500, color: fitColor }}>
                    {fitLabel}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>
                Search for a food to check your budget.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
