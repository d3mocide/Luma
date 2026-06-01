export interface MealSlot {
  id: string
  slot_date: string
  slot: string
  custom_name: string | null
  notes: string
  recipe_id: string | null
  food_id: string | null
  nutrition: Record<string, number>
  locked: boolean
}

export interface RecipeIngredient {
  food_id: string | null
  food_name: string | null
  quantity: number
  unit: string
  notes: string | null
  sort_order: number
}

export interface Recipe {
  id: string
  name: string
  description: string | null
  instructions: string[]
  prep_minutes: number | null
  cook_minutes: number | null
  servings: number
  tags: string[]
  nutrition_per_serving: Record<string, number>
  ingredients: RecipeIngredient[]
  created_at: string
}

export interface PlanData {
  id: string
  week_start: string
  status: string
  slots: MealSlot[]
  day_totals: Record<string, Record<string, number>>
}

export interface FoodResult {
  id: string
  name: string
  brand: string | null
  serving_size_g: number | null
  nutrients_per_100g: Record<string, number>
}

export interface WeekSummary {
  week_start: string
  status: 'active' | 'archived'
}

export interface ShoppingItem {
  food_id: string
  name: string
  brand: string | null
  quantity: number
  unit: string
  aisle: string | null
  purchased: boolean
}

export const SLOT_META: Record<string, { color: string; emoji: string }> = {
  breakfast: { color: '#fbbf24', emoji: '☀' },
  lunch:     { color: '#38bdf8', emoji: '🐟' },
  snack:     { color: '#34d399', emoji: '🍎' },
  dinner:    { color: '#a78bfa', emoji: '🌿' },
}

export const KEY_NUTRIENTS = [
  { key: 'calories',        label: 'Cal',     unit: '',   color: 'var(--fg-primary)' },
  { key: 'saturated_fat_g', label: 'Sat Fat', unit: 'g',  color: 'var(--bad)' },
  { key: 'soluble_fiber_g', label: 'Sol Fib', unit: 'g',  color: 'var(--good)' },
  { key: 'protein_g',       label: 'Protein', unit: 'g',  color: '#a78bfa' },
]

export function fmtNutr(val: number | undefined, unit: string, decimals = 1): string {
  if (val === undefined || val === null) return '—'
  const n = Number(val)
  if (isNaN(n)) return '—'
  return unit === '' ? String(Math.round(n)) : `${n.toFixed(decimals)}${unit}`
}

export function computeNutrition(food: FoodResult, servingG: number): Record<string, number> {
  const factor = servingG / 100
  const out: Record<string, number> = {}
  for (const { key } of KEY_NUTRIENTS) {
    out[key] = Math.round((food.nutrients_per_100g[key] ?? 0) * factor * 10) / 10
  }
  return out
}

export function groupByDate(slots: MealSlot[]) {
  const out: Record<string, MealSlot[]> = {}
  slots.forEach((s) => {
    if (!out[s.slot_date]) out[s.slot_date] = []
    out[s.slot_date].push(s)
  })
  return out
}

/** Returns the ISO date (YYYY-MM-DD) of the Sunday that starts the user's current local week. */
export function getWeekSunday(): string {
  const now = new Date()
  const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
}

/** Add/subtract whole weeks from a YYYY-MM-DD week-start string. */
export function addWeeks(weekStart: string, n: number): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const date = new Date(y, m - 1, d + n * 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Short label for week-nav tabs, e.g. "Jun 1". */
export function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatWeek(dateStr: string) {
  const d = new Date(dateStr)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
