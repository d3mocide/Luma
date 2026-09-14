// Household-measure → grams conversion for logging foods by a familiar unit
// instead of guessing grams. Volume units convert through a density hint
// inferred from the food name: most foods and sauces are water-like (~1 g/ml),
// but oils, honey, and syrups differ enough to be worth a nudge. Once a unit is
// resolved to grams, the rest of the logging pipeline is unchanged.

// A food-specific portion sourced from USDA foodPortions or an Open Food Facts
// serving — e.g. { label: "1 cup", grams: 240 }.
export type HouseholdMeasure = { label: string; grams: number }

export type PortionUnit = 'g' | 'oz' | 'lb' | 'serving' | 'tbsp' | 'tsp' | 'cup' | 'fl oz' | 'ml'

export const PORTION_UNITS: PortionUnit[] = ['g', 'oz', 'lb', 'serving', 'tbsp', 'tsp', 'cup', 'fl oz', 'ml']

export const PORTION_UNIT_LABELS: Record<PortionUnit, string> = {
  g: 'g',
  oz: 'oz',
  lb: 'lb',
  serving: 'serving',
  tbsp: 'tbsp',
  tsp: 'tsp',
  cup: 'cup',
  'fl oz': 'fl oz',
  ml: 'ml',
}

// Weight units in grams — mass is mass, so these are density-independent.
const GRAMS_PER_WEIGHT_UNIT: Partial<Record<PortionUnit, number>> = {
  oz: 28.3495,
  lb: 453.592,
}

// US customary volume units in milliliters.
const ML_PER_UNIT: Partial<Record<PortionUnit, number>> = {
  ml: 1,
  tsp: 4.93,
  tbsp: 14.79,
  'fl oz': 29.57,
  cup: 236.59,
}

// Density hints (g/ml) matched against the food name. Default is water-like.
const DENSITY_HINTS: { match: RegExp; density: number }[] = [
  { match: /\boils?\b|olive oil|canola|vegetable oil/i, density: 0.92 },
  { match: /honey/i, density: 1.42 },
  { match: /syrup|molasses|agave/i, density: 1.37 },
]

export function densityForFood(name: string): number {
  for (const hint of DENSITY_HINTS) {
    if (hint.match.test(name)) return hint.density
  }
  return 1.0
}

type ConvertOpts = { density?: number; servingSizeG?: number }

export function unitToGrams(quantity: number, unit: PortionUnit, opts: ConvertOpts = {}): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  if (unit === 'g') return quantity
  if (unit === 'serving') return quantity * (opts.servingSizeG || 100)
  const grams = GRAMS_PER_WEIGHT_UNIT[unit]
  if (grams != null) return quantity * grams
  const ml = ML_PER_UNIT[unit]
  if (ml == null) return quantity
  return quantity * ml * (opts.density ?? 1.0)
}

// Minimal shape needed to resolve a food + unit + quantity into grams: the
// name drives the density hint, serving_size_g backs the "serving" unit, and
// household_measures back the "hm:<index>" pseudo-units.
export type FoodForPortion = {
  name: string
  serving_size_g?: number | null
  household_measures?: HouseholdMeasure[]
}

// Resolve a (food, unit, quantity) tuple to grams. Handles the "hm:<index>"
// household-measure pseudo-unit (e.g. "1 cup" = 240 g) and otherwise defers to
// unitToGrams with the food's density hint and serving size.
export function gramsForFoodUnit(food: FoodForPortion, unit: string, qty: number): number {
  if (unit.startsWith('hm:')) {
    const m = food.household_measures?.[Number(unit.slice(3))]
    return m ? qty * m.grams : qty
  }
  return unitToGrams(qty, unit as PortionUnit, {
    density: densityForFood(food.name),
    servingSizeG: food.serving_size_g ?? undefined,
  })
}

// Quick-pick presets per unit, sized to typical real-world portions.
export const PRESETS_BY_UNIT: Record<PortionUnit, number[]> = {
  g: [50, 100, 150, 200],
  oz: [2, 4, 8, 16],
  lb: [1, 2, 4, 8],
  serving: [0.5, 1, 1.5, 2],
  tbsp: [1, 2, 3, 4],
  tsp: [1, 2, 3, 4],
  cup: [0.25, 0.5, 1, 2],
  'fl oz': [1, 2, 4, 8],
  ml: [50, 100, 200, 250],
}

export function defaultQtyForUnit(unit: PortionUnit, servingSizeG?: number): number {
  if (unit === 'g') return servingSizeG ? Math.round(servingSizeG) : 100
  if (unit === 'ml') return 100
  return 1
}

// ── Carrying the chosen measure forward ──────────────────────────────────────
// Once a portion resolves to grams the pipeline works in grams, but the unit the
// user picked is what they recognize ("1 cup", not "237 g"). These helpers keep
// that measure usable after the fact: grams stay authoritative, and the quantity
// is re-derived from them so a weight edit and the displayed measure never drift.

// Units that say nothing the gram readout doesn't already say.
export function isGramUnit(unit: string | null | undefined): boolean {
  const u = unit?.trim().toLowerCase()
  return !u || u === 'g' || u === 'gram' || u === 'grams'
}

// Grams in a single `unit`, back-calculated from the portion as it was chosen.
// Null when the pair can't anchor a conversion (no quantity, or grams unknown).
export function gramsPerUnit(
  quantity: number | null | undefined,
  totalGrams: number | null | undefined,
): number | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null
  if (totalGrams == null || !Number.isFinite(totalGrams) || totalGrams <= 0) return null
  return totalGrams / quantity
}

// Render a quantity the way a person would type it: 1, 1.5, 0.25 — never 1.0000001.
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return '0'
  const rounded = Math.round(qty * 100) / 100
  return String(rounded)
}

// One-line label for a portion, e.g. "2 cup". Empty when there's nothing to add
// beyond the gram weight.
export function measureLabel(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return ''
  if (isGramUnit(unit)) return ''
  return `${formatQuantity(quantity)} ${unit}`
}

// USDA ships household measures as a label with the count baked in — "1 cup",
// "0.5 cup", "3 oz". Split it so the count can be folded into the grams-per-unit
// and the portion reads as "2 cup" instead of "2 × 1 cup".
export function splitMeasureLabel(label: string): { count: number; unit: string } {
  const trimmed = label.trim()
  const m = trimmed.match(/^(\d*\.?\d+)\s+(.+)$/)
  if (!m) return { count: 1, unit: trimmed }
  const count = parseFloat(m[1])
  if (!Number.isFinite(count) || count <= 0) return { count: 1, unit: trimmed }
  return { count, unit: m[2].trim() }
}

// Resolve a picked portion into the fields a draft item carries: the count, a
// clean unit name, and the grams in one of that unit. unit_grams is what lets
// the portion be shown and edited in that unit later instead of in grams.
export function draftPortion(
  food: FoodForPortion,
  unit: string,
  qty: number,
): { quantity: number; unit: string; unit_grams?: number } {
  if (unit.startsWith('hm:')) {
    const measure = food.household_measures?.[Number(unit.slice(3))]
    if (!measure) return { quantity: qty, unit: 'serving' }
    const { count, unit: name } = splitMeasureLabel(measure.label)
    return { quantity: qty * count, unit: name, unit_grams: measure.grams / count }
  }
  if (isGramUnit(unit)) return { quantity: qty, unit: 'g' }
  return { quantity: qty, unit, unit_grams: gramsForFoodUnit(food, unit, 1) }
}
