import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shuffle, X, Check } from 'lucide-react'
import { api } from '../lib/api'

interface MealSlot {
  id: string
  slot_date: string
  slot: string
  custom_name: string
  notes: string
  recipe_id: string | null
}

interface PlanData {
  id: string
  week_start: string
  status: string
  slots: MealSlot[]
}

const SLOT_META: Record<string, { color: string; emoji: string; label: string }> = {
  breakfast: { color: '#fbbf24', emoji: '☀', label: 'Breakfast' },
  lunch:     { color: '#38bdf8', emoji: '🐟', label: 'Lunch' },
  snack:     { color: '#34d399', emoji: '🍎', label: 'Snack' },
  dinner:    { color: '#a78bfa', emoji: '🌿', label: 'Dinner' },
}

export default function PlanRoute() {
  const queryClient = useQueryClient()
  const [customConstraints, setCustomConstraints] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null)
  const [purchasedItems, setPurchasedItems] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping'>('calendar')

  const { data: plan, isLoading } = useQuery<PlanData>({
    queryKey: ['plan'],
    queryFn: () => api.get('/plan/current'),
    retry: false,
  })

  const { data: shoppingData } = useQuery<{ shopping_list: any[] }>({
    queryKey: ['shopping', plan?.id],
    queryFn: () => api.get(`/plan/${plan?.id}/shopping-list`),
    enabled: !!plan?.id,
  })

  const generateMutation = useMutation({
    mutationFn: (constraintsText: string) =>
      api.post('/plan/generate', {
        constraints: constraintsText ? { custom_request: constraintsText } : undefined,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['plan'] }); setCustomConstraints('') },
    onError: () => alert('Failed to generate meal plan. Make sure Anthropic API key is configured!'),
  })

  const swapMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/plan/slot/${slotId}/swap`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan'] }),
  })

  const logEatenMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/plan/${plan?.id}/log-as-eaten/${slotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      setSelectedSlot(null)
    },
  })

  const grouped = groupByDate(plan?.slots ?? [])
  const dates = Object.keys(grouped).sort()

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
            <span className="serif-italic" style={{
              background: 'linear-gradient(120deg, #fde68a, #38bdf8)',
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
              onClick={() => generateMutation.mutate(customConstraints)}>
              <Shuffle size={15}/> Regenerate
            </button>
            <div style={{
              display: 'flex',
              padding: 4,
              background: 'var(--glass-1)',
              border: '1px solid var(--glass-edge)',
              borderRadius: 999,
            }}>
              {(['calendar', 'shopping'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: activeTab === tab ? 'linear-gradient(180deg, #38bdf8, #0ea5e9)' : 'transparent',
                  color: activeTab === tab ? '#06121d' : 'var(--fg-tertiary)',
                  fontSize: 12, fontWeight: activeTab === tab ? 600 : 400,
                  fontFamily: 'var(--font-sans)',
                  transition: 'all 150ms ease-out',
                }}>
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
                  value={customConstraints}
                  onChange={(e) => setCustomConstraints(e.target.value)}
                  placeholder="e.g. Include salmon twice, vegetarian lunches, no dairy…"
                  rows={3}
                  style={{
                    width: '100%', resize: 'none',
                    background: 'rgba(0,0,0,0.3)',
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
            return (
              <div key={dateStr} className="glass" style={{
                padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                borderColor: today ? 'rgba(56,189,248,0.35)' : undefined,
                background: today ? 'linear-gradient(165deg, rgba(56,189,248,0.10), rgba(56,189,248,0.02))' : undefined,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div className="eyebrow" style={{ color: today ? 'var(--sky-300)' : undefined }}>
                      {new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', marginTop: 2, color: 'var(--fg-primary)' }}>
                      {new Date(dateStr).getDate()}
                    </div>
                  </div>
                  {today && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--sky-400)', boxShadow: '0 0 8px var(--sky-400)',
                    }}/>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {grouped[dateStr].map((slot, j) => {
                    const meta = SLOT_META[slot.slot] || { color: '#94a3b8', emoji: '🍽', label: slot.slot }
                    return (
                      <button
                        key={j}
                        onClick={() => setSelectedSlot(slot)}
                        className="glass-inset"
                        style={{
                          padding: '8px 10px', borderRadius: 10,
                          display: 'flex', flexDirection: 'column', gap: 4,
                          cursor: 'pointer', border: 'none', textAlign: 'left', width: '100%',
                          background: 'rgba(0,0,0,0.25)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 9, color: meta.color }}>{meta.emoji}</span>
                          <span style={{ fontSize: 9, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                            {slot.slot}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--fg-secondary)', lineHeight: 1.3 }}>
                          {slot.custom_name}
                        </div>
                      </button>
                    )
                  })}
                </div>
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
                shoppingData.shopping_list.map((item) => (
                  <div
                    key={item.food_id}
                    onClick={() => setPurchasedItems((p) => ({ ...p, [item.food_id]: !p[item.food_id] }))}
                    style={{
                      padding: '12px 0',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--glass-edge)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: `1px solid ${purchasedItems[item.food_id] ? 'var(--good)' : 'var(--glass-edge-strong)'}`,
                        background: purchasedItems[item.food_id] ? 'var(--good)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all 150ms',
                      }}>
                        {purchasedItems[item.food_id] && <Check size={11} color="#050811" strokeWidth={3}/>}
                      </div>
                      <div>
                        <div style={{
                          fontSize: 14, fontWeight: 500,
                          color: purchasedItems[item.food_id] ? 'var(--fg-quiet)' : 'var(--fg-primary)',
                          textDecoration: purchasedItems[item.food_id] ? 'line-through' : 'none',
                          transition: 'all 150ms',
                        }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{item.aisle || 'Grocery'}</div>
                      </div>
                    </div>
                    <span className="num" style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                ))
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
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5,8,17,0.7)',
          backdropFilter: 'blur(8px)',
          zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedSlot(null) }}>
          <div className="glass" style={{ maxWidth: 480, width: '100%', padding: 28, borderRadius: 24, position: 'relative' }}>
            <button
              onClick={() => setSelectedSlot(null)}
              style={{
                position: 'absolute', right: 16, top: 16,
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--glass-2)', border: '1px solid var(--glass-edge)',
                color: 'var(--fg-quiet)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={14}/>
            </button>

            <div style={{ marginBottom: 20 }}>
              <span style={{
                display: 'inline-block',
                padding: '3px 10px',
                background: `${(SLOT_META[selectedSlot.slot] || { color: '#94a3b8' }).color}18`,
                border: `1px solid ${(SLOT_META[selectedSlot.slot] || { color: '#94a3b8' }).color}33`,
                borderRadius: 999, fontSize: 11, fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: (SLOT_META[selectedSlot.slot] || { color: '#94a3b8' }).color,
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

            {/* Nutrition estimates */}
            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Estimated Nutrition</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { l: 'Calories', v: '350', c: 'var(--fg-primary)' },
                  { l: 'Sat Fat', v: '1.0g', c: 'var(--bad)' },
                  { l: 'Sol Fiber', v: '4.5g', c: 'var(--good)' },
                  { l: 'Protein', v: '15g', c: '#a78bfa' },
                ].map((n) => (
                  <div key={n.l} className="glass-inset" style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4 }}>{n.l}</div>
                    <div className="num" style={{ fontSize: 15, fontWeight: 500, color: n.c }}>{n.v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button
                className="btn"
                onClick={() => swapMutation.mutate(selectedSlot.id)}
                disabled={swapMutation.isPending}
              >
                <Shuffle size={13}/> {swapMutation.isPending ? 'Swapping…' : 'Swap'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => logEatenMutation.mutate(selectedSlot.id)}
                disabled={logEatenMutation.isPending}
              >
                <Check size={13}/> {logEatenMutation.isPending ? 'Logging…' : 'Log as eaten'}
              </button>
            </div>
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
