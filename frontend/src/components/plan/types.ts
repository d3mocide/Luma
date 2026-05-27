export interface MealSlot {
  id: string
  slot_date: string
  slot: string
  custom_name: string
  notes: string
  recipe_id: string | null
  food_id: string | null
  nutrition: Record<string, number>
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

export function formatWeek(dateStr: string) {
  const d = new Date(dateStr)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
