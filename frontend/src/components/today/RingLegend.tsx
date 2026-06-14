export function RingLegend({ color, label, value, pct, invert }: {
  color: string; label: string; value: string; pct: number; invert?: boolean
}) {
  // invert = max target (sat fat, sugar): good ≤100%, grace 100–110%, bad >110%
  // normal = min target (fiber): good ≥90%, warn <90%
  const status: 'good' | 'warn' | 'bad' = invert
    ? pct > 110 ? 'bad' : pct <= 100 ? 'good' : 'warn'
    : pct >= 90 ? 'good' : 'warn'

  const pctColor = status === 'good' ? 'var(--good)' : status === 'bad' ? 'var(--bad)' : 'var(--warn)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, boxShadow: '0 0 8px rgba(255,255,255,0.14)', flexShrink: 0,
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{label}</div>
        <div className="num" style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{value}</div>
      </div>
      <span className="num" style={{ fontSize: 13, fontWeight: 500, color: pctColor, transition: 'color 400ms' }}>
        {pct}%
      </span>
    </div>
  )
}
