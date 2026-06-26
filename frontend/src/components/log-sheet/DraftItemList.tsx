import { useState } from 'react'
import { Replace, Utensils, X, SlidersHorizontal, Check } from 'lucide-react'
import type { DraftItem } from './types'
import { scaleNutrients, scaleByRatio } from '../../lib/nutrients'
import { NutritionFactsEditor } from './NutritionFactsEditor'

type Props = {
  draftItems: DraftItem[]
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
  onUpdateName: (index: number, name: string) => void
  // When provided, "Estimated" items show a Replace action that swaps in a
  // database food. Omitted where no food search is available to drive it.
  onReplaceItem?: (index: number) => void
  // When provided, each item gains an "Edit nutrition" affordance that expands
  // an inline editable Nutrition Facts panel (scan/photo confirmation gate).
  onUpdateNutrition?: (index: number, patch: { nutrients: ReturnType<typeof scaleNutrients>; estimated_weight_g: number }) => void
  // When provided, the editor's "Save to my foods" persists the edited item.
  onSaveToLibrary?: (index: number) => void
  // When provided, an empty list renders this prompt instead of nothing.
  emptyStateMessage?: string
  // When set above 1, each item shows how much to weigh out per serving so a
  // batch can be portioned into even components.
  servings?: number
}

// Back-calculate an item's per-100g profile from its absolute portion nutrients,
// so the editor can present per-serving values and persistence can store density.
function itemPer100g(item: DraftItem): Record<string, number> {
  const w = item.estimated_weight_g || 100
  return scaleByRatio(item.nutrients, 100 / w)
}

// Relative portion presets, anchored to each item's original estimate so the
// chips stay meaningful for vague photo/voice portions (e.g. "1× the plate").
const PORTION_MULTIPLIERS: { factor: number; label: string }[] = [
  { factor: 0.5, label: '½×' },
  { factor: 1, label: '1×' },
  { factor: 1.5, label: '1.5×' },
  { factor: 2, label: '2×' },
]

const OZ_IN_G = 28.3495

// Provenance pill: distinguish trustworthy DB-sourced nutrients from LLM
// estimates so the user knows which rows to double-check before saving.
function sourceBadge(item: DraftItem): { label: string; color: string; bg: string; border: string } | null {
  switch (item.nutrient_source) {
    case 'estimate':
      return { label: 'Estimated', color: 'var(--sun-300)', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.3)' }
    case 'reference':
    case 'usda':
      return { label: 'USDA', color: 'var(--sky-300)', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.28)' }
    case 'off':
      return { label: 'Label', color: 'var(--fg-tertiary)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)' }
    case 'user':
      return { label: 'Your food', color: '#c084fc', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)' }
    default:
      return null
  }
}

export function DraftItemList({ draftItems, onRemoveItem, onUpdateWeight, onUpdateName, onReplaceItem, onUpdateNutrition, onSaveToLibrary, emptyStateMessage, servings }: Props) {
  const showPerServing = (servings ?? 1) > 1
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editSave, setEditSave] = useState(true)

  const openEditor = (idx: number) => {
    setEditSave(true)
    setEditingIndex((cur) => (cur === idx ? null : idx))
  }

  const finishEditor = (idx: number) => {
    if (editSave) onSaveToLibrary?.(idx)
    setEditingIndex(null)
  }
  if (draftItems.length === 0) {
    if (!emptyStateMessage) return null
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', border: '1px dashed var(--glass-edge)', borderRadius: 12 }}>
        <Utensils size={22} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)', margin: '0 auto 8px', display: 'block' }} />
        <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-quiet)' }}>{emptyStateMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Meal items ({draftItems.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {draftItems.map((item, idx) => {
          const base = item.base_weight_g ?? item.estimated_weight_g
          const current = Math.round(item.estimated_weight_g)
          const perServingG = showPerServing ? item.estimated_weight_g / (servings as number) : 0
          return (
            <div key={idx} className="builder-ingredient-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => onUpdateName(idx, e.target.value)}
                    aria-label="Item name"
                    style={{
                      width: '100%', boxSizing: 'border-box', marginLeft: -5,
                      fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)',
                      background: 'transparent', border: '1px solid transparent', borderRadius: 6,
                      padding: '2px 5px', fontFamily: 'var(--font-sans)', outline: 'none',
                      transition: 'background 150ms, border-color 150ms',
                    }}
                    onFocus={(e) => { e.currentTarget.style.background = 'var(--glass-1)'; e.currentTarget.style.borderColor = 'var(--glass-edge)' }}
                    onBlur={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)', paddingLeft: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{Math.round(item.nutrients.calories)} kcal · {item.nutrients.protein_g.toFixed(1)}g protein</span>
                    {(() => {
                      const badge = sourceBadge(item)
                      if (!badge) return null
                      return (
                        <span
                          title={item.nutrient_source === 'estimate'
                            ? 'Estimated values — not matched to a database food. Double-check before saving.'
                            : 'Nutrients from a verified food database record.'}
                          style={{
                            fontSize: 8, padding: '1px 6px', borderRadius: 20,
                            background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                            fontWeight: 600, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                            letterSpacing: '0.04em', whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.label}
                        </span>
                      )
                    })()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  {onReplaceItem && item.nutrient_source === 'estimate' && (
                    <button
                      onClick={() => onReplaceItem(idx)}
                      title="Replace estimated values with a database food"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
                        background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                        color: 'var(--sky-300)', borderRadius: 6, padding: '3px 7px',
                        fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-sans)',
                      }}
                      aria-label={`Replace ${item.name} with a database food`}
                    >
                      <Replace size={11} /> Fix
                    </button>
                  )}
                  {onUpdateNutrition && (
                    <button
                      onClick={() => openEditor(idx)}
                      title="Edit nutrition facts"
                      aria-label={`Edit nutrition for ${item.name}`}
                      aria-expanded={editingIndex === idx}
                      style={{
                        color: editingIndex === idx ? 'var(--sky-300)' : 'var(--fg-quiet)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      }}
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => onRemoveItem(idx)}
                    style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                    aria-label={`Remove ${item.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Portion: editable grams + relative multiplier chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    value={current}
                    onChange={(e) => onUpdateWeight(idx, Math.max(1, parseInt(e.target.value) || 0))}
                    className="field-input"
                    style={{
                      width: 62, textAlign: 'center', borderRadius: 8, padding: '5px 4px',
                      fontSize: 14, fontWeight: 700, border: '1px solid var(--glass-edge)',
                      fontFamily: 'var(--font-mono)', color: 'var(--sky-400)',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--fg-tertiary)', fontWeight: 500 }}>g</span>
                </div>
                <div className="multiplier-btn-group" style={{ flex: 1 }}>
                  {PORTION_MULTIPLIERS.map(({ factor, label }) => {
                    const target = Math.max(1, Math.round(base * factor))
                    const active = current === target
                    return (
                      <button
                        key={factor}
                        onClick={() => onUpdateWeight(idx, target)}
                        title={`${target}g`}
                        className={`multiplier-btn ${active ? 'multiplier-btn--active' : ''}`}
                        style={{ flex: 1 }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {showPerServing && (
                <div style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                  paddingTop: 8, borderTop: '1px solid var(--glass-edge)',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                    Weigh out per serving (÷{servings})
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sky-400)', fontFamily: 'var(--font-mono)' }}>
                    <span className="num">{Math.round(perServingG)}</span> g
                    <span style={{ color: 'var(--fg-tertiary)', fontWeight: 400 }}> · {(perServingG / OZ_IN_G).toFixed(1)} oz</span>
                  </span>
                </div>
              )}

              {onUpdateNutrition && editingIndex === idx && (
                <div style={{ paddingTop: 12, marginTop: 4, borderTop: '1px solid var(--glass-edge)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <NutritionFactsEditor
                    instanceKey={idx}
                    servingSizeG={item.estimated_weight_g}
                    per100g={itemPer100g(item)}
                    onChange={({ servingSizeG, per100g }) =>
                      onUpdateNutrition(idx, {
                        nutrients: scaleNutrients(per100g, servingSizeG),
                        estimated_weight_g: servingSizeG,
                      })
                    }
                    saveToLibrary={editSave}
                    onSaveToLibraryChange={setEditSave}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => finishEditor(idx)}
                    style={{ padding: '9px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <Check size={14} /> Done
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
