import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { addWeeks, formatWeekLabel } from './types'

interface WeekNavProps {
  selectedWeek: string
  currentWeek: string
  weeksWithPlans: Set<string>
  onChange: (week: string) => void
}

const OFFSETS = [-2, -1, 0, 1, 2]

export function WeekNav({ selectedWeek, currentWeek, weeksWithPlans, onChange }: WeekNavProps) {
  const visibleWeeks = OFFSETS.map((n) => addWeeks(selectedWeek, n))

  return (
    <div className="plan-week-nav">
      <button
        className="plan-week-nav-arrow"
        onClick={() => onChange(addWeeks(selectedWeek, -1))}
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="plan-week-nav-strip">
        {visibleWeeks.map((week, i) => {
          const isSelected = week === selectedWeek
          const isCurrent = week === currentWeek
          const hasPlan = weeksWithPlans.has(week)
          const isEdge = i === 0 || i === OFFSETS.length - 1

          return (
            <button
              key={week}
              onClick={() => onChange(week)}
              className={[
                'plan-week-tab',
                isSelected && 'selected',
                isCurrent && 'current',
                isEdge && 'edge',
              ].filter(Boolean).join(' ')}
              aria-current={isSelected ? 'true' : undefined}
              aria-label={`Week of ${formatWeekLabel(week)}${hasPlan ? ', has plan' : ''}`}
            >
              <span className="plan-week-tab-label">{formatWeekLabel(week)}</span>
              <span className={['plan-week-tab-dot', !hasPlan && 'empty'].filter(Boolean).join(' ')} />
            </button>
          )
        })}
      </div>

      <button
        className="plan-week-nav-arrow"
        onClick={() => onChange(addWeeks(selectedWeek, 1))}
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </button>

      {selectedWeek !== currentWeek && (
        <button className="plan-week-nav-today" onClick={() => onChange(currentWeek)}>
          <CalendarDays size={12} />
          Today
        </button>
      )}
    </div>
  )
}
