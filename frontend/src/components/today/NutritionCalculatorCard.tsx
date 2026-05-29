import { Plus } from 'lucide-react'
import { TodayData } from '../../lib/api'

export type QuickFood = {
  id: string
  name: string
  caloriesPer100g: number
  proteinPer100g: number
  fatPer100g: number
  satFatPer100g: number
  carbsPer100g: number
  fiberPer100g: number
  solubleFiberPer100g: number
  sodiumMgPer100g: number
}

export const QUICK_FOODS: QuickFood[] = [
  { id: 'oats',    name: 'Steel cut oats',  caloriesPer100g: 71,  proteinPer100g: 2.5, fatPer100g: 1.4,  satFatPer100g: 0.2, carbsPer100g: 12.0, fiberPer100g: 1.7, solubleFiberPer100g: 1.1, sodiumMgPer100g: 0 },
  { id: 'beans',   name: 'Black beans',      caloriesPer100g: 132, proteinPer100g: 8.7, fatPer100g: 0.5,  satFatPer100g: 0.1, carbsPer100g: 24.0, fiberPer100g: 8.7, solubleFiberPer100g: 1.8, sodiumMgPer100g: 238 },
  { id: 'salmon',  name: 'Salmon',           caloriesPer100g: 206, proteinPer100g: 20.0, fatPer100g: 13.0, satFatPer100g: 3.1, carbsPer100g: 0.0,  fiberPer100g: 0.0, solubleFiberPer100g: 0.0, sodiumMgPer100g: 59 },
  { id: 'avocado', name: 'Avocado',          caloriesPer100g: 160, proteinPer100g: 2.0, fatPer100g: 15.0, satFatPer100g: 2.1, carbsPer100g: 9.0,  fiberPer100g: 6.7, solubleFiberPer100g: 1.7, sodiumMgPer100g: 7 },
  { id: 'lentils', name: 'Cooked lentils',   caloriesPer100g: 116, proteinPer100g: 9.0, fatPer100g: 0.4,  satFatPer100g: 0.1, carbsPer100g: 20.0, fiberPer100g: 7.9, solubleFiberPer100g: 1.4, sodiumMgPer100g: 238 },
]

export function round1(value: number) {
  return Math.round(value * 10) / 10
}

function BudgetStat({
  label,
  remaining,
  projected,
  unit,
  lowerIsBetter,
}: {
  label: string
  remaining: number
  projected: number
  unit: string
  lowerIsBetter: boolean
}) {
  const bad = lowerIsBetter ? projected < 0 : projected < 0
  return (
    <div className="glass-inset" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 20, color: bad ? 'var(--bad)' : 'var(--fg-primary)' }}>
          {remaining}
        </span>
        <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: bad ? 'var(--bad)' : 'var(--fg-quiet)' }}>
        after add: <span className="num">{projected}</span> {unit}
      </div>
    </div>
  )
}

export function NutritionCalculatorCard({
  adherence,
  selectedFoodId,
  servingG,
  onFoodChange,
  onServingChange,
  onAdd,
  isAdding,
  compact,
}: {
  adherence: TodayData['adherence_today']
  selectedFoodId: string
  servingG: string
  onFoodChange: (foodId: string) => void
  onServingChange: (grams: string) => void
  onAdd: () => void
  isAdding?: boolean
  compact?: boolean
}) {
  const food = QUICK_FOODS.find((f) => f.id === selectedFoodId) ?? QUICK_FOODS[0]
  const grams = Math.max(1, Number(servingG) || 0)
  const factor = grams / 100

  const addCalories = round1(food.caloriesPer100g * factor)
  const addSatFat = round1(food.satFatPer100g * factor)
  const addSolFiber = round1(food.solubleFiberPer100g * factor)

  const calTarget = adherence.calories.target ?? 0
  const satTarget = adherence.sat_fat_g.target ?? 0
  const solTarget = adherence.soluble_fiber_g.target ?? 0

  const calLogged = adherence.calories.logged ?? 0
  const satLogged = adherence.sat_fat_g.logged ?? 0
  const solLogged = adherence.soluble_fiber_g.logged ?? 0

  const calRemain = round1(calTarget - calLogged)
  const satRemain = round1(satTarget - satLogged)
  const solRemain = round1(solTarget - solLogged)

  const calProjected = round1(calRemain - addCalories)
  const satProjected = round1(satRemain - addSatFat)
  const solProjected = round1(solRemain - addSolFiber)

  return (
    <div className="glass" style={{ padding: compact ? 18 : 24, marginTop: compact ? 14 : 0, marginBottom: compact ? 14 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Remaining today</div>
          <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
            Quick estimate before you log.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
        <BudgetStat label="Calories" remaining={calRemain} projected={calProjected} unit="kcal" lowerIsBetter={false} />
        <BudgetStat label="Sat fat" remaining={satRemain} projected={satProjected} unit="g" lowerIsBetter />
        <BudgetStat label="Sol fiber" remaining={solRemain} projected={solProjected} unit="g" lowerIsBetter={false} />
      </div>

      <div className="glass-inset" style={{ padding: compact ? 10 : 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.3fr 0.7fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Food
            </span>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px',
              borderRadius: 10, border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
            }}>
              {QUICK_FOODS.map((item) => {
                const active = item.id === selectedFoodId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFoodChange(item.id)}
                    className="btn"
                    style={{
                      padding: '6px 10px', fontSize: 12, borderRadius: 999,
                      border: active ? '1px solid var(--sky-400)' : '1px solid var(--glass-edge)',
                      background: active ? 'rgba(56,189,248,0.16)' : 'var(--glass-2)',
                      color: active ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                    }}
                  >
                    {item.name}
                  </button>
                )
              })}
            </div>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Serving (g)
            </span>
            <input
              type="number"
              min={1}
              value={servingG}
              onChange={(e) => onServingChange(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                color: 'var(--fg-primary)', fontSize: 13,
              }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
            Adds <span className="num">{addCalories}</span> kcal · <span className="num">{addSatFat}</span>g sat fat · <span className="num">{addSolFiber}</span>g soluble fiber
          </div>
          <button className="btn" onClick={onAdd} disabled={!!isAdding} style={{ padding: '8px 12px', fontSize: 12 }}>
            <Plus size={12} strokeWidth={2} /> {isAdding ? 'Adding…' : 'Add to log'}
          </button>
        </div>
      </div>
    </div>
  )
}
