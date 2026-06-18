// Canonical nutrient keys, mirroring the backend ZERO_NUTRIENTS set
// (luma/services/nutrition.py). Centralising these means meal items carry the
// full vitamin/mineral profile end-to-end instead of being truncated to a
// handful of macros — which is what kept micronutrients out of Today's Nutrition.

export const NUTRIENT_KEYS = [
  // Core macros
  'calories', 'protein_g', 'fat_g', 'saturated_fat_g', 'monounsaturated_fat_g',
  'polyunsaturated_fat_g', 'trans_fat_g', 'cholesterol_mg', 'carbohydrates_g',
  'sugars_g', 'added_sugars_g', 'fiber_g', 'soluble_fiber_g', 'sodium_mg', 'potassium_mg',
  // Minerals
  'calcium_mg', 'iron_mg', 'magnesium_mg', 'phosphorus_mg', 'zinc_mg', 'selenium_mcg',
  // Vitamins
  'vitamin_a_mcg', 'vitamin_c_mg', 'vitamin_d_mcg', 'vitamin_e_mg', 'vitamin_k_mcg',
  'thiamin_mg', 'riboflavin_mg', 'niacin_mg', 'vitamin_b6_mg', 'folate_mcg', 'vitamin_b12_mcg',
] as const

export type NutrientKey = typeof NUTRIENT_KEYS[number]
export type Nutrients = Record<NutrientKey, number>

export function emptyNutrients(): Nutrients {
  const out = {} as Nutrients
  for (const k of NUTRIENT_KEYS) out[k] = 0
  return out
}

// Coerce a loose/partial nutrient map (saved favorites, LLM extraction, mocks)
// into the full canonical shape, defaulting missing keys to 0.
export function toNutrients(src: Record<string, number> | undefined | null): Nutrients {
  const out = emptyNutrients()
  if (src) for (const k of NUTRIENT_KEYS) out[k] = src[k] ?? 0
  return out
}

// Scale a per-100g nutrient profile to an absolute gram weight.
export function scaleNutrients(per100g: Record<string, number>, grams: number): Nutrients {
  const f = grams / 100
  const out = emptyNutrients()
  for (const k of NUTRIENT_KEYS) out[k] = (per100g[k] ?? 0) * f
  return out
}

export function scaleByRatio(n: Nutrients, ratio: number): Nutrients {
  const out = emptyNutrients()
  for (const k of NUTRIENT_KEYS) out[k] = n[k] * ratio
  return out
}

// Sum the nutrients across a list of items into the full canonical shape.
export function sumNutrients(items: { nutrients: Record<string, number> }[]): Nutrients {
  const out = emptyNutrients()
  for (const it of items) {
    for (const k of NUTRIENT_KEYS) out[k] += it.nutrients[k] ?? 0
  }
  return out
}
