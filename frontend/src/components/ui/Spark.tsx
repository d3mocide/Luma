interface SparkProps {
  data: Array<number | { last: number }>
  w?: number
  h?: number
  color?: string
}

export default function Spark({ data, w = 120, h = 36, color = '#38bdf8' }: SparkProps) {
  if (!data || !data.length) return null

  const xs = data.map((_, i) => (i / (data.length - 1)) * w)
  const rawY = data.map((d) => (typeof d === 'number' ? d : d.last))
  const lo = Math.min(...rawY)
  const hi = Math.max(...rawY)
  const ys = rawY.map((v) => h - ((v - lo) / (hi - lo || 1)) * (h - 4) - 2)

  let d = `M ${xs[0]} ${ys[0]}`
  for (let i = 1; i < xs.length; i++) d += ` L ${xs[i]} ${ys[i]}`
  const area = d + ` L ${xs[xs.length - 1]} ${h} L 0 ${h} Z`

  const gid = `spark-${color.replace(/[^a-z0-9]/gi, '')}-${w}`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
