interface DataPoint { last: number; date?: string }

interface WeightChartProps {
  data: DataPoint[]
  width?: number
  height?: number
  showAxis?: boolean
}

export default function WeightChart({
  data,
  width = 600,
  height = 220,
  showAxis = true,
}: WeightChartProps) {
  if (!data || !data.length) return null

  const padL = 40, padR = 16, padT = 12, padB = showAxis ? 28 : 8
  const w = width, h = height

  const xs = data.map((_, i) => padL + (i / (data.length - 1)) * (w - padL - padR))
  const rawY = data.map((d) => d.last)
  const lo = Math.min(...rawY)
  const hi = Math.max(...rawY)
  const pad = (hi - lo) * 0.15 || 1
  const yMin = lo - pad, yMax = hi + pad
  const ys = rawY.map((v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB))

  let linePath = `M ${xs[0]} ${ys[0]}`
  for (let i = 1; i < xs.length; i++) {
    const px = (xs[i - 1] + xs[i]) / 2
    linePath += ` Q ${px} ${ys[i - 1]}, ${xs[i]} ${ys[i]}`
  }
  const areaPath = linePath + ` L ${xs[xs.length - 1]} ${h - padB} L ${xs[0]} ${h - padB} Z`

  const yTicks = 4
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const v = yMin + (i / (yTicks - 1)) * (yMax - yMin)
    const y = padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB)
    return { v: v.toFixed(1), y }
  })

  const lastX = xs[xs.length - 1]
  const lastY = ys[ys.length - 1]
  const uid = `wc-${width}`

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: 'visible', width: '100%', height: 'auto' }}
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56,189,248,0.45)"/>
          <stop offset="60%" stopColor="rgba(56,189,248,0.10)"/>
          <stop offset="100%" stopColor="rgba(56,189,248,0)"/>
        </linearGradient>
        <linearGradient id={`${uid}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7dd3fc"/>
          <stop offset="60%" stopColor="#38bdf8"/>
          <stop offset="100%" stopColor="#fbbf24"/>
        </linearGradient>
      </defs>

      {showAxis && yLabels.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={t.y} y2={t.y}
            stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4"/>
          <text x={padL - 8} y={t.y + 3} textAnchor="end"
            fontSize="10" fill="var(--fg-quiet)" fontFamily="var(--font-mono)">
            {t.v}
          </text>
        </g>
      ))}

      <path d={areaPath} fill={`url(#${uid}-fill)`}/>
      <path d={linePath} fill="none" stroke={`url(#${uid}-stroke)`} strokeWidth="2.5" strokeLinecap="round"/>

      {xs.map((x, i) => i % 14 === 0 && (
        <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="#38bdf8" opacity="0.5"/>
      ))}

      <circle cx={lastX} cy={lastY} r="10" fill="rgba(251,191,36,0.18)"/>
      <circle cx={lastX} cy={lastY} r="5" fill="#fbbf24" stroke="#fef3c7" strokeWidth="1.5"/>
    </svg>
  )
}
