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
        <style dangerouslySetInnerHTML={{ __html: `
          .luma-browser-input {
            width: 100%;
            box-sizing: border-box;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid var(--glass-edge);
            border-radius: 12px;
            color: var(--fg-primary);
            font-family: var(--font-sans);
            font-size: 14px;
            outline: none;
            transition: all 0.2s ease-in-out;
          }
          .luma-browser-input:focus {
            border-color: var(--sky-400) !important;
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2) !important;
            background: rgba(0, 0, 0, 0.35) !important;
          }
          .luma-browser-input::placeholder {
            color: var(--fg-quiet) !important;
          }

          [data-theme="light"] .luma-browser-input {
            background: rgba(255, 255, 255, 0.82) !important;
            border-color: rgba(15, 23, 42, 0.12) !important;
            color: var(--fg-primary) !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
          }
          [data-theme="light"] .luma-browser-input:focus {
            border-color: var(--sky-500) !important;
            box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12) !important;
            background: rgba(255, 255, 255, 0.95) !important;
          }
          [data-theme="light"] .luma-browser-input::placeholder {
            color: rgba(12, 20, 38, 0.36) !important;
          }

          .luma-serving-input {
            width: 70px;
            padding: 6px 10px;
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid var(--glass-edge);
            border-radius: 8px;
            color: var(--fg-primary);
            font-family: var(--font-mono);
            font-size: 13px;
            outline: none;
            text-align: right;
            transition: all 0.2s ease-in-out;
          }
          .luma-serving-input:focus {
            border-color: var(--sky-400) !important;
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2) !important;
            background: rgba(0, 0, 0, 0.35) !important;
          }
          [data-theme="light"] .luma-serving-input {
            background: rgba(255, 255, 255, 0.82) !important;
            border-color: rgba(15, 23, 42, 0.12) !important;
            color: var(--fg-primary) !important;
          }
          [data-theme="light"] .luma-serving-input:focus {
            border-color: var(--sky-500) !important;
            box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12) !important;
            background: rgba(255, 255, 255, 0.95) !important;
          }

          .food-result-row {
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .food-result-row:hover {
            transform: translateY(-1px);
            background: var(--glass-2) !important;
            border-color: var(--glass-edge-strong) !important;
          }
          
          .serving-chip {
            transition: all 0.15s ease !important;
            cursor: pointer !important;
            background: var(--glass-1) !important;
            border: 1px solid var(--glass-edge) !important;
            color: var(--fg-secondary) !important;
          }
          .serving-chip:hover {
            background: var(--glass-2) !important;
            color: var(--fg-primary) !important;
          }
          .serving-chip.active {
            background: linear-gradient(180deg, var(--sky-400), var(--sky-500)) !important;
            color: #ffffff !important;
            font-weight: 600 !important;
            border-color: transparent !important;
            box-shadow: 0 4px 10px -2px rgba(14, 165, 233, 0.35) !important;
          }
        `}} />
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
                className="luma-browser-input"
                style={{
                  paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
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
                    className="glass-inset food-result-row"
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '1px solid var(--glass-edge)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--glass-1)',
                      marginBottom: 8,
                      width: '100%',
                    }}>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>{food.name}</div>
                      {food.brand && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 2 }}>{food.brand}</div>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sky-400)', fontFamily: 'var(--font-mono)', fontWeight: 500, textAlign: 'right', flexShrink: 0 }}>
                      {Math.round(food.nutrients_per_100g.calories ?? 0)} <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>cal</span>
                      <div style={{ fontSize: 9, color: 'var(--fg-quiet)', fontWeight: 400, marginTop: 2 }}>per 100g</div>
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
                <div className="glass-inset" style={{ padding: 16, borderRadius: 16, border: '1px solid var(--glass-edge-strong)', marginBottom: 16, background: 'var(--glass-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-primary)' }}>{selectedFood.name}</div>
                      {selectedFood.brand && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 2 }}>{selectedFood.brand}</div>}
                    </div>
                    <button onClick={() => setSelectedFood(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 4 }}>
                      <X size={14}/>
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: 12, color: 'var(--fg-secondary)', fontWeight: 500 }}>Serving size:</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" value={servingG} onChange={(e) => setServingG(e.target.value)} min={1}
                          className="luma-serving-input"
                        />
                        <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>g</span>
                      </div>
                    </div>
                    
                    {/* Preset Chips */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['50', '100', '150', '200', '300'].map((preset) => {
                        const active = servingG === preset
                        return (
                          <button
                            key={preset}
                            onClick={() => setServingG(preset)}
                            className={`serving-chip ${active ? 'active' : ''}`}
                            style={{
                              padding: '5px 12px',
                              borderRadius: 999,
                              background: 'var(--glass-1)',
                              border: '1px solid var(--glass-edge)',
                              color: 'var(--fg-secondary)',
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {preset}g
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {previewNutrition && (
                    <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 14 }}>
                      <div className="eyebrow" style={{ marginBottom: 10 }}>Preview Nutrition</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                          <div key={key} className="glass-inset" style={{ padding: '8px 10px', textAlign: 'center', background: 'rgba(0,0,0,0.1)' }}>
                            <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
                            <div className="num" style={{ fontSize: 13, fontWeight: 600, color }}>
                              {fmtNutr(previewNutrition[key], unit)}
                            </div>
                          </div>
                        ))}
                      </div>
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
