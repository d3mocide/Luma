import { useState } from 'react'
import { useUIStore } from '../stores'
import { api } from '../lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { VoiceTab } from './log-sheet/VoiceTab'
import { BarcodeTab } from './log-sheet/BarcodeTab'
import { PlateTab } from './log-sheet/PlateTab'
import type { DraftItem } from './log-sheet/types'

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
    if (isPageMode) { onClose?.(); return }
    close()
  }

  const [activeTab, setActiveTab] = useState<'voice' | 'barcode' | 'search'>('voice')
  const [slot, setSlot] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [transcription, setTranscription] = useState('')

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
        slot, source: activeTab, items: draftItems, nutrition: totals,
        raw_input: transcription || 'Manual Log',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      setDraftItems([])
      setTranscription('')
      handleClose()
    },
    onError: (err) => {
      console.error(err)
      alert('Failed to save meal log. Try again!')
    },
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
          {(['voice', 'barcode', 'search'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: '12px', background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === tab ? 'var(--sky-400)' : 'transparent'}`, color: activeTab === tab ? 'var(--sky-300)' : 'var(--fg-quiet)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)', textTransform: 'capitalize', transition: 'all 150ms' }}>
              {tab === 'search' ? 'Search' : tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="thin-scroll log-sheet-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px calc(env(safe-area-inset-bottom) + 20px)', position: 'relative', zIndex: 1 }}>
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
            <PlateTab
              draftItems={draftItems}
              onAddItem={addItem}
              onRemoveItem={removeItem}
              onUpdateWeight={updateItemWeight}
            />
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
            <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={{ width: '100%', padding: '13px', fontSize: 14, opacity: saveMutation.isPending ? 0.7 : 1 }}>
              {saveMutation.isPending ? 'Logging…' : 'Save meal log'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
