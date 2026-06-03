import { useState } from 'react'
import { X, Check, Search, ChevronLeft, Utensils, Lock, Unlock, Sparkles, Heart } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type MealSlot, type FoodResult, SLOT_META, KEY_NUTRIENTS, fmtNutr, computeNutrition } from './types'

type FavoriteItem = {
  id: string
  food_name: string
  quantity_g: number
  nutrients: Record<string, number>
}

type Favorite = {
  id: string
  name: string
  items: FavoriteItem[]
}

function sumFavoriteNutrition(items: FavoriteItem[]): Record<string, number> {
  return items.reduce((acc, item) => {
    Object.entries(item.nutrients).forEach(([k, v]) => { acc[k] = (acc[k] ?? 0) + v })
    return acc
  }, {} as Record<string, number>)
}

type Props = {
  slot: MealSlot
  planId: string
  onClose: () => void
  onSlotUpdated: (updated: MealSlot) => void
}

type View = 'detail' | 'browse' | 'alternatives'

interface Alternative {
  name: string
  notes: string
  nutrients: Record<string, number>
}

export function SlotModal({ slot, planId, onClose, onSlotUpdated }: Props) {
  const queryClient = useQueryClient()
  const isEmpty = !slot.custom_name && !slot.food_id && !slot.recipe_id
  const [view, setView] = useState<View>(() => isEmpty ? 'browse' : 'detail')
  const [foodQuery, setFoodQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingG, setServingG] = useState('')
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [altLoading, setAltLoading] = useState(false)
  const [browseTab, setBrowseTab] = useState<'foods' | 'saved'>('foods')

  const openBrowser = () => {
    setView('browse')
    setSelectedFood(null)
    setFoodQuery('')
    setDebouncedQuery('')
    setServingG('')
    setBrowseTab('foods')
  }

  const openAlternatives = async () => {
    setView('alternatives')
    setAlternatives([])
    setAltLoading(true)
    try {
      const data = await api.post<{ alternatives: Alternative[] }>(`/plan/slot/${slot.id}/swap`, {})
      setAlternatives(data.alternatives ?? [])
    } catch {
      setAlternatives([])
    } finally {
      setAltLoading(false)
    }
  }

  const { data: foodResults, isFetching: foodSearching } = useQuery<FoodResult[]>({
    queryKey: ['foods', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: view === 'browse' && browseTab === 'foods' && debouncedQuery.length > 1,
    staleTime: 60_000,
  })

  const { data: favoritesData } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites'],
    queryFn: () => api.get('/favorites'),
    enabled: view === 'browse' && browseTab === 'saved',
    staleTime: 60_000,
  })
  const favorites = favoritesData?.favorites ?? []

  const useFromFavoriteMutation = useMutation({
    mutationFn: ({ name, nutrition }: { name: string; nutrition: Record<string, number> }) =>
      api.patch<MealSlot>(`/plan/slot/${slot.id}`, { custom_name: name, nutrition }),
    onSuccess: (updated) => {
      onSlotUpdated(updated)
      queryClient.invalidateQueries({ queryKey: ['plan'] })
      setView('detail')
    },
  })

  const logEatenMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/plan/${planId}/log-as-eaten/${slotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      onClose()
    },
  })

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => api.patch<MealSlot>(`/plan/slot/${slot.id}`, { locked }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['plan'] })
      onSlotUpdated(updated)
    },
  })

  const replaceMutation = useMutation({
    mutationFn: ({ slotId, foodId, serving }: { slotId: string; foodId: string; serving: number }) =>
      api.post<MealSlot>(`/plan/slot/${slotId}/replace`, { food_id: foodId, serving_g: serving }),
    onSuccess: (updated) => {
      onSlotUpdated(updated)
      setView('detail')
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
      <div className="glass thin-scroll" style={{ maxWidth: 520, width: '100%', padding: 28, borderRadius: 24, position: 'relative', maxHeight: '80vh', overflowY: 'auto' }}>
        <style dangerouslySetInnerHTML={{ __html: `
          .luma-browser-input {
            width: 100%; box-sizing: border-box;
            background: rgba(0,0,0,0.25); border: 1px solid var(--glass-edge);
            border-radius: 12px; color: var(--fg-primary);
            font-family: var(--font-sans); font-size: 14px; outline: none;
            transition: all 0.2s ease-in-out;
          }
          .luma-browser-input:focus {
            border-color: var(--sky-400) !important;
            box-shadow: 0 0 0 3px rgba(56,189,248,0.2) !important;
            background: rgba(0,0,0,0.35) !important;
          }
          .luma-browser-input::placeholder { color: var(--fg-quiet) !important; }
          [data-theme="light"] .luma-browser-input {
            background: rgba(255,255,255,0.82) !important;
            border-color: rgba(15,23,42,0.12) !important;
            color: var(--fg-primary) !important;
          }
          [data-theme="light"] .luma-browser-input:focus {
            border-color: var(--sky-500) !important;
            box-shadow: 0 0 0 3px rgba(14,165,233,0.12) !important;
            background: rgba(255,255,255,0.95) !important;
          }
          .luma-serving-input {
            width: 70px; padding: 6px 10px;
            background: rgba(0,0,0,0.25); border: 1px solid var(--glass-edge);
            border-radius: 8px; color: var(--fg-primary);
            font-family: var(--font-mono); font-size: 13px; outline: none;
            text-align: right; transition: all 0.2s ease-in-out;
          }
          .luma-serving-input:focus {
            border-color: var(--sky-400) !important;
            box-shadow: 0 0 0 3px rgba(56,189,248,0.2) !important;
          }
          [data-theme="light"] .luma-serving-input {
            background: rgba(255,255,255,0.82) !important;
            border-color: rgba(15,23,42,0.12) !important;
          }
          .food-result-row { transition: all 0.2s cubic-bezier(0.16,1,0.3,1) !important; }
          .food-result-row:hover { transform: translateY(-1px); background: var(--glass-2) !important; border-color: var(--glass-edge-strong) !important; }
          .serving-chip { transition: all 0.15s ease !important; cursor: pointer !important; background: var(--glass-1) !important; border: 1px solid var(--glass-edge) !important; color: var(--fg-secondary) !important; }
          .serving-chip:hover { background: var(--glass-2) !important; color: var(--fg-primary) !important; }
          .serving-chip.active { background: linear-gradient(180deg,var(--sky-400),var(--sky-500)) !important; color: #fff !important; font-weight: 600 !important; border-color: transparent !important; box-shadow: 0 4px 10px -2px rgba(14,165,233,0.35) !important; }
          .alt-card { transition: all 0.15s ease; border: 1px solid var(--glass-edge); border-radius: 14px; padding: 14px 16px; background: var(--glass-1); }
          .alt-card:hover { border-color: var(--sky-400); background: var(--glass-2); }
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

        {/* Detail view */}
        {view === 'detail' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{
                  display: 'inline-block', padding: '3px 10px',
                  background: `${slotMeta.color}18`, border: `1px solid ${slotMeta.color}33`,
                  borderRadius: 999, fontSize: 11, fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', color: slotMeta.color,
                }}>
                  {slot.slot}
                </span>
                {slot.locked && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: slotMeta.color, fontFamily: 'var(--font-mono)' }}>
                    <Lock size={10}/> pinned
                  </span>
                )}
              </div>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button className="btn" onClick={openBrowser} disabled={slot.locked}>
                  <Utensils size={13}/> Browse Foods
                </button>
                <button className="btn btn-primary"
                  onClick={() => logEatenMutation.mutate(slot.id)}
                  disabled={logEatenMutation.isPending}>
                  <Check size={13}/> {logEatenMutation.isPending ? 'Logging…' : 'Log as eaten'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  className="btn"
                  onClick={openAlternatives}
                  disabled={slot.locked}
                  style={{ gap: 6 }}
                >
                  <Sparkles size={13}/> Alternatives
                </button>
                <button
                  className="btn"
                  onClick={() => lockMutation.mutate(!slot.locked)}
                  disabled={lockMutation.isPending}
                  style={{ gap: 6, color: slot.locked ? 'var(--good)' : 'var(--fg-secondary)' }}
                >
                  {slot.locked ? <Lock size={13}/> : <Unlock size={13}/>}
                  {slot.locked ? 'Pinned' : 'Pin slot'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Browse foods view */}
        {view === 'browse' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button onClick={() => { setView('detail'); setSelectedFood(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center', padding: 4 }}>
                <ChevronLeft size={18}/>
              </button>
              <div>
                <div className="eyebrow">Replace Meal</div>
                <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{slot.custom_name}</div>
              </div>
            </div>

            {/* Tab toggle */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'var(--glass-1)', borderRadius: 12, padding: 4 }}>
              {(['foods', 'saved'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setBrowseTab(tab); setSelectedFood(null) }}
                  style={{
                    flex: 1, padding: '7px 10px', borderRadius: 9, fontSize: 12, fontWeight: 500,
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    background: browseTab === tab ? 'var(--glass-3)' : 'transparent',
                    color: browseTab === tab ? 'var(--fg-primary)' : 'var(--fg-quiet)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab === 'foods' ? <Search size={12}/> : <Heart size={12}/>}
                  {tab === 'foods' ? 'Foods' : 'Saved meals'}
                </button>
              ))}
            </div>

            {browseTab === 'foods' && (
              <>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-quiet)' }}/>
                  <input
                    autoFocus
                    value={foodQuery}
                    onChange={(e) => { setFoodQuery(e.target.value); setDebouncedQuery(e.target.value); setSelectedFood(null) }}
                    placeholder="Search foods…"
                    className="luma-browser-input"
                    style={{ paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10 }}
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
                        style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--glass-edge)', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-1)', marginBottom: 8, width: '100%' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>{food.name}</span>
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
                          {food.brand && food.brand !== 'USDA Reference' && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 2 }}>{food.brand}</div>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sky-400)', fontFamily: 'var(--font-mono)', fontWeight: 500, textAlign: 'right', flexShrink: 0 }}>
                          {Math.round(food.nutrients_per_100g.calories ?? 0)} <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>cal</span>
                          <div style={{ fontSize: 9, color: 'var(--fg-quiet)', fontWeight: 400, marginTop: 2 }}>per 100g</div>
                        </div>
                      </button>
                    ))}
                    {debouncedQuery.length <= 1 && (
                      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>Type to search the food database</div>
                    )}
                  </div>
                )}
              </>
            )}

            {browseTab === 'saved' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {favorites.length === 0 && (
                  <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>
                    No saved meals yet. Save a meal from the log sheet to reuse it here.
                  </div>
                )}
                {favorites.map((fav) => {
                  const totalKcal = Math.round(fav.items.reduce((s, i) => s + (i.nutrients.calories ?? 0), 0))
                  const totalProtein = fav.items.reduce((s, i) => s + (i.nutrients.protein_g ?? 0), 0).toFixed(1)
                  return (
                    <button
                      key={fav.id}
                      disabled={useFromFavoriteMutation.isPending}
                      onClick={() => useFromFavoriteMutation.mutate({ name: fav.name, nutrition: sumFavoriteNutrition(fav.items) })}
                      className="glass-inset food-result-row"
                      style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--glass-edge)', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--glass-1)', width: '100%' }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500, marginBottom: 3 }}>{fav.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{fav.items.length} item{fav.items.length !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--sky-400)', fontFamily: 'var(--font-mono)', fontWeight: 500, textAlign: 'right', flexShrink: 0 }}>
                        {totalKcal} <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>kcal</span>
                        <div style={{ fontSize: 9, color: 'var(--fg-quiet)', fontWeight: 400, marginTop: 2 }}>{totalProtein}g protein</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {selectedFood && (
              <>
                <div className="glass-inset" style={{ padding: 16, borderRadius: 16, border: '1px solid var(--glass-edge-strong)', marginBottom: 16, background: 'var(--glass-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-primary)' }}>{selectedFood.name}</span>
                        {selectedFood.brand === 'USDA Reference' ? (
                          <span style={{
                            fontSize: 9, padding: '2px 8px', borderRadius: 20,
                            background: 'rgba(56,189,248,0.15)', color: 'var(--sky-400)',
                            border: '1px solid rgba(56,189,248,0.25)', fontWeight: 600,
                            fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                          }}>
                            USDA Reference
                          </span>
                        ) : selectedFood.source === 'user' ? (
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
                            {selectedFood.source === 'off' ? 'Open Food Facts' : 'USDA API'}
                          </span>
                        )}
                      </div>
                      {selectedFood.brand && selectedFood.brand !== 'USDA Reference' && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 2 }}>{selectedFood.brand}</div>}
                    </div>
                    <button onClick={() => setSelectedFood(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', padding: 4 }}>
                      <X size={14}/>
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ fontSize: 12, color: 'var(--fg-secondary)', fontWeight: 500 }}>Serving size:</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" value={servingG} onChange={(e) => setServingG(e.target.value)} min={1} className="luma-serving-input"/>
                        <span style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>g</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['50', '100', '150', '200', '300'].map((preset) => (
                        <button key={preset} onClick={() => setServingG(preset)}
                          className={`serving-chip ${servingG === preset ? 'active' : ''}`}
                          style={{ padding: '5px 12px', borderRadius: 999, background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', color: 'var(--fg-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                          {preset}g
                        </button>
                      ))}
                    </div>
                  </div>
                  {previewNutrition && (
                    <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 14 }}>
                      <div className="eyebrow" style={{ marginBottom: 10 }}>Preview Nutrition</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                          <div key={key} className="glass-inset" style={{ padding: '8px 10px', textAlign: 'center', background: 'rgba(0,0,0,0.1)' }}>
                            <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
                            <div className="num" style={{ fontSize: 13, fontWeight: 600, color }}>{fmtNutr(previewNutrition[key], unit)}</div>
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

        {/* Alternatives view */}
        {view === 'alternatives' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setView('detail')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center', padding: 4 }}>
                <ChevronLeft size={18}/>
              </button>
              <div>
                <div className="eyebrow">3 Alternatives</div>
                <div style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{slot.custom_name}</div>
              </div>
            </div>

            {altLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 0' }}>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite' }}/>
                <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>Luma is thinking…</span>
              </div>
            )}

            {!altLoading && alternatives.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--fg-quiet)', fontSize: 13 }}>
                Could not generate alternatives. Try again later.
              </div>
            )}

            {!altLoading && alternatives.map((alt, i) => (
              <div key={i} className="alt-card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 3 }}>{alt.name}</div>
                    {alt.notes && <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.4 }}>{alt.notes}</div>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
                  {KEY_NUTRIENTS.map(({ key, label, unit, color }) => (
                    <div key={key} style={{ textAlign: 'center', padding: '6px 4px', background: 'var(--glass-1)', borderRadius: 8 }}>
                      <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 2 }}>{label}</div>
                      <div className="num" style={{ fontSize: 12, fontWeight: 600, color }}>
                        {fmtNutr(alt.nutrients?.[key], unit)}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '8px 14px', fontSize: 12 }}
                  onClick={() => {
                    onSlotUpdated({
                      ...slot,
                      custom_name: alt.name,
                      notes: alt.notes ?? '',
                      nutrition: alt.nutrients ?? {},
                    })
                    onClose()
                  }}
                >
                  Use this meal
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
