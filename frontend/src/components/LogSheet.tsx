import { useState, useEffect } from 'react'
import { useUIStore } from '../stores'
import { api } from '../lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Heart, ChevronDown } from 'lucide-react'
import { VoiceTab } from './log-sheet/VoiceTab'
import { SearchTab } from './log-sheet/SearchTab'
import { ScanTab } from './log-sheet/ScanTab'
import { QuickTab } from './log-sheet/QuickTab'
import type { DraftItem, Favorite } from './log-sheet/types'
import { scaleByRatio, sumNutrients } from '../lib/nutrients'
import { getCurrentSlot } from '../lib/format'

type LogSheetMode = 'sheet' | 'page'

// Stamp the original estimate so the relative portion multipliers stay anchored
// even after the weight is edited, regardless of which flow produced the item.
const withBase = (item: DraftItem): DraftItem => ({
  ...item,
  base_weight_g: item.base_weight_g ?? item.estimated_weight_g,
})

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

  const pendingLogItems = useUIStore((s) => s.pendingLogItems)
  const clearPendingLogItems = useUIStore((s) => s.clearPendingLogItems)

  const editingMealId = useUIStore((s) => s.editingMealId)
  const editingMealItems = useUIStore((s) => s.editingMealItems)
  const editingMealSlot = useUIStore((s) => s.editingMealSlot)
  const editingMealName = useUIStore((s) => s.editingMealName)
  const clearEditingMeal = useUIStore((s) => s.clearEditingMeal)

  const handleClose = () => {
    setMealName('')
    clearEditingMeal()
    if (isPageMode) { onClose?.(); return }
    close()
  }

  const [activeTab, setActiveTab] = useState<'quick' | 'voice' | 'search' | 'scan'>('quick')
  const [slot, setSlot] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(getCurrentSlot)
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [transcription, setTranscription] = useState('')
  const [mealName, setMealName] = useState('')
  const [favorited, setFavorited] = useState(false)
  const [nutritionOpen, setNutritionOpen] = useState(false)

  const { data: favoritesData } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites', 'frequency'],
    queryFn: () => api.get('/favorites?sort=frequency'),
    enabled: isVisible,
  })
  const favorites = favoritesData?.favorites ?? []

  useEffect(() => {
    if (pendingLogItems?.length) {
      setDraftItems(pendingLogItems.map(withBase))
      clearPendingLogItems()
    }
  }, [pendingLogItems, clearPendingLogItems])

  useEffect(() => {
    if (editingMealId && editingMealItems && editingMealSlot) {
      setSlot(editingMealSlot)
      setDraftItems(editingMealItems.map(withBase))
      setMealName(editingMealName || '')
      setActiveTab('search')
    }
  }, [editingMealId, editingMealItems, editingMealSlot, editingMealName])

  const addItems = (items: DraftItem[]) => setDraftItems((prev) => [...prev, ...items.map(withBase)])
  const addItem = (item: DraftItem) => setDraftItems((prev) => [...prev, withBase(item)])

  const removeItem = (index: number) => setDraftItems((prev) => prev.filter((_, i) => i !== index))

  const updateItemName = (index: number, name: string) => {
    setDraftItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], name }
      return updated
    })
  }

  const updateItemWeight = (index: number, newWeight: number) => {
    setDraftItems((prev) => {
      const updated = [...prev]
      const item = { ...updated[index] }
      const ratio = newWeight / item.estimated_weight_g
      item.estimated_weight_g = newWeight
      item.nutrients = scaleByRatio(item.nutrients, ratio)
      updated[index] = item
      return updated
    })
  }

  const totals = sumNutrients(draftItems)

  // Gate against re-adding: treat the meal as favorited if it was just saved
  // this session, or if a favorite already exists under the same name.
  const trimmedName = mealName.trim().toLowerCase()
  const nameExists = trimmedName.length > 0 && favorites.some((f) => f.name.trim().toLowerCase() === trimmedName)
  const isFavorited = favorited || nameExists

  const saveMutation = useMutation({
    mutationFn: () => {
      if (editingMealId) {
        return api.patch(`/log/meal/${editingMealId}`, {
          slot,
          items: draftItems,
          nutrition: totals,
          raw_input: mealName.trim() || transcription || 'Manual log',
        })
      }
      return api.post('/log/meal', {
        slot,
        source: activeTab,
        items: draftItems,
        nutrition: totals,
        raw_input: mealName.trim() || transcription || 'Manual log',
      })
    },
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
    mutationFn: (name: string) => api.post('/favorites', {
      name: name.trim() || 'My favorite',
      items: draftItems.map((item) => ({
        food_name: item.name,
        brand: item.brand ?? null,
        quantity_g: item.estimated_weight_g,
        nutrients: item.nutrients,
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setFavorited(true)
    },
  })

  // Clear the "already favorited" gate whenever the meal contents or name
  // change, so an edited meal can be saved as a fresh favorite.
  useEffect(() => { setFavorited(false) }, [draftItems, mealName])

  const logFavoriteDirect = useMutation({
    mutationFn: ({ items, name, favoriteId }: { items: DraftItem[]; name: string; favoriteId: string }) => {
      const nutrition = sumNutrients(items)
      return api.post('/log/meal', { slot, source: 'favorite', favorite_id: favoriteId, items, nutrition, raw_input: name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      handleClose()
    },
    onError: () => { alert('Failed to log favorite. Try again!') },
  })

  if (!isVisible) return null

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


        {/* Tab nav */}
        <div style={{ padding: '16px 20px 0', marginBottom: 16, position: 'relative', zIndex: 1 }}>
          <div className="settings-tabs" role="tablist" style={{ marginBottom: 0 }}>
            {(['quick', 'scan', 'voice', 'search'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className="settings-tab"
                onClick={() => setActiveTab(tab)}
                style={{ flex: 1, textTransform: 'capitalize', padding: '8px 12px', fontSize: 12 }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="thin-scroll log-sheet-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px calc(env(safe-area-inset-bottom) + 20px)', position: 'relative', zIndex: 1 }}>
          {activeTab === 'quick' && (
            <QuickTab
              currentSlot={slot}
              onAddItems={(items, name) => {
                addItems(items)
                if (name) setMealName((prev) => (prev.trim() ? prev : name))
                setActiveTab('search')
              }}
              favorites={favorites}
              onLogFavoriteDirect={(items, name, favoriteId) => logFavoriteDirect.mutate({ items, name, favoriteId })}
              isLoggingFavorite={logFavoriteDirect.isPending}
            />
          )}
          {activeTab === 'voice' && (
            <VoiceTab
              onAddItems={addItems}
              onSwitchToPlate={() => setActiveTab('search')}
            />
          )}

          {activeTab === 'search' && (
            <SearchTab
              draftItems={draftItems}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateWeight={updateItemWeight}
              onUpdateName={updateItemName}
              favorites={favorites}
              onPickFavorite={(items, name) => {
                addItems(items)
                if (name) setMealName((prev) => (prev.trim() ? prev : name))
              }}
            />
          )}
          {activeTab === 'scan' && (
            <ScanTab
              onAddItems={addItems}
              draftItems={draftItems}
              onRemoveItem={removeItem}
              onUpdateWeight={updateItemWeight}
              onUpdateName={updateItemName}
            />
          )}
        </div>

        {/* Footer / save */}
        {draftItems.length > 0 && (
          <div className="log-sheet-footer" style={{ padding: '16px 20px calc(env(safe-area-inset-bottom) + 16px)', borderTop: '1px solid var(--glass-edge)', background: 'linear-gradient(180deg, rgba(8,13,26,0.98), rgba(5,8,17,0.98))', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', zIndex: 1 }}>
            <button
              onClick={() => setNutritionOpen((o) => !o)}
              aria-expanded={nutritionOpen}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span className="eyebrow">Cumulative nutrition</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!nutritionOpen && (
                  <span className="num" style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-tertiary)' }}>{Math.round(totals.calories)} kcal</span>
                )}
                <ChevronDown size={14} style={{ color: 'var(--fg-quiet)', transform: nutritionOpen ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease-out' }} />
              </span>
            </button>
            {nutritionOpen && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {[
                  { l: 'Calories', v: Math.round(totals.calories), c: 'var(--fg-primary)' },
                  { l: 'Sat Fat', v: `${totals.saturated_fat_g.toFixed(1)}g`, c: 'var(--bad)' },
                  { l: 'Sol Fiber', v: `${totals.soluble_fiber_g.toFixed(1)}g`, c: 'var(--good)' },
                  { l: 'Sugar', v: `${totals.sugars_g.toFixed(1)}g`, c: 'var(--aurora-pink)' },
                  { l: 'Protein', v: `${totals.protein_g.toFixed(1)}g`, c: 'var(--aurora-violet)' },
                ].map((n) => (
                  <div key={n.l} className="glass-inset" style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 2 }}>{n.l}</div>
                    <div className="num" style={{ fontSize: 14, fontWeight: 600, color: n.c }}>{n.v}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                type="text"
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                placeholder="Name this meal… (optional)"
                className="field-input"
                style={{
                  flex: 1, minWidth: 0, padding: '9px 12px', fontSize: 13,
                  background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                  borderRadius: 8, color: 'var(--fg-primary)', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => { if (!isFavorited && !favMutation.isPending) favMutation.mutate(mealName) }}
                disabled={isFavorited || favMutation.isPending}
                aria-pressed={isFavorited}
                aria-label={isFavorited ? 'Saved to favorites' : 'Save as favorite'}
                title={isFavorited ? 'Saved to favorites' : 'Save as favorite'}
                style={{
                  flexShrink: 0, width: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isFavorited ? 'rgba(244,114,182,0.12)' : 'var(--glass-1)',
                  border: `1px solid ${isFavorited ? 'rgba(244,114,182,0.4)' : 'var(--glass-edge)'}`,
                  borderRadius: 8, color: isFavorited ? 'var(--aurora-pink)' : 'var(--fg-tertiary)',
                  cursor: isFavorited || favMutation.isPending ? 'default' : 'pointer',
                  transition: 'color 160ms ease-out, background 160ms ease-out, border-color 160ms ease-out',
                }}
              >
                <Heart size={16} fill={isFavorited ? 'currentColor' : 'none'} />
              </button>
            </div>
            <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={{ width: '100%', padding: '13px', fontSize: 14, opacity: saveMutation.isPending ? 0.7 : 1 }}>
              {saveMutation.isPending ? (editingMealId ? 'Saving…' : 'Logging…') : (editingMealId ? 'Save changes' : 'Save meal log')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
