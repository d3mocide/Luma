import { useState, useEffect } from 'react'
import { useUIStore } from '../stores'
import { api } from '../lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Heart } from 'lucide-react'
import { VoiceTab } from './log-sheet/VoiceTab'
import { BarcodeTab } from './log-sheet/BarcodeTab'
import { SearchTab } from './log-sheet/SearchTab'
import { PhotoTab } from './log-sheet/PhotoTab'
import { QuickTab } from './log-sheet/QuickTab'
import type { DraftItem, Favorite } from './log-sheet/types'
import { getCurrentSlot } from '../lib/format'

type LogSheetMode = 'sheet' | 'page'

type LogSheetProps = {
  mode?: LogSheetMode
  onClose?: () => void
}

export default function LogSheet({ mode = 'sheet', onClose }: LogSheetProps) {
  const isOpen = useUIStore((s) => s.logSheetOpen)
  const close = useUIStore((s) => s.closeLogSheet)
  const queryClient = useQueryClient()
  const isPageMode = mode === 'page'
  const isVisible = isPageMode || isOpen

  const handleClose = () => {
    setMealName('')
    if (isPageMode) { onClose?.(); return }
    close()
  }

  const pendingLogItems = useUIStore((s) => s.pendingLogItems)
  const clearPendingLogItems = useUIStore((s) => s.clearPendingLogItems)

  const [activeTab, setActiveTab] = useState<'quick' | 'voice' | 'barcode' | 'search' | 'photo'>('quick')
  const [slot, setSlot] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(getCurrentSlot)
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [transcription, setTranscription] = useState('')
  const [mealName, setMealName] = useState('')
  const [savingFav, setSavingFav] = useState(false)
  const [favName, setFavName] = useState('')

  const { data: favoritesData } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites'],
    queryFn: () => api.get('/favorites'),
    enabled: isVisible,
  })
  const favorites = favoritesData?.favorites ?? []

  useEffect(() => {
    if (pendingLogItems?.length) {
      setDraftItems(pendingLogItems)
      clearPendingLogItems()
    }
  }, [pendingLogItems, clearPendingLogItems])

  const addItems = (items: DraftItem[]) => setDraftItems((prev) => [...prev, ...items])
  const addItem = (item: DraftItem) => setDraftItems((prev) => [...prev, item])

  const removeItem = (index: number) => setDraftItems((prev) => prev.filter((_, i) => i !== index))

  const updateItemWeight = (index: number, newWeight: number) => {
    setDraftItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }
      const ratio = newWeight / item.estimated_weight_g
      item.estimated_weight_g = newWeight
      item.nutrients = {
        calories: item.nutrients.calories * ratio,
        saturated_fat_g: item.nutrients.saturated_fat_g * ratio,
        soluble_fiber_g: item.nutrients.soluble_fiber_g * ratio,
        protein_g: item.nutrients.protein_g * ratio,
        carbohydrates_g: item.nutrients.carbohydrates_g * ratio,
        fat_g: item.nutrients.fat_g * ratio,
        fiber_g: item.nutrients.fiber_g * ratio,
        sodium_mg: item.nutrients.sodium_mg * ratio,
      }
      updated[index] = item
      return updated
    })
  }

  const totals = draftItems.reduce(
    (acc, cur) => {
      const n = cur.nutrients
      return {
        calories: acc.calories + (n.calories || 0),
        saturated_fat_g: acc.saturated_fat_g + (n.saturated_fat_g || 0),
        soluble_fiber_g: acc.soluble_fiber_g + (n.soluble_fiber_g || 0),
        protein_g: acc.protein_g + (n.protein_g || 0),
        carbohydrates_g: acc.carbohydrates_g + (n.carbohydrates_g || 0),
        fat_g: acc.fat_g + (n.fat_g || 0),
        fiber_g: acc.fiber_g + (n.fiber_g || 0),
        sodium_mg: acc.sodium_mg + (n.sodium_mg || 0),
      }
    },
    { calories: 0, saturated_fat_g: 0, soluble_fiber_g: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 }
  )

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post('/log/meal', {
        slot,
        source: activeTab,
        items: draftItems,
        nutrition: totals,
        raw_input: mealName.trim() || transcription || 'Manual log',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      setDraftItems([])
      setTranscription('')
      setMealName('')
      handleClose()
    },
    onError: (err) => {
      console.error(err)
      alert('Failed to save meal log. Try again!')
    },
  })

  const favMutation = useMutation({
    mutationFn: () => api.post('/favorites', {
      name: favName.trim() || 'My favorite',
      items: draftItems.map((item) => ({
        food_name: item.name,
        brand: item.brand ?? null,
        quantity_g: item.estimated_weight_g,
        nutrients: item.nutrients,
      })),
    }),
    onSuccess: () => { setSavingFav(false); setFavName('') },
  })

  const logFavoriteDirect = useMutation({
    mutationFn: ({ items, name }: { items: DraftItem[]; name: string }) => {
      const nutrition = items.reduce(
        (acc, cur) => {
          const n = cur.nutrients
          return {
            calories: acc.calories + (n.calories || 0),
            saturated_fat_g: acc.saturated_fat_g + (n.saturated_fat_g || 0),
            soluble_fiber_g: acc.soluble_fiber_g + (n.soluble_fiber_g || 0),
            protein_g: acc.protein_g + (n.protein_g || 0),
            carbohydrates_g: acc.carbohydrates_g + (n.carbohydrates_g || 0),
            fat_g: acc.fat_g + (n.fat_g || 0),
            fiber_g: acc.fiber_g + (n.fiber_g || 0),
            sodium_mg: acc.sodium_mg + (n.sodium_mg || 0),
          }
        },
        { calories: 0, saturated_fat_g: 0, soluble_fiber_g: 0, protein_g: 0, carbohydrates_g: 0, fat_g: 0, fiber_g: 0, sodium_mg: 0 }
      )
      return api.post('/log/meal', { slot, source: 'favorite', items, nutrition, raw_input: name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      handleClose()
    },
    onError: () => { alert('Failed to log favorite. Try again!') },
  })

  if (!isVisible) return null

  const slotColors: Record<string, string> = {
    breakfast: 'var(--sun-400)', lunch: 'var(--sky-400)',
    dinner: 'var(--aurora-violet)', snack: 'var(--good)',
  }

  return (
    <div className="log-sheet-overlay" style={isPageMode ? {
      position: 'relative', inset: 'auto', background: 'transparent',
      backdropFilter: 'none', zIndex: 1, display: 'block', height: '100%',
    } : {
      position: 'fixed', inset: 0, background: 'rgba(5,8,17,0.75)',
      backdropFilter: 'blur(8px)', zIndex: 50,
      display: 'flex', justifyContent: 'flex-end', alignItems: 'stretch',
    }}>
      <div className="glass log-sheet-panel" style={{
        width: '100%', maxWidth: isPageMode ? 'none' : 480,
        background: 'linear-gradient(180deg, rgba(13,20,37,0.98), rgba(8,13,26,0.98))',
        borderLeft: isPageMode ? 'none' : '1px solid var(--glass-edge)',
        display: 'flex', flexDirection: 'column', height: '100%',
        boxShadow: isPageMode ? 'none' : '-20px 0 60px rgba(0,0,0,0.4)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="log-sheet-atmo" aria-hidden="true" />

        {/* Header */}
        <header className="log-sheet-header" style={{ padding: 'calc(env(safe-area-inset-top) + 18px) 20px 16px', borderBottom: '1px solid var(--glass-edge)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, position: 'relative', zIndex: 1 }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Meal logging</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>Add a food item</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--fg-tertiary)', maxWidth: '32ch' }}>
              Capture a meal quickly, then tune the portion or ingredient details before saving.
            </p>
          </div>
          <button onClick={handleClose} className="log-sheet-close btn btn-ghost" style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.22)', color: 'var(--bad)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 160ms ease-out, background 160ms ease-out' }}>
            <span className="log-sheet-close-icon" style={{ display: 'inline-flex', transition: 'transform 160ms ease-out' }}>
              <X size={14} strokeWidth={2} />
            </span>
          </button>
        </header>

        {/* Slot selector */}
        <div className="log-sheet-slotbar" style={{ padding: '14px 20px', borderBottom: '1px solid var(--glass-edge)', display: 'flex', gap: 8, overflowX: 'auto', position: 'relative', zIndex: 1 }}>
          {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((s) => {
            const c = slotColors[s]
            return (
              <button key={s} onClick={() => setSlot(s)} style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid ${slot === s ? `${c}60` : 'var(--glass-edge)'}`, background: slot === s ? `${c}18` : 'var(--glass-1)', color: slot === s ? c : 'var(--fg-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font-mono)', transition: 'all 150ms' }}>
                {s}
              </button>
            )
          })}
        </div>

        {/* Tab nav */}
        <div className="log-sheet-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--glass-edge)', position: 'relative', zIndex: 1 }}>
          {(['quick', 'voice', 'barcode', 'search', 'photo'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '12px 4px', background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === tab ? 'var(--sky-400)' : 'transparent'}`, color: activeTab === tab ? 'var(--sky-300)' : 'var(--fg-quiet)', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)', textTransform: 'capitalize', transition: 'all 150ms' }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="thin-scroll log-sheet-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px calc(env(safe-area-inset-bottom) + 20px)', position: 'relative', zIndex: 1 }}>
          {activeTab === 'quick' && (
            <QuickTab
              currentSlot={slot}
              onAddItems={(items) => { addItems(items); setActiveTab('search') }}
            />
          )}
          {activeTab === 'voice' && (
            <VoiceTab
              onAddItems={addItems}
              onSwitchToPlate={() => setActiveTab('search')}
            />
          )}
          {activeTab === 'barcode' && (
            <BarcodeTab
              onAddItem={addItem}
              onSwitchToPlate={() => setActiveTab('search')}
            />
          )}
          {activeTab === 'search' && (
            <SearchTab
              draftItems={draftItems}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateWeight={updateItemWeight}
              favorites={favorites}
              onLogFavoriteDirect={(items, name) => logFavoriteDirect.mutate({ items, name })}
              isLoggingFavorite={logFavoriteDirect.isPending}
            />
          )}
          {activeTab === 'photo' && (
            <PhotoTab onAddItems={addItems} />
          )}
        </div>

        {/* Footer / save */}
        {draftItems.length > 0 && (
          <div className="log-sheet-footer" style={{ padding: '16px 20px calc(env(safe-area-inset-bottom) + 16px)', borderTop: '1px solid var(--glass-edge)', background: 'linear-gradient(180deg, rgba(8,13,26,0.98), rgba(5,8,17,0.98))', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', zIndex: 1 }}>
            <div className="eyebrow">Cumulative nutrition</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { l: 'Calories', v: Math.round(totals.calories), c: 'var(--fg-primary)' },
                { l: 'Sat Fat', v: `${totals.saturated_fat_g.toFixed(1)}g`, c: 'var(--bad)' },
                { l: 'Sol Fiber', v: `${totals.soluble_fiber_g.toFixed(1)}g`, c: 'var(--good)' },
                { l: 'Protein', v: `${totals.protein_g.toFixed(1)}g`, c: 'var(--aurora-violet)' },
              ].map((n) => (
                <div key={n.l} className="glass-inset" style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 2 }}>{n.l}</div>
                  <div className="num" style={{ fontSize: 14, fontWeight: 600, color: n.c }}>{n.v}</div>
                </div>
              ))}
            </div>
            <input
              type="text"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="Name this meal… (optional)"
              className="field-input"
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13,
                background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                borderRadius: 8, color: 'var(--fg-primary)', boxSizing: 'border-box',
              }}
            />
            {savingFav ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  type="text"
                  value={favName}
                  onChange={(e) => setFavName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') favMutation.mutate(); if (e.key === 'Escape') setSavingFav(false) }}
                  placeholder="Name this favorite…"
                  className="field-input flex-1 rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--glass-edge)' }}
                />
                <button
                  onClick={() => favMutation.mutate()}
                  disabled={favMutation.isPending}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Save
                </button>
                <button onClick={() => setSavingFav(false)} className="px-3 py-2 text-slate-400 hover:text-white text-sm rounded-lg transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSavingFav(true)}
                className="w-full py-2 text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <Heart size={14} />
                Save as favorite
              </button>
            )}
            <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={{ width: '100%', padding: '13px', fontSize: 14, opacity: saveMutation.isPending ? 0.7 : 1 }}>
              {saveMutation.isPending ? 'Logging…' : 'Save meal log'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
