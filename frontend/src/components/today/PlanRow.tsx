import { Check, Plus, Sunrise, Fish, Apple, Leaf } from 'lucide-react'
import { TodayData } from '../../lib/api'

export const SLOT_COLORS: Record<string, string> = {
  breakfast: 'var(--sun-400)',
  lunch: 'var(--sky-400)',
  snack: 'var(--good)',
  dinner: 'var(--aurora-violet)',
}

function SlotIcon({ slot }: { slot: string }) {
  if (slot === 'breakfast') return <Sunrise size={16} strokeWidth={1.5} />
  if (slot === 'lunch') return <Fish size={16} strokeWidth={1.5} />
  if (slot === 'snack') return <Apple size={16} strokeWidth={1.5} />
  return <Leaf size={16} strokeWidth={1.5} />
}

export function PlanRow({
  meal,
  onLog,
  isLogging,
}: {
  meal: TodayData['plan_today'][number]
  onLog: () => void
  isLogging?: boolean
}) {
  const color = SLOT_COLORS[meal.slot] || 'var(--fg-quiet)'
  return (
    <div className="glass-inset" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11,
        background: 'var(--glass-1)',
        border: `1px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0,
      }}>
        <SlotIcon slot={meal.slot} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-quiet)',
          fontFamily: 'var(--font-mono)',
        }}>{meal.slot}</div>
        <div style={{ fontSize: 14, color: 'var(--fg-primary)', marginTop: 2 }}>
          {meal.custom_name || meal.notes || 'Planned meal'}
        </div>
      </div>
      {meal.logged ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: 'var(--good)',
          padding: '4px 10px',
          background: 'rgba(52,211,153,0.12)',
          border: '1px solid rgba(52,211,153,0.25)',
          borderRadius: 999,
        }}>
          <Check size={11} strokeWidth={2.5}/> Logged
        </span>
      ) : (
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 10px', fontSize: 11 }}
          onClick={onLog}
          disabled={!!isLogging}
        >
          <Plus size={11} strokeWidth={2}/> {isLogging ? 'Logging…' : 'Log'}
        </button>
      )}
    </div>
  )
}
