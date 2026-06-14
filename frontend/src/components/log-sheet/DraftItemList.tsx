import { Utensils, X } from 'lucide-react'
import type { DraftItem } from './types'

type Props = {
  draftItems: DraftItem[]
  onRemoveItem: (index: number) => void
  onUpdateWeight: (index: number, newWeight: number) => void
  onUpdateName: (index: number, name: string) => void
  // When provided, an empty list renders this prompt instead of nothing.
  emptyStateMessage?: string
}

// Relative portion presets, anchored to each item's original estimate so the
// chips stay meaningful for vague photo/voice portions (e.g. "1× the plate").
const PORTION_MULTIPLIERS: { factor: number; label: string }[] = [
  { factor: 0.5, label: '½×' },
  { factor: 1, label: '1×' },
  { factor: 1.5, label: '1.5×' },
  { factor: 2, label: '2×' },
]

export function DraftItemList({ draftItems, onRemoveItem, onUpdateWeight, onUpdateName, emptyStateMessage }: Props) {
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
          return (
            <div key={idx} className="glass-inset" style={{ padding: '10px 12px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)', paddingLeft: 1 }}>
                    {Math.round(item.nutrients.calories)} kcal · {item.nutrients.protein_g.toFixed(1)}g protein
                  </div>
                </div>
                <button
                  onClick={() => onRemoveItem(idx)}
                  style={{ color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                  aria-label={`Remove ${item.name}`}
                >
                  <X size={13} />
                </button>
              </div>

              {/* Portion: editable grams + relative multiplier chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  value={current}
                  onChange={(e) => onUpdateWeight(idx, Math.max(1, parseInt(e.target.value) || 0))}
                  className="field-input"
                  style={{
                    width: 56, textAlign: 'center', borderRadius: 7, padding: '4px 4px',
                    fontSize: 13, fontWeight: 700, border: '1px solid var(--glass-edge)',
                    fontFamily: 'var(--font-mono)', color: 'var(--sky-400)',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', flexShrink: 0 }}>g</span>
                <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                  {PORTION_MULTIPLIERS.map(({ factor, label }) => {
                    const target = Math.max(1, Math.round(base * factor))
                    const active = current === target
                    return (
                      <button
                        key={factor}
                        onClick={() => onUpdateWeight(idx, target)}
                        title={`${target}g`}
                        style={{
                          flex: 1, padding: '4px 2px', borderRadius: 6, fontSize: 10,
                          fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 150ms',
                          background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                          border: active ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                          color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
