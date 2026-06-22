import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Dri, NutritionHistoryDay } from '../../lib/api'
import Spark from '../ui/Spark'
import {
  MACRO_ROWS, VITAMIN_ROWS, MINERAL_ROWS, EXTENDED_KEYS,
  fmtNutrient, type NutrientRow,
} from '../../lib/nutrient-rows'

type Nutrition = Record<string, number>

function NutrientTrend({
  nutrientKey, unit, dri, history,
}: {
  nutrientKey: string
  unit: string
  dri: Dri | null | undefined
  history: NutritionHistoryDay[]
}) {
  const series = history.map(d => d.nutrition[nutrientKey] ?? 0)
  const entry = dri?.[nutrientKey]
  const isMax = entry?.direction === 'max'
  const color = isMax ? '#fb923c' : '#34d399'
  const recent = series.filter(v => v > 0)
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0
  const daysWithData = recent.length

  return (
    <div
      className="glass-inset"
      style={{ padding: '12px 14px', borderRadius: 12, marginTop: 2, marginBottom: 6 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span className="eyebrow" style={{ fontSize: 9 }}>Last {history.length} days</span>
        <span className="num" style={{ fontSize: 11, color: 'var(--fg-tertiary)' }}>
          avg {fmtNutrient(avg, unit)} {unit}
          {entry && entry.rda > 0 && (
            <span style={{ color: 'var(--fg-quiet)' }}> · {entry.direction === 'max' ? 'max' : 'RDA'} {fmtNutrient(entry.rda, unit)} {unit}</span>
          )}
        </span>
      </div>
      {daysWithData > 0 ? (
        <Spark data={series} color={color} h={40} />
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-quiet)' }}>No data captured in this window.</p>
      )}
    </div>
  )
}

function NutrientRowItem({
  row, nutrition, dri, history, expanded, onToggle,
}: {
  row: NutrientRow
  nutrition: Nutrition
  dri: Dri | null | undefined
  history?: NutritionHistoryDay[]
  expanded: boolean
  onToggle?: (key: string) => void
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

  // Trends only make sense where we have a history window and the row carries data.
  const interactive = !!history && !!onToggle && raw > 0

  return (
    <>
      <div
        onClick={interactive ? () => onToggle?.(row.key) : undefined}
        role={interactive ? 'button' : undefined}
        style={{
          display: 'grid',
          gridTemplateColumns: `1fr auto 80px auto${interactive ? ' 16px' : ''}`,
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
          paddingLeft: row.indent ? 16 : 0,
          borderBottom: '1px solid var(--glass-edge)',
          opacity: !hasData && raw === 0 ? 0.45 : 1,
          cursor: interactive ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: 13, color: row.indent ? 'var(--fg-tertiary)' : 'var(--fg-primary)' }}>
          {row.label}
        </span>
        <span className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)', whiteSpace: 'nowrap' }}>
          {hasData ? `${fmtNutrient(raw, row.unit)} ${row.unit}` : '—'}
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
        {interactive && (
          <ChevronDown
            size={13}
            strokeWidth={1.8}
            style={{
              color: 'var(--fg-quiet)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
        )}
      </div>
      {interactive && expanded && history && (
        <NutrientTrend nutrientKey={row.key} unit={row.unit} dri={dri} history={history} />
      )}
    </>
  )
}

function Section({
  title, rows, nutrition, dri, history, expandedKey, onToggle,
}: {
  title: string
  rows: NutrientRow[]
  nutrition: Nutrition
  dri: Dri | null | undefined
  history?: NutritionHistoryDay[]
  expandedKey?: string | null
  onToggle?: (key: string) => void
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--fg-tertiary)', letterSpacing: '0.12em' }}>{title}</div>
      {rows.map(row => (
        <NutrientRowItem
          key={row.key}
          row={row}
          nutrition={nutrition}
          dri={dri}
          history={history}
          expanded={expandedKey === row.key}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

/**
 * The macro / vitamin / mineral table. Shared by NutrientBreakdownSheet (static)
 * and the Nutrition Day page's Nutrients tab. When `history` is supplied, rows
 * with data become tappable and reveal an inline per-nutrient trend.
 */
export function NutrientBreakdownList({
  nutrition, dri, history,
}: {
  nutrition: Nutrition
  dri: Dri | null | undefined
  history?: NutritionHistoryDay[]
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const onToggle = history
    ? (key: string) => setExpandedKey(prev => (prev === key ? null : key))
    : undefined

  const hasExtended = Object.entries(nutrition).some(([k, v]) => EXTENDED_KEYS.has(k) && v > 0)

  return (
    <>
      <Section title="Macronutrients" rows={MACRO_ROWS} nutrition={nutrition} dri={dri} history={history} expandedKey={expandedKey} onToggle={onToggle} />
      <Section title="Vitamins" rows={VITAMIN_ROWS} nutrition={nutrition} dri={dri} history={history} expandedKey={expandedKey} onToggle={onToggle} />
      <Section title="Minerals" rows={MINERAL_ROWS} nutrition={nutrition} dri={dri} history={history} expandedKey={expandedKey} onToggle={onToggle} />

      {!hasExtended && (
        <p style={{ fontSize: 12, color: 'var(--fg-quiet)', marginTop: 8, lineHeight: 1.6 }}>
          Vitamin and mineral data is only available for foods logged via search or barcode scan.
          Voice, text, and photo logs show macros only.
        </p>
      )}
    </>
  )
}
