const DAY_LABELS = ['M','T','W','T','F','S','S','M','T','W','T','F','S','S']

interface StreakStripProps {
  days: number
  ofMax?: number
}

export default function StreakStrip({ days, ofMax = 14 }: StreakStripProps) {
  const dots = Array.from({ length: ofMax }, (_, i) => i < days)

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {dots.map((on, i) => (
        <div key={i} style={{
          flex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <div style={{
            width: '100%',
            aspectRatio: '1 / 1.4',
            borderRadius: 8,
            background: on
              ? `linear-gradient(180deg, rgba(251,191,36,${0.3 + (i / ofMax) * 0.5}), rgba(251,113,133,${0.2 + (i / ofMax) * 0.4}))`
              : 'rgba(255,255,255,0.04)',
            border: on ? '1px solid rgba(251,191,36,0.4)' : '1px solid rgba(255,255,255,0.06)',
            boxShadow: on ? `0 0 ${4 + (i / ofMax) * 16}px rgba(251,191,36,${0.15 + (i / ofMax) * 0.3})` : 'none',
          }}/>
          <span style={{
            fontSize: 9,
            color: on ? 'var(--fg-secondary)' : 'var(--fg-faint)',
            fontFamily: 'var(--font-mono)',
          }}>{DAY_LABELS[i]}</span>
        </div>
      ))}
    </div>
  )
}
