interface ActivityRingsProps {
  size?: number
  values?: [number, number, number]
  thickness?: number
  gap?: number
  animate?: boolean
}

const RING_COLORS = [
  { from: '#38bdf8', to: '#0ea5e9', glow: 'rgba(56,189,248,0.5)' },
  { from: '#fde68a', to: '#fbbf24', glow: 'rgba(251,191,36,0.5)' },
  { from: '#86efac', to: '#34d399', glow: 'rgba(52,211,153,0.5)' },
]

export default function ActivityRings({
  size = 200,
  values = [0.96, 0.83, 1.10],
  thickness = 14,
  gap = 6,
  animate = true,
}: ActivityRingsProps) {
  const center = size / 2
  const radii = values.map((_, i) => center - thickness / 2 - i * (thickness + gap))

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="ring-svg"
    >
      <defs>
        {RING_COLORS.map((c, i) => (
          <linearGradient key={i} id={`ring-${i}-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c.from} />
            <stop offset="100%" stopColor={c.to} />
          </linearGradient>
        ))}
        <filter id={`ring-glow-${size}`}>
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {values.map((v, i) => {
        const r = radii[i]
        const c = 2 * Math.PI * r
        const pct = Math.min(v, 1.0)
        const overage = Math.min(Math.max(0, v - 1.0), 1.0)
        const overageColor = overage > 0.3 ? '#ef4444' : '#f59e0b'
        return (
          <g key={i}>
            <circle
              cx={center} cy={center} r={r}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness}
            />
            <circle
              cx={center} cy={center} r={r}
              fill="none"
              stroke={`url(#ring-${i}-${size})`}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              filter={`url(#ring-glow-${size})`}
              style={animate ? { animation: `ringDraw${i} 1.6s cubic-bezier(.2,.7,.2,1) both` } : {}}
            />
            {overage > 0 && (
              <circle
                cx={center} cy={center} r={r}
                fill="none"
                stroke={overageColor}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - overage)}
                style={animate ? { animation: `ringOverage${i} 0.5s cubic-bezier(.2,.7,.2,1) 1.6s both` } : {}}
              />
            )}
          </g>
        )
      })}
      <style>{`
        @keyframes ringDraw0 { from { stroke-dashoffset: ${2 * Math.PI * radii[0]} } }
        @keyframes ringDraw1 { from { stroke-dashoffset: ${2 * Math.PI * radii[1]} } }
        @keyframes ringDraw2 { from { stroke-dashoffset: ${2 * Math.PI * radii[2]} } }
        @keyframes ringOverage0 { from { stroke-dashoffset: ${2 * Math.PI * radii[0]} } }
        @keyframes ringOverage1 { from { stroke-dashoffset: ${2 * Math.PI * radii[1]} } }
        @keyframes ringOverage2 { from { stroke-dashoffset: ${2 * Math.PI * radii[2]} } }
      `}</style>
    </svg>
  )
}
