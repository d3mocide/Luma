import { useId, useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'

interface RingColor {
  from: string
  to: string
  glow: string
}

interface ActivityRingsProps {
  size?: number
  values?: number[]
  colors?: RingColor[]
  thickness?: number
  gap?: number
  animate?: boolean
}

const DEFAULT_COLORS = [
  { from: '#38bdf8', to: '#0ea5e9', glow: 'rgba(56,189,248,0.5)' },
  { from: '#fde68a', to: '#fbbf24', glow: 'rgba(251,191,36,0.5)' },
  { from: '#86efac', to: '#34d399', glow: 'rgba(52,211,153,0.5)' },
  { from: '#f472b6', to: '#ec4899', glow: 'rgba(244,114,182,0.5)' },
]

const RING_EASE = 'var(--ease-ring)'
const RING_DURATION = '1.6s'
const STAGGER = 0.1 // s between rings, outer → inner

export default function ActivityRings({
  size = 200,
  values = [0.96, 0.83, 1.10, 0.5],
  colors = DEFAULT_COLORS,
  thickness = 14,
  gap = 6,
  animate = true,
}: ActivityRingsProps) {
  const rawId = useId()
  const id = rawId.replace(/:/g, '')
  const center = size / 2
  const radii = values.map((_, i) => center - thickness / 2 - i * (thickness + gap))

  const prefersReduced = usePrefersReducedMotion()
  const still = prefersReduced || !animate

  // Fills start empty, then animate to target on the next frame. Because the
  // <circle> elements persist across renders with a stroke-dashoffset transition,
  // later data changes (e.g. after logging a meal) animate to the new value too —
  // not just the mount draw.
  const [shown, setShown] = useState(still)
  useEffect(() => {
    if (still) return
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [still])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="ring-svg"
    >
      <defs>
        {colors.map((c, i) => (
          <linearGradient key={i} id={`ring-${id}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c.from} />
            <stop offset="100%" stopColor={c.to} />
          </linearGradient>
        ))}
        {/* Native SVG glow filters. We deliberately avoid CSS filter:drop-shadow()
            here: Blink (Chrome PWA) rasterizes it in linearRGB and with a tight,
            transform-clipped filter region, which produces colour banding and hard
            rectangular edges around the glow — visible in standalone PWAs but not in
            iOS Safari. A native <filter> with sRGB interpolation and an oversized
            region renders identically across WebKit and Blink. */}
        {colors.map((c, i) => (
          <filter
            key={`glow-${i}`}
            id={`glow-${id}-${i}`}
            x="-75%" y="-75%" width="250%" height="250%"
            filterUnits="objectBoundingBox"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b1" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="b2" />
            <feMerge result="blurs">
              <feMergeNode in="b2" />
              <feMergeNode in="b1" />
            </feMerge>
            <feFlood floodColor={c.glow} result="tint" />
            <feComposite in="tint" in2="blurs" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
        {colors.map((c, i) => (
          <filter
            key={`cap-${i}`}
            id={`cap-glow-${id}-${i}`}
            x="-150%" y="-150%" width="400%" height="400%"
            filterUnits="objectBoundingBox"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b" />
            <feFlood floodColor={c.glow} result="tint" />
            <feComposite in="tint" in2="b" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>
      {values.map((v, i) => {
        const r = radii[i]
        const c = 2 * Math.PI * r
        const color = colors[i % colors.length]
        const pct = Math.min(v, 1.0)
        const overage = Math.min(Math.max(0, v - 1.0), 1.0)
        const overageColor = overage > 0.3 ? '#ef4444' : '#f59e0b'
        const delay = still ? 0 : i * STAGGER
        const capR = thickness * 0.36
        const capAngle = shown ? 360 * pct : 0

        const fillOffset = shown ? c * (1 - pct) : c
        const overageOffset = shown ? c * (1 - overage) : c

        return (
          <g key={i}>
            {/* Track */}
            <circle
              cx={center} cy={center} r={r}
              fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness}
            />
            {/* Fill */}
            <circle
              cx={center} cy={center} r={r}
              fill="none"
              stroke={`url(#ring-${id}-${i})`}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={fillOffset}
              filter={`url(#glow-${id}-${i})`}
              style={{
                transition: still ? undefined : `stroke-dashoffset ${RING_DURATION} ${RING_EASE} ${delay}s`,
              }}
            />
            {/* Overage */}
            {overage > 0 && (
              <circle
                cx={center} cy={center} r={r}
                fill="none"
                stroke={overageColor}
                strokeWidth={thickness}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={overageOffset}
                style={{
                  transition: still ? undefined : `stroke-dashoffset 0.5s ${RING_EASE} ${delay + 1.2}s`,
                }}
              />
            )}
            {/* Progress-cap light — a lit bead riding the leading edge of the arc */}
            {pct > 0.004 && (
              <g
                style={{
                  transformBox: 'view-box',
                  transformOrigin: `${center}px ${center}px`,
                  transform: `rotate(${capAngle}deg)`,
                  transition: still ? undefined : `transform ${RING_DURATION} ${RING_EASE} ${delay}s`,
                }}
              >
                <circle
                  cx={center + r} cy={center} r={capR}
                  fill={color.to}
                  filter={`url(#cap-glow-${id}-${i})`}
                />
                <circle cx={center + r} cy={center} r={capR * 0.42} fill="#fff" opacity={0.85} />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
