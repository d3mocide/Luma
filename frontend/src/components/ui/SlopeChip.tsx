import { TrendingDown, TrendingUp } from 'lucide-react'

interface SlopeChipProps {
  label: string
  value: number | null
  unit?: string
}

export default function SlopeChip({ label, value, unit = 'kg/wk' }: SlopeChipProps) {
  if (value == null) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12,
        color: 'var(--fg-quiet)',
      }}>
        <span style={{ color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{label}</span>
        <span className="num" style={{ fontWeight: 500 }}>—</span>
      </div>
    )
  }

  const good = value < 0
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 12px',
      borderRadius: 999,
      background: good ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
      border: `1px solid ${good ? 'rgba(52,211,153,0.25)' : 'rgba(251,113,133,0.25)'}`,
      fontSize: 12,
      color: good ? 'var(--good)' : 'var(--bad)',
    }}>
      {good
        ? <TrendingDown size={13}/>
        : <TrendingUp size={13}/>
      }
      <span style={{ color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{label}</span>
      <span className="num" style={{ fontWeight: 500 }}>{sign}{Math.abs(value).toFixed(2)} {unit}</span>
    </div>
  )
}
