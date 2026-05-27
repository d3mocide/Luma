export function RingLegend({ color, label, value, pct, invert }: {
  color: string; label: string; value: string; pct: number; invert?: boolean
}) {
  const good = invert ? pct <= 110 : pct >= 90 && pct <= 120
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
      <span className="num" style={{
        fontSize: 13, fontWeight: 500,
        color: good ? 'var(--good)' : 'var(--warn)',
      }}>{pct}%</span>
    </div>
  )
}
