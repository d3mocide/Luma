import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, type Dri } from '../../lib/api'

type Nutrition = Record<string, number>

interface NutrientRow {
  key: string
  label: string
  unit: string
  indent?: boolean
}

const MACRO_ROWS: NutrientRow[] = [
  { key: 'calories',              label: 'Calories',              unit: 'kcal' },
  { key: 'protein_g',             label: 'Protein',               unit: 'g' },
  { key: 'fat_g',                 label: 'Total Fat',             unit: 'g' },
  { key: 'saturated_fat_g',       label: 'Saturated Fat',         unit: 'g',  indent: true },
  { key: 'monounsaturated_fat_g', label: 'Monounsaturated Fat',   unit: 'g',  indent: true },
  { key: 'polyunsaturated_fat_g', label: 'Polyunsaturated Fat',   unit: 'g',  indent: true },
  { key: 'trans_fat_g',           label: 'Trans Fat',             unit: 'g',  indent: true },
  { key: 'cholesterol_mg',        label: 'Cholesterol',           unit: 'mg' },
  { key: 'carbohydrates_g',       label: 'Carbohydrates',         unit: 'g' },
  { key: 'fiber_g',               label: 'Total Fiber',           unit: 'g',  indent: true },
  { key: 'soluble_fiber_g',       label: 'Soluble Fiber',         unit: 'g',  indent: true },
  { key: 'sugars_g',              label: 'Sugars',                unit: 'g',  indent: true },
  { key: 'sodium_mg',             label: 'Sodium',                unit: 'mg' },
  { key: 'potassium_mg',          label: 'Potassium',             unit: 'mg' },
]

const VITAMIN_ROWS: NutrientRow[] = [
  { key: 'vitamin_a_mcg',   label: 'Vitamin A',    unit: 'mcg' },
  { key: 'vitamin_c_mg',    label: 'Vitamin C',    unit: 'mg' },
  { key: 'vitamin_d_mcg',   label: 'Vitamin D',    unit: 'mcg' },
  { key: 'vitamin_e_mg',    label: 'Vitamin E',    unit: 'mg' },
  { key: 'vitamin_k_mcg',   label: 'Vitamin K',    unit: 'mcg' },
  { key: 'thiamin_mg',      label: 'Thiamin (B1)', unit: 'mg' },
  { key: 'riboflavin_mg',   label: 'Riboflavin (B2)', unit: 'mg' },
  { key: 'niacin_mg',       label: 'Niacin (B3)',  unit: 'mg' },
  { key: 'vitamin_b6_mg',   label: 'Vitamin B6',   unit: 'mg' },
  { key: 'folate_mcg',      label: 'Folate',       unit: 'mcg' },
  { key: 'vitamin_b12_mcg', label: 'Vitamin B12',  unit: 'mcg' },
]

const MINERAL_ROWS: NutrientRow[] = [
  { key: 'calcium_mg',    label: 'Calcium',    unit: 'mg' },
  { key: 'iron_mg',       label: 'Iron',       unit: 'mg' },
  { key: 'magnesium_mg',  label: 'Magnesium',  unit: 'mg' },
  { key: 'phosphorus_mg', label: 'Phosphorus', unit: 'mg' },
  { key: 'zinc_mg',       label: 'Zinc',       unit: 'mg' },
  { key: 'selenium_mcg',  label: 'Selenium',   unit: 'mcg' },
]

const EXTENDED_KEYS = new Set([
  ...VITAMIN_ROWS.map(r => r.key),
  ...MINERAL_ROWS.map(r => r.key),
  'monounsaturated_fat_g', 'polyunsaturated_fat_g', 'trans_fat_g', 'cholesterol_mg',
])

function fmt(val: number, unit: string): string {
  if (unit === 'kcal') return Math.round(val).toString()
  if (val < 0.1 && val > 0) return val.toFixed(2)
  if (val < 10) return val.toFixed(1)
  return Math.round(val).toString()
}

function NutrientRowItem({
  row,
  nutrition,
  dri,
}: {
  row: NutrientRow
  nutrition: Nutrition
  dri: Dri | null | undefined
}) {
  const raw = nutrition[row.key] ?? 0
  const driEntry = dri?.[row.key]
  const hasData = raw > 0 || !EXTENDED_KEYS.has(row.key)
  const pct = driEntry && driEntry.rda > 0 ? Math.min((raw / driEntry.rda) * 100, 100) : null
  const isMax = driEntry?.direction === 'max'
  const isOver = isMax && driEntry && raw > driEntry.rda

  const barColor = isOver
    ? 'var(--color-warning, #f59e0b)'
    : isMax
    ? 'var(--fg-tertiary)'
    : 'var(--color-accent, #6366f1)'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 80px auto',
        alignItems: 'center',
        gap: 8,
        padding: '6px 0',
        paddingLeft: row.indent ? 16 : 0,
        borderBottom: '1px solid var(--glass-edge)',
        opacity: !hasData && raw === 0 ? 0.45 : 1,
      }}
    >
      <span style={{ fontSize: 13, color: row.indent ? 'var(--fg-tertiary)' : 'var(--fg-primary)' }}>
        {row.label}
      </span>
      <span className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)', whiteSpace: 'nowrap' }}>
        {hasData ? `${fmt(raw, row.unit)} ${row.unit}` : '—'}
      </span>
      <div style={{ height: 4, background: 'var(--glass-edge)', borderRadius: 2, overflow: 'hidden' }}>
        {pct !== null && hasData && (
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: barColor,
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        )}
      </div>
      <span style={{ fontSize: 11, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)', minWidth: 32, textAlign: 'right' }}>
        {pct !== null && hasData ? `${Math.round(pct)}%` : ''}
      </span>
    </div>
  )
}

function Section({ title, rows, nutrition, dri }: { title: string; rows: NutrientRow[]; nutrition: Nutrition; dri: Dri | null | undefined }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--fg-tertiary)', letterSpacing: '0.12em' }}>{title}</div>
      {rows.map(row => (
        <NutrientRowItem key={row.key} row={row} nutrition={nutrition} dri={dri} />
      ))}
    </div>
  )
}

export function NutrientBreakdownSheet({
  title,
  nutrition,
  onClose,
}: {
  title: string
  nutrition: Nutrition
  onClose: () => void
}) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ dri?: Dri }>('/auth/me') })
  const dri = me?.dri ?? null

  const hasExtended = EXTENDED_KEYS.has('calcium_mg')
    ? Object.entries(nutrition).some(([k, v]) => EXTENDED_KEYS.has(k) && v > 0)
    : false

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(5,8,17,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 200,
        }}
      />
      {/* Sheet */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxHeight: '92dvh',
          background: 'linear-gradient(180deg, rgba(13,20,37,0.86), rgba(8,13,26,0.94))',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          borderTop: '1px solid var(--glass-edge-strong)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 20px 12px',
          borderBottom: '1px solid var(--glass-edge)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-primary)' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
              %DV based on{dri ? ' your personalised DRI' : ' 2,000 kcal reference'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--glass-edge)',
              border: 'none',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: 'var(--fg-tertiary)',
              lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px 32px', flex: 1 }}>
          <Section title="Macronutrients" rows={MACRO_ROWS} nutrition={nutrition} dri={dri} />
          <Section title="Vitamins" rows={VITAMIN_ROWS} nutrition={nutrition} dri={dri} />
          <Section title="Minerals" rows={MINERAL_ROWS} nutrition={nutrition} dri={dri} />

          {!hasExtended && (
            <p style={{ fontSize: 12, color: 'var(--fg-quiet)', marginTop: 8, lineHeight: 1.6 }}>
              Vitamin and mineral data is only available for foods logged via search or barcode scan.
              Voice, text, and photo logs show macros only.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
