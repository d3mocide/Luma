import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Check, Search, ChevronLeft, Utensils, Shuffle } from 'lucide-react'
import { api } from '../lib/api'

interface MealSlot {
  id: string
  slot_date: string
  slot: string
  custom_name: string
  notes: string
  recipe_id: string | null
  food_id: string | null
  nutrition: Record<string, number>
}

interface PlanData {
  id: string
  week_start: string
  status: string
  slots: MealSlot[]
  day_totals: Record<string, Record<string, number>>
}

interface FoodResult {
  id: string
  name: string
  brand: string | null
  serving_size_g: number | null
  nutrients_per_100g: Record<string, number>
}

interface ShoppingItem {
  food_id: string
  name: string
  brand: string | null
  quantity: number
  unit: string
  aisle: string | null
  purchased: boolean
}

const SLOT_META: Record<string, { color: string; emoji: string }> = {
  breakfast: { color: '#fbbf24', emoji: '☀' },
  lunch:     { color: '#38bdf8', emoji: '🐟' },
  snack:     { color: '#34d399', emoji: '🍎' },
  dinner:    { color: '#a78bfa', emoji: '🌿' },
}

const KEY_NUTRIENTS = [
  { key: 'calories',        label: 'Cal',     unit: '',   color: 'var(--fg-primary)' },
  { key: 'saturated_fat_g', label: 'Sat Fat', unit: 'g',  color: 'var(--bad)' },
  { key: 'soluble_fiber_g', label: 'Sol Fib', unit: 'g',  color: 'var(--good)' },
  { key: 'protein_g',       label: 'Protein', unit: 'g',  color: '#a78bfa' },
]

function fmtNutr(val: number | undefined, unit: string, decimals = 1): string {
  if (val === undefined || val === null) return '—'
  const n = Number(val)
  if (isNaN(n)) return '—'
  return unit === '' ? String(Math.round(n)) : `${n.toFixed(decimals)}${unit}`
}

function computeNutrition(food: FoodResult, servingG: number): Record<string, number> {
  const factor = servingG / 100
  const out: Record<string, number> = {}
  for (const { key } of KEY_NUTRIENTS) {
    out[key] = Math.round((food.nutrients_per_100g[key] ?? 0) * factor * 10) / 10
  }
  return out
}

export default function PlanRoute() {
  const queryClient = useQueryClient()
  const [customConstraints, setCustomConstraints] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null)
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping'>('calendar')

  // Food browser state (lives inside the slot modal)
  const [browsing, setBrowsing] = useState(false)
  const [foodQuery, setFoodQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingG, setServingG] = useState('')

  // Shopping list: local purchased overrides for optimistic UX
  const [toggledItems, setToggledItems] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(foodQuery), 350)
    return () => clearTimeout(t)
  }, [foodQuery])

  // Reset browser state when modal closes
  function closeModal() {
    setSelectedSlot(null)
    setBrowsing(false)
    setSelectedFood(null)
    setFoodQuery('')
    setDebouncedQuery('')
    setServingG('')
  }

  function openBrowser() {
    setBrowsing(true)
    setSelectedFood(null)
    setFoodQuery('')
    setDebouncedQuery('')
    setServingG('')
  }

  const { data: plan, isLoading } = useQuery<PlanData>({
    queryKey: ['plan'],
    queryFn: () => api.get('/plan/current'),
    retry: false,
  })

  const { data: shoppingData } = useQuery<{ shopping_list: ShoppingItem[] }>({
    queryKey: ['shopping', plan?.id],
    queryFn: () => api.get(`/plan/${plan?.id}/shopping-list`),
    enabled: !!plan?.id,
  })

  // Reset purchase overrides when plan changes
  useEffect(() => { setToggledItems({}) }, [plan?.id])

  const { data: foodResults, isFetching: foodSearching } = useQuery<FoodResult[]>({
    queryKey: ['foods', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: browsing && debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const generateMutation = useMutation({
    mutationFn: (text: string) =>
      api.post('/plan/generate', { constraints: text ? { custom_request: text } : undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['plan'] }); setCustomConstraints('') },
    onError: () => alert('Failed to generate meal plan. Make sure your AI API key is configured.'),
  })

  const logEatenMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/plan/${plan?.id}/log-as-eaten/${slotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      closeModal()
    },
  })

  const replaceMutation = useMutation({
    mutationFn: ({ slotId, foodId, serving }: { slotId: string; foodId: string; serving: number }) =>
      api.post<MealSlot>(`/plan/slot/${slotId}/replace`, { food_id: foodId, serving_g: serving }),
    onSuccess: (updated) => {
      // Update the open modal with fresh data and refresh plan
      setSelectedSlot(updated)
      setBrowsing(false)
      setSelectedFood(null)
      setFoodQuery('')
      queryClient.invalidateQueries({ queryKey: ['plan'] })
    },
  })

  const togglePurchasedMutation = useMutation({
    mutationFn: ({ foodId, purchased }: { foodId: string; purchased: boolean }) =>
      api.patch(`/plan/${plan?.id}/shopping-list/${foodId}`, { purchased }),
  })

  const grouped = groupByDate(plan?.slots ?? [])
  const dates = Object.keys(grouped).sort()

  const parsedServing = parseFloat(servingG)
  const previewNutrition =
    selectedFood && !isNaN(parsedServing) && parsedServing > 0
      ? computeNutrition(selectedFood, parsedServing)
      : null

  return (
    <div className="thin-scroll" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div className="eyebrow">
            {plan ? `Week of ${formatWeek(plan.week_start)}` : 'Meal Plan'}
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your{' '}
            <span className="serif-italic gradient-accent-text" style={{
              background: 'var(--accent-gradient-hero)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>heart-healthy</span> week.
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
            Tuned for LDL reduction · <span className="num">18g</span> soluble fiber / day · <span className="num">&lt;12g</span> saturated fat
          </p>
        </div>
        {plan && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ padding: '10px 14px' }}
              onClick={() => generateMutation.mutate(customConstraints)}
              disabled={generateMutation.isPending}>
              <Shuffle size={15}/> {generateMutation.isPending ? 'Generating…' : 'Regenerate'}
            </button>
            <div className="plan-view-toggle">
              {(['calendar', 'shopping'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`plan-view-toggle-btn ${activeTab === tab ? 'active' : ''}`}>
                  {tab === 'calendar' ? 'Calendar' : 'Shopping'}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* No plan */}
      {!plan && !isLoading && (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="glass" style={{ padding: 40 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🥗</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>
                No Weekly Plan Active
              </h2>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--fg-tertiary)', lineHeight: 1.6 }}>
                Generate a personalized 7-day plan calculated for LDL reduction, dietary pattern targets, and soluble fiber intake.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Additional constraints (optional)</div>
                <textarea
                  className="field-input plan-constraints-input"
                  value={customConstraints}
                  onChange={(e) => setCustomConstraints(e.target.value)}
                  placeholder="e.g. Include salmon twice, vegetarian lunches, no dairy…"
                  rows={3}
                  style={{
                    width: '100%', resize: 'none',
                    border: '1px solid var(--glass-edge)',
                    borderRadius: 14, padding: '12px 14px',
                    color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '14px 20px', fontSize: 14, opacity: generateMutation.isPending ? 0.7 : 1 }}
                onClick={() => generateMutation.mutate(customConstraints)}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? 'Claude is orchestrating…' : 'Generate Personalized 7-Day Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8',
            animation: 'spin 0.8s linear infinite',
          }}/>
          <p style={{ fontSize: 12, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Loading meal planner…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Calendar view */}
      {plan && activeTab === 'calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
          {dates.map((dateStr) => {
            const today = dateStr === new Date().toISOString().slice(0, 10)
            const dayTotals = plan.day_totals?.[dateStr]
            return (
              <div key={dateStr} className={`glass plan-day-card ${today ? 'is-today' : ''}`}
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Date header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div className={`eyebrow plan-day-label ${today ? 'is-today' : ''}`}>
                      {new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', marginTop: 2, color: 'var(--fg-primary)' }}>
                      {new Date(dateStr).getDate()}
                    </div>
                  </div>
                  {today && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sky-400)', boxShadow: '0 0 8px var(--sky-400)' }}/>
                  )}
                </div>

                {/* Meal slots */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  {grouped[dateStr].map((slot, j) => {
                    const meta = SLOT_META[slot.slot] ?? { color: '#94a3b8', emoji: '🍽' }
                    return (
                      <button key={j} onClick={() => { setSelectedSlot(slot); setBrowsing(false) }}
                        className="glass-inset plan-slot-btn"
                        style={{ padding: '8px 10px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4,
                          cursor: 'pointer', border: 'none', textAlign: 'left', width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 9, color: meta.color }}>{meta.emoji}</span>
                          <span className="plan-slot-type" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                            {slot.slot}
                          </span>
                        </div>
                        <div className="plan-slot-name" style={{ fontSize: 11.5, lineHeight: 1.3 }}>
                          {slot.custom_name}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Day nutrition totals */}
                {dayTotals && (
                  <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>cal</span>
                      <span className="num" style={{ fontSize: 9, color: 'var(--fg-secondary)' }}>
                        {Math.round(dayTotals.calories ?? 0)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>sat fat</span>
                      <span className="num" style={{ fontSize: 9, color: 'var(--bad)' }}>
                        {(dayTotals.saturated_fat_g ?? 0).toFixed(1)}g
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>sol fib</span>
                      <span className="num" style={{ fontSize: 9, color: 'var(--good)' }}>
                        {(dayTotals.soluble_fiber_g ?? 0).toFixed(1)}g
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Shopping view */}
      {plan && activeTab === 'shopping' && (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div className="glass" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--glass-edge)' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 400, color: 'var(--fg-primary)' }}>Shopping List</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--fg-quiet)' }}>Auto-compiled from this week's plan</p>
              </div>
              <button className="btn" style={{ padding: '8px 14px', fontSize: 12 }}
                onClick={async () => {
                  const res: any = await api.post(`/plan/${plan.id}/shopping-list/export-reminders`)
                  alert(res.message || 'Exported!')
                }}>
                🍏 Export
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {shoppingData?.shopping_list?.length ? (
                shoppingData.shopping_list.map((item) => {
                  const purchased = toggledItems[item.food_id] !== undefined
                    ? toggledItems[item.food_id]
                    : item.purchased

                  return (
                    <div key={item.food_id}
                      onClick={() => {
                        const next = !purchased
                        setToggledItems((p) => ({ ...p, [item.food_id]: next }))
                        togglePurchasedMutation.mutate({ foodId: item.food_id, purchased: next })
                      }}
                      style={{
                        padding: '12px 0',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                        cursor: 'pointer', borderBottom: '1px solid var(--glass-edge)',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          border: `1px solid ${purchased ? 'var(--good)' : 'var(--glass-edge-strong)'}`,
                          background: purchased ? 'var(--good)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, transition: 'all 150ms',
                        }}>
                          {purchased && <Check size={11} color="#050811" strokeWidth={3}/>}
                        </div>
                        <div>
                          <div style={{
                            fontSize: 14, fontWeight: 500,
                            color: purchased ? 'var(--fg-quiet)' : 'var(--fg-primary)',
                            textDecoration: purchased ? 'line-through' : 'none',
                            transition: 'all 150ms',
                          }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{item.aisle || 'Grocery'}</div>
                        </div>
                      </div>
                      <span className="num" style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  )
                })
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-quiet)', fontSize: 13 }}>
                  No items in your shopping list yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slot modal */}
      {selectedSlot && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(5,8,17,0.7)',
            backdropFilter: 'blur(8px)',
            zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div className="glass" style={{ maxWidth: 520, width: '100%', padding: 28, borderRadius: 24, position: 'relative', maxHeight: '80vh', overflowY: 'auto' }}>
            <button onClick={closeModal} style={{
              position: 'absolute', right: 16, top: 16,
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--glass-2)', border: '1px solid var(--glass-edge)',
              color: 'var(--fg-quiet)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={14}/>
            </button>

            {!browsing ? (
              /* ── Detail view ── */
              <>
                <div style={{ marginBottom: 20 }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px',
                    background: `${(SLOT_META[selectedSlot.slot] ?? { color: '#94a3b8' }).color}18`,
                    border: `1px solid ${(SLOT_META[selectedSlot.slot] ?? { color: '#94a3b8' }).color}33`,
                    borderRadius: 999, fontSize: 11, fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: (SLOT_META[selectedSlot.slot] ?? { color: '#94a3b8' }).color,
                    marginBottom: 10,
                  }}>
                    {selectedSlot.slot}
                  </span>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>
                    {selectedSlot.custom_name}
                  </h3>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(selectedSlot.slot_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                </div>

                {selectedSlot.notes && (
                  <div className="glass-inset" style={{ padding: 14, marginBottom: 20 }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Notes</div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                      {selectedSlot.notes}
                    </p>
                  </div>
                )}

                {/* Nutrition */}
                <div style={{ marginBottom: 20 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>Nutrition</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                      <div key={key} className="glass-inset" style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
                        <div className="num" style={{ fontSize: 15, fontWeight: 500, color }}>
                          {fmtNutr(selectedSlot.nutrition?.[key], unit)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {!selectedSlot.nutrition || Object.keys(selectedSlot.nutrition).length === 0 ? (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
                      AI-estimated — replace with a food to get precise values
                    </p>
                  ) : null}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button className="btn" onClick={openBrowser}>
                    <Utensils size={13}/> Browse Foods
                  </button>
                  <button className="btn btn-primary"
                    onClick={() => logEatenMutation.mutate(selectedSlot.id)}
                    disabled={logEatenMutation.isPending}>
                    <Check size={13}/> {logEatenMutation.isPending ? 'Logging…' : 'Log as eaten'}
                  </button>
                </div>
              </>
            ) : (
              /* ── Food browser view ── */
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                  <button onClick={() => { setBrowsing(false); setSelectedFood(null) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center', padding: 4 }}>
                    <ChevronLeft size={18}/>
                  </button>
                  <div>
                    <div className="eyebrow">Replace Meal</div>
                    <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{selectedSlot.custom_name}</div>
                  </div>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)' }}/>
                  <input
                    autoFocus
                    value={foodQuery}
                    onChange={(e) => { setFoodQuery(e.target.value); setSelectedFood(null) }}
                    placeholder="Search foods…"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--glass-edge)',
                      borderRadius: 12, color: 'var(--fg-primary)',
                      fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
                    }}
                  />
                </div>

                {/* Results */}
                {!selectedFood && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16, maxHeight: 220, overflowY: 'auto' }}>
                    {foodSearching && (
                      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>Searching…</div>
                    )}
                    {!foodSearching && debouncedQuery.length > 1 && !foodResults?.length && (
                      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>No foods found.</div>
                    )}
                    {!foodSearching && foodResults?.map((food) => (
                      <button key={food.id}
                        onClick={() => { setSelectedFood(food); setServingG(String(food.serving_size_g ?? 100)) }}
                        className="glass-inset"
                        style={{
                          padding: '10px 14px', borderRadius: 10, border: 'none', textAlign: 'left',
                          cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>{food.name}</div>
                          {food.brand && <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{food.brand}</div>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', textAlign: 'right', flexShrink: 0 }}>
                          {Math.round(food.nutrients_per_100g.calories ?? 0)} cal<br/>per 100g
                        </div>
                      </button>
                    ))}
                    {debouncedQuery.length <= 1 && (
                      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>
                        Type to search the food database
                      </div>
                    )}
                  </div>
                )}

                {/* Selected food + serving */}
                {selectedFood && (
                  <>
                    <div className="glass-inset" style={{ padding: 14, marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>{selectedFood.name}</div>
                          {selectedFood.brand && <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{selectedFood.brand}</div>}
                        </div>
                        <button onClick={() => setSelectedFood(null)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 4 }}>
                          <X size={14}/>
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: 'var(--fg-quiet)', whiteSpace: 'nowrap' }}>Serving size:</label>
                        <input
                          type="number"
                          value={servingG}
                          onChange={(e) => setServingG(e.target.value)}
                          min={1}
                          style={{
                            width: 80, padding: '6px 10px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid var(--glass-edge)',
                            borderRadius: 8, color: 'var(--fg-primary)',
                            fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none', textAlign: 'right',
                          }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>g</span>
                      </div>

                      {/* Nutrition preview */}
                      {previewNutrition && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                          {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                            <div key={key} style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 2 }}>{label}</div>
                              <div className="num" style={{ fontSize: 13, color }}>{fmtNutr(previewNutrition[key], unit)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <button className="btn" onClick={() => setSelectedFood(null)}>
                        Cancel
                      </button>
                      <button className="btn btn-primary"
                        disabled={!previewNutrition || replaceMutation.isPending}
                        onClick={() => {
                          if (!previewNutrition) return
                          replaceMutation.mutate({
                            slotId: selectedSlot.id,
                            foodId: selectedFood.id,
                            serving: parsedServing,
                          })
                        }}>
                        {replaceMutation.isPending ? 'Saving…' : 'Confirm replacement'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function groupByDate(slots: MealSlot[]) {
  const out: Record<string, MealSlot[]> = {}
  slots.forEach((s) => {
    if (!out[s.slot_date]) out[s.slot_date] = []
    out[s.slot_date].push(s)
  })
  return out
}

function formatWeek(dateStr: string) {
  const d = new Date(dateStr)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
