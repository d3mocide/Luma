// Household-measure → grams conversion for logging foods by a familiar unit
// instead of guessing grams. Volume units convert through a density hint
// inferred from the food name: most foods and sauces are water-like (~1 g/ml),
// but oils, honey, and syrups differ enough to be worth a nudge. Once a unit is
// resolved to grams, the rest of the logging pipeline is unchanged.

// A food-specific portion sourced from USDA foodPortions or an Open Food Facts
// serving — e.g. { label: "1 cup", grams: 240 }.
export type HouseholdMeasure = { label: string; grams: number }

export type PortionUnit = 'g' | 'serving' | 'tbsp' | 'tsp' | 'cup' | 'fl oz' | 'ml'

export const PORTION_UNITS: PortionUnit[] = ['g', 'serving', 'tbsp', 'tsp', 'cup', 'fl oz', 'ml']

export const PORTION_UNIT_LABELS: Record<PortionUnit, string> = {
  g: 'g',
  serving: 'serving',
  tbsp: 'tbsp',
  tsp: 'tsp',
  cup: 'cup',
  'fl oz': 'fl oz',
  ml: 'ml',
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
  const ml = ML_PER_UNIT[unit]
  if (ml == null) return quantity
  return quantity * ml * (opts.density ?? 1.0)
}

// Quick-pick presets per unit, sized to typical real-world portions.
export const PRESETS_BY_UNIT: Record<PortionUnit, number[]> = {
  g: [50, 100, 150, 200],
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
