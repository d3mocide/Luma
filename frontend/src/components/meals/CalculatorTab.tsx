import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Heart, Check } from 'lucide-react'
import { api } from '../../lib/api'
import { IngredientBuilder } from '../log-sheet/IngredientBuilder'
import type { DraftItem, Favorite } from '../log-sheet/types'
import { scaleByRatio, sumNutrients as sumNutrientList } from '../../lib/nutrients'

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
    setMobileMode(servings > 1 ? 'serving' : 'total') // eslint-disable-line react-hooks/set-state-in-effect
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

export function CalculatorTab() {
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
