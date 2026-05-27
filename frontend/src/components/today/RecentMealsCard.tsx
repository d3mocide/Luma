type RecentMeal = {
  id: string
  ts: string
  slot: string
  source: string
  item_count: number
  calories: number
  headline: string
}

function formatMealTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function RecentMealsCard({
  meals,
  compact,
}: {
  meals?: RecentMeal[]
  compact?: boolean
}) {
  const safeMeals = Array.isArray(meals) ? meals : []

  return (
    <div className="glass" style={{ padding: compact ? 18 : 24, marginTop: compact ? 14 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Recent meals</div>
          <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
            Latest meal logs from today.
          </div>
        </div>
      </div>

      {safeMeals.length === 0 ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: compact ? 12 : 13, margin: 0 }}>
          No meals logged yet today.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {safeMeals.map((meal) => (
            <div key={meal.id} className="glass-inset" style={{ padding: compact ? '10px 12px' : '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: compact ? 13 : 14, color: 'var(--fg-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {meal.headline}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                  {meal.slot} · {meal.source} · {meal.item_count} items
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
                  {Math.round(meal.calories)} kcal
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--fg-quiet)' }}>
                  {formatMealTime(meal.ts)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
