import { Lock } from 'lucide-react'
import { type MealSlot, SLOT_META } from './types'

type Props = {
  dateStr: string
  slots: MealSlot[]
  dayTotals?: Record<string, number>
  isToday: boolean
  onSlotClick: (slot: MealSlot) => void
  onMoveSlot: (slotId: string, newDate: string) => void
}

export function PlanDayCard({ dateStr, slots, dayTotals, isToday, onSlotClick, onMoveSlot }: Props) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const dayNum = dateObj.getDate()

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const slotId = e.dataTransfer.getData('text/plain')
    if (slotId) onMoveSlot(slotId, dateStr)
  }

  return (
    <div
      className="glass plan-day-card"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ padding: 16, borderRadius: 16, minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>{dayName}</div>
        <div style={{
          fontSize: 22, fontWeight: 600, color: isToday ? 'var(--sky-400)' : 'var(--fg-primary)',
          lineHeight: 1, letterSpacing: '-0.02em',
        }}>
          {dayNum}
        </div>
        {isToday && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sky-400)', flexShrink: 0 }}/>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {slots.map((slot) => {
          const meta = SLOT_META[slot.slot] ?? { color: '#94a3b8', emoji: '🍽' }
          return (
            <button
              key={slot.id}
              draggable={!slot.locked}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', slot.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => onSlotClick(slot)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10,
                background: 'var(--glass-1)', border: `1px solid ${slot.locked ? meta.color + '44' : 'var(--glass-edge)'}`,
                textAlign: 'left', cursor: slot.locked ? 'pointer' : 'grab', width: '100%',
                transition: 'background 120ms',
              }}
            >
              <span style={{ fontSize: 13, flexShrink: 0 }}>{meta.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: meta.color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>
                  {slot.slot}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {slot.custom_name}
                </div>
              </div>
              {slot.locked && (
                <Lock size={10} style={{ color: meta.color, flexShrink: 0, opacity: 0.8 }} />
              )}
            </button>
          )
        })}
      </div>

      {dayTotals && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--glass-edge)' }}>
          {[
            { key: 'calories', label: 'cal', color: 'var(--fg-secondary)' },
            { key: 'saturated_fat_g', label: 'sat', color: 'var(--bad)' },
            { key: 'soluble_fiber_g', label: 'fib', color: 'var(--good)' },
          ].map(({ key, label, color }) => (
            <div key={key} style={{ flex: 1, textAlign: 'center' }}>
              <div className="num" style={{ fontSize: 11, fontWeight: 600, color }}>
                {key === 'calories' ? Math.round(dayTotals[key] ?? 0) : (dayTotals[key] ?? 0).toFixed(1)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
