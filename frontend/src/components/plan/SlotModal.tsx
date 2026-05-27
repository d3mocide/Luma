import { useState } from 'react'
import { X, Check, Search, ChevronLeft, Utensils } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type MealSlot, type FoodResult, SLOT_META, KEY_NUTRIENTS, fmtNutr, computeNutrition } from './types'

type Props = {
  slot: MealSlot
  planId: string
  onClose: () => void
  onSlotUpdated: (updated: MealSlot) => void
}

export function SlotModal({ slot, planId, onClose, onSlotUpdated }: Props) {
  const queryClient = useQueryClient()
  const [browsing, setBrowsing] = useState(false)
  const [foodQuery, setFoodQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingG, setServingG] = useState('')

  const openBrowser = () => {
    setBrowsing(true)
    setSelectedFood(null)
    setFoodQuery('')
    setDebouncedQuery('')
    setServingG('')
  }

  const { data: foodResults, isFetching: foodSearching } = useQuery<FoodResult[]>({
    queryKey: ['foods', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: browsing && debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const logEatenMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/plan/${planId}/log-as-eaten/${slotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      onClose()
    },
  })

  const replaceMutation = useMutation({
    mutationFn: ({ slotId, foodId, serving }: { slotId: string; foodId: string; serving: number }) =>
      api.post<MealSlot>(`/plan/slot/${slotId}/replace`, { food_id: foodId, serving_g: serving }),
    onSuccess: (updated) => {
      onSlotUpdated(updated)
      setBrowsing(false)
      setSelectedFood(null)
      setFoodQuery('')
      queryClient.invalidateQueries({ queryKey: ['plan'] })
    },
  })

  const parsedServing = parseFloat(servingG)
  const previewNutrition =
    selectedFood && !isNaN(parsedServing) && parsedServing > 0
      ? computeNutrition(selectedFood, parsedServing)
      : null

  const slotMeta = SLOT_META[slot.slot] ?? { color: '#94a3b8' }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(5,8,17,0.7)', backdropFilter: 'blur(8px)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass" style={{ maxWidth: 520, width: '100%', padding: 28, borderRadius: 24, position: 'relative', maxHeight: '80vh', overflowY: 'auto' }}>
        <button onClick={onClose} style={{
          position: 'absolute', right: 16, top: 16,
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--glass-2)', border: '1px solid var(--glass-edge)',
          color: 'var(--fg-quiet)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={14}/>
        </button>

        {!browsing ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <span style={{
                display: 'inline-block', padding: '3px 10px',
                background: `${slotMeta.color}18`, border: `1px solid ${slotMeta.color}33`,
                borderRadius: 999, fontSize: 11, fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase', letterSpacing: '0.08em', color: slotMeta.color, marginBottom: 10,
              }}>
                {slot.slot}
              </span>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>
                {slot.custom_name}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
                {new Date(slot.slot_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>

            {slot.notes && (
              <div className="glass-inset" style={{ padding: 14, marginBottom: 20 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Notes</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>{slot.notes}</p>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Nutrition</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                  <div key={key} className="glass-inset" style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
                    <div className="num" style={{ fontSize: 15, fontWeight: 500, color }}>
                      {fmtNutr(slot.nutrition?.[key], unit)}
                    </div>
                  </div>
                ))}
              </div>
              {!slot.nutrition || Object.keys(slot.nutrition).length === 0 ? (
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
                onClick={() => logEatenMutation.mutate(slot.id)}
                disabled={logEatenMutation.isPending}>
                <Check size={13}/> {logEatenMutation.isPending ? 'Logging…' : 'Log as eaten'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button onClick={() => { setBrowsing(false); setSelectedFood(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center', padding: 4 }}>
                <ChevronLeft size={18}/>
              </button>
              <div>
                <div className="eyebrow">Replace Meal</div>
                <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{slot.custom_name}</div>
              </div>
            </div>

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)' }}/>
              <input
                autoFocus
                value={foodQuery}
                onChange={(e) => { setFoodQuery(e.target.value); setDebouncedQuery(e.target.value); setSelectedFood(null) }}
                placeholder="Search foods…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
                  background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-edge)',
                  borderRadius: 12, color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none',
                }}
              />
            </div>

            {!selectedFood && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16, maxHeight: 220, overflowY: 'auto' }}>
                {foodSearching && <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>Searching…</div>}
                {!foodSearching && debouncedQuery.length > 1 && !foodResults?.length && (
                  <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>No foods found.</div>
                )}
                {!foodSearching && foodResults?.map((food) => (
                  <button key={food.id}
                    onClick={() => { setSelectedFood(food); setServingG(String(food.serving_size_g ?? 100)) }}
                    className="glass-inset"
                    style={{ padding: '10px 14px', borderRadius: 10, border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                    <input type="number" value={servingG} onChange={(e) => setServingG(e.target.value)} min={1}
                      style={{ width: 80, padding: '6px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-edge)', borderRadius: 8, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>g</span>
                  </div>
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
                  <button className="btn" onClick={() => setSelectedFood(null)}>Cancel</button>
                  <button className="btn btn-primary"
                    disabled={!previewNutrition || replaceMutation.isPending}
                    onClick={() => {
                      if (!previewNutrition) return
                      replaceMutation.mutate({ slotId: slot.id, foodId: selectedFood.id, serving: parsedServing })
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
  )
}
