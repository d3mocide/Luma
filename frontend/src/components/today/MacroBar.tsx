import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion'

// Calorie/protein gauge fill. Animates from empty on mount and transitions to the
// new width when the value changes (e.g. after logging), matching the rings' curve
// and duration so the whole card reads as one coordinated motion.
export function MacroBar({ pct, color, glow, height = 4, marginTop = 8 }: {
  pct: number; color: string; glow: string; height?: number; marginTop?: number
}) {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(reduced)

  useEffect(() => {
    if (reduced) return
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [reduced])

  const width = shown ? `${Math.min(pct, 100)}%` : '0%'

  return (
    <div style={{ marginTop, height, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div
        className="macro-bar-fill"
        style={{
          width,
          height: '100%',
          borderRadius: 999,
          background: color,
          boxShadow: glow,
          transition: reduced
            ? 'background 400ms, box-shadow 400ms'
            : 'width 1.6s var(--ease-ring), background 400ms, box-shadow 400ms',
        }}
      />
    </div>
  )
}
