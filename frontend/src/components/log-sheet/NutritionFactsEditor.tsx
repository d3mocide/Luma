import { useEffect, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { MACRO_ROWS, VITAMIN_ROWS, MINERAL_ROWS, type NutrientRow } from '../../lib/nutrient-rows'

// Per-serving editable Nutrition Facts form, shared by the barcode confirm card
// and the photo draft-item editor. The DB stores nutrients per 100g, but people
// read package labels per serving — so the editor works in per-serving terms and
// converts back to per-100g for the caller (and for /foods persistence).

const MICRO_ROWS: NutrientRow[] = [...VITAMIN_ROWS, ...MINERAL_ROWS]
const ALL_ROWS: NutrientRow[] = [...MACRO_ROWS, ...MICRO_ROWS]

export type NutritionEditorChange = { servingSizeG: number; per100g: Record<string, number> }

type Props = {
  servingSizeG: number
  per100g: Record<string, number>
  onChange: (next: NutritionEditorChange) => void
  saveToLibrary: boolean
  onSaveToLibraryChange: (next: boolean) => void
  // Changing this resets the editor's working state to the incoming values —
  // used to re-seed when a different food is loaded into the same mounted editor.
  instanceKey?: string | number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

// Format a per-100g value into its per-serving editable string, dropping noise.
function seedVal(per100: Record<string, number>, serving: number, key: string): string {
  const v = (per100[key] ?? 0) * serving / 100
  if (!v) return ''
  return String(round2(v))
}

function buildSeed(per100: Record<string, number>, serving: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of ALL_ROWS) out[row.key] = seedVal(per100, serving, row.key)
  return out
}

// Convert the per-serving working strings back to a canonical per-100g profile.
function toPer100g(vals: Record<string, string>, serving: number): Record<string, number> {
  const safeServing = serving > 0 ? serving : 1
  const out: Record<string, number> = {}
  for (const row of ALL_ROWS) {
    const perServing = parseFloat(vals[row.key]) || 0
    out[row.key] = perServing > 0 ? round2(perServing * 100 / safeServing) : 0
  }
  return out
}

export function NutritionFactsEditor({
  servingSizeG, per100g, onChange, saveToLibrary, onSaveToLibraryChange, instanceKey,
}: Props) {
  const [serving, setServing] = useState<string>(() => String(Math.round(servingSizeG) || 100))
  const [vals, setVals] = useState<Record<string, string>>(() => buildSeed(per100g, servingSizeG || 100))
  const [microsOpen, setMicrosOpen] = useState<boolean>(() => MICRO_ROWS.some((r) => (per100g[r.key] ?? 0) > 0))

  // Re-seed when a different food is loaded into the same editor instance.
  useEffect(() => {
    const s = Math.round(servingSizeG) || 100
    setServing(String(s)) // eslint-disable-line react-hooks/set-state-in-effect
    setVals(buildSeed(per100g, s))
    setMicrosOpen(MICRO_ROWS.some((r) => (per100g[r.key] ?? 0) > 0))
    // Only react to identity changes, not to every value emitted back down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceKey])

  const emit = (nextVals: Record<string, string>, nextServingStr: string) => {
    const s = Math.max(1, Math.round(parseFloat(nextServingStr) || 0))
    onChange({ servingSizeG: s, per100g: toPer100g(nextVals, s) })
  }

  const updateField = (key: string, raw: string) => {
    // Permit empty / decimal-in-progress; reject negatives and stray characters.
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    let next = { ...vals, [key]: raw }
    // Saturated fat is a subset of total fat — keep it from exceeding the total.
    if (key === 'saturated_fat_g' || key === 'fat_g') {
      const fat = parseFloat(key === 'fat_g' ? raw : next.fat_g) || 0
      const sat = parseFloat(key === 'saturated_fat_g' ? raw : next.saturated_fat_g) || 0
      if (fat > 0 && sat > fat) next = { ...next, saturated_fat_g: String(round2(fat)) }
    }
    setVals(next)
    emit(next, serving)
  }

  const updateServing = (raw: string) => {
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    setServing(raw)
    emit(vals, raw)
  }

  const renderRow = (row: NutrientRow) => (
    <div
      key={row.key}
      style={{
        display: 'grid', gridTemplateColumns: '1fr 78px 34px', alignItems: 'center', gap: 8,
        padding: '5px 0', paddingLeft: row.indent ? 14 : 0,
      }}
    >
      <label
        htmlFor={`nfe-${row.key}`}
        style={{ fontSize: 12.5, color: row.indent ? 'var(--fg-tertiary)' : 'var(--fg-secondary)' }}
      >
        {row.label}
      </label>
      <input
        id={`nfe-${row.key}`}
        type="text"
        inputMode="decimal"
        value={vals[row.key] ?? ''}
        onChange={(e) => updateField(row.key, e.target.value)}
        placeholder="0"
        className="field-input"
        style={{
          width: '100%', boxSizing: 'border-box', textAlign: 'right', borderRadius: 7,
          padding: '6px 8px', fontSize: 13, fontWeight: 600, border: '1px solid var(--glass-edge)',
          fontFamily: 'var(--font-mono)', color: 'var(--fg-primary)', background: 'var(--glass-1)',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{row.unit}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Serving size — the basis everything else is entered against */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8, marginBottom: 4, borderBottom: '1px solid var(--glass-edge)' }}>
        <span style={{ fontSize: 12.5, color: 'var(--fg-secondary)', fontWeight: 600 }}>Serving size</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="text"
            inputMode="decimal"
            value={serving}
            onChange={(e) => updateServing(e.target.value)}
            aria-label="Serving size in grams"
            className="field-input"
            style={{
              width: 72, textAlign: 'right', borderRadius: 7, padding: '6px 8px', fontSize: 13,
              fontWeight: 700, border: '1px solid var(--glass-edge)', fontFamily: 'var(--font-mono)',
              color: 'var(--sky-400)', background: 'var(--glass-1)',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>g</span>
        </div>
      </div>

      <div className="eyebrow" style={{ marginBottom: 2 }}>Per serving</div>
      {MACRO_ROWS.map(renderRow)}

      {/* Micronutrients — collapsed by default; auto-opened when the food already
          carries vitamin/mineral data so existing values aren't hidden. */}
      <button
        type="button"
        onClick={() => setMicrosOpen((o) => !o)}
        aria-expanded={microsOpen}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
          marginTop: 8, padding: '8px 0', background: 'none', border: 'none', borderTop: '1px solid var(--glass-edge)',
          cursor: 'pointer', color: 'var(--fg-secondary)',
        }}
      >
        <span className="eyebrow" style={{ color: 'var(--fg-tertiary)' }}>
          {microsOpen ? 'Micronutrients' : 'Add micronutrients'}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--fg-quiet)', transform: microsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease-out' }} />
      </button>
      {microsOpen && MICRO_ROWS.map(renderRow)}

      {/* Save-to-library toggle */}
      <button
        type="button"
        onClick={() => onSaveToLibraryChange(!saveToLibrary)}
        aria-pressed={saveToLibrary}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 8,
          padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
          background: saveToLibrary ? 'rgba(167,139,250,0.1)' : 'var(--glass-1)',
          border: `1px solid ${saveToLibrary ? 'rgba(167,139,250,0.3)' : 'var(--glass-edge)'}`,
        }}
      >
        <span
          style={{
            width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: saveToLibrary ? '#a78bfa' : 'transparent',
            border: `1px solid ${saveToLibrary ? '#a78bfa' : 'var(--glass-edge)'}`,
            transition: 'all 150ms',
          }}
        >
          {saveToLibrary && <Check size={12} color="#0b0f1a" strokeWidth={3} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--fg-primary)' }}>Save to my foods</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-quiet)', marginTop: 1 }}>
            Searchable later and addable to other meals
          </span>
        </span>
      </button>
    </div>
  )
}
