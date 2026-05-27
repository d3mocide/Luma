export function BioTile({ icon, label, value, unit, color }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; color: string
}) {
  return (
    <div className="glass-inset" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>}
      </div>
    </div>
  )
}
