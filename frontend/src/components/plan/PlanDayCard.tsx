import { type MealSlot, SLOT_META } from './types'

type Props = {
  dateStr: string
  slots: MealSlot[]
  dayTotals?: Record<string, number>
  isToday: boolean
  onSlotClick: (slot: MealSlot) => void
}

export function PlanDayCard({ dateStr, slots, dayTotals, isToday, onSlotClick }: Props) {
  return (
    <div className={`glass plan-day-card ${isToday ? 'is-today' : ''}`}
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className={`eyebrow plan-day-label ${isToday ? 'is-today' : ''}`}>
            {new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
          <div className="num" style={{ fontSize: 22, fontWeight: 400, letterSpacing: '-0.02em', marginTop: 2, color: 'var(--fg-primary)' }}>
            {new Date(dateStr).getDate()}
          </div>
        </div>
        {isToday && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--sky-400)', boxShadow: '0 0 8px var(--sky-400)' }}/>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {slots.map((slot, j) => {
          const meta = SLOT_META[slot.slot] ?? { color: '#94a3b8', emoji: '🍽' }
          return (
            <button key={j} onClick={() => onSlotClick(slot)}
              className="glass-inset plan-slot-btn"
              style={{ padding: '8px 10px', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4,
                cursor: 'pointer', border: 'none', textAlign: 'left', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, color: meta.color }}>{meta.emoji}</span>
                <span className="plan-slot-type">{slot.slot}</span>
              </div>
              <div className="plan-slot-name">{slot.custom_name}</div>
            </button>
          )
        })}
      </div>

      {dayTotals && (
        <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>cal</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--fg-secondary)' }}>{Math.round(dayTotals.calories ?? 0)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>sat fat</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--bad)' }}>{(dayTotals.saturated_fat_g ?? 0).toFixed(1)}g</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>sol fib</span>
            <span className="num" style={{ fontSize: 11, color: 'var(--good)' }}>{(dayTotals.soluble_fiber_g ?? 0).toFixed(1)}g</span>
          </div>
        </div>
      )}
    </div>
  )
}
