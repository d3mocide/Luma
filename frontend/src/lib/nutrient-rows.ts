// Display row definitions for the nutrient breakdown table, shared by the
// breakdown list (rendering), the coverage/deficiency logic, and per-nutrient
// trend lookups. Keeping the row set and labels in one place stops the table and
// the analytics from drifting apart.

export interface NutrientRow {
  key: string
  label: string
  unit: string
  indent?: boolean
}

export const MACRO_ROWS: NutrientRow[] = [
  { key: 'calories',              label: 'Calories',              unit: 'kcal' },
  { key: 'protein_g',             label: 'Protein',               unit: 'g' },
  { key: 'fat_g',                 label: 'Total Fat',             unit: 'g' },
  { key: 'saturated_fat_g',       label: 'Saturated Fat',         unit: 'g',  indent: true },
  { key: 'monounsaturated_fat_g', label: 'Monounsaturated Fat',   unit: 'g',  indent: true },
  { key: 'polyunsaturated_fat_g', label: 'Polyunsaturated Fat',   unit: 'g',  indent: true },
  { key: 'trans_fat_g',           label: 'Trans Fat',             unit: 'g',  indent: true },
  { key: 'cholesterol_mg',        label: 'Cholesterol',           unit: 'mg' },
  { key: 'carbohydrates_g',       label: 'Carbohydrates',         unit: 'g' },
  { key: 'fiber_g',               label: 'Total Fiber',           unit: 'g',  indent: true },
  { key: 'soluble_fiber_g',       label: 'Soluble Fiber',         unit: 'g',  indent: true },
  { key: 'sugars_g',              label: 'Sugars',                unit: 'g',  indent: true },
  { key: 'added_sugars_g',        label: 'Added Sugars',          unit: 'g',  indent: true },
  { key: 'sodium_mg',             label: 'Sodium',                unit: 'mg' },
  { key: 'potassium_mg',          label: 'Potassium',             unit: 'mg' },
]

export const VITAMIN_ROWS: NutrientRow[] = [
  { key: 'vitamin_a_mcg',   label: 'Vitamin A',    unit: 'mcg' },
  { key: 'vitamin_c_mg',    label: 'Vitamin C',    unit: 'mg' },
  { key: 'vitamin_d_mcg',   label: 'Vitamin D',    unit: 'mcg' },
  { key: 'vitamin_e_mg',    label: 'Vitamin E',    unit: 'mg' },
  { key: 'vitamin_k_mcg',   label: 'Vitamin K',    unit: 'mcg' },
  { key: 'thiamin_mg',      label: 'Thiamin (B1)', unit: 'mg' },
  { key: 'riboflavin_mg',   label: 'Riboflavin (B2)', unit: 'mg' },
  { key: 'niacin_mg',       label: 'Niacin (B3)',  unit: 'mg' },
  { key: 'vitamin_b6_mg',   label: 'Vitamin B6',   unit: 'mg' },
  { key: 'folate_mcg',      label: 'Folate',       unit: 'mcg' },
  { key: 'vitamin_b12_mcg', label: 'Vitamin B12',  unit: 'mcg' },
]

export const MINERAL_ROWS: NutrientRow[] = [
  { key: 'calcium_mg',    label: 'Calcium',    unit: 'mg' },
  { key: 'iron_mg',       label: 'Iron',       unit: 'mg' },
  { key: 'magnesium_mg',  label: 'Magnesium',  unit: 'mg' },
  { key: 'phosphorus_mg', label: 'Phosphorus', unit: 'mg' },
  { key: 'zinc_mg',       label: 'Zinc',       unit: 'mg' },
  { key: 'selenium_mcg',  label: 'Selenium',   unit: 'mcg' },
]

// Keys that only arrive from search/barcode logs (not voice/text/photo). Used to
// dim rows with no data so a blank micronutrient reads as "not captured" rather
// than "you ate zero".
export const EXTENDED_KEYS = new Set([
  ...VITAMIN_ROWS.map(r => r.key),
  ...MINERAL_ROWS.map(r => r.key),
  'monounsaturated_fat_g', 'polyunsaturated_fat_g', 'trans_fat_g', 'cholesterol_mg',
])

// Micronutrients (vitamins + minerals) — the set scored for nutrient coverage.
export const MICRONUTRIENT_ROWS: NutrientRow[] = [...VITAMIN_ROWS, ...MINERAL_ROWS]

export const NUTRIENT_LABELS: Record<string, NutrientRow> = Object.fromEntries(
  [...MACRO_ROWS, ...VITAMIN_ROWS, ...MINERAL_ROWS].map(r => [r.key, r]),
)

export function fmtNutrient(val: number, unit: string): string {
  if (unit === 'kcal') return Math.round(val).toString()
  if (val < 0.1 && val > 0) return val.toFixed(2)
  if (val < 10) return val.toFixed(1)
  return Math.round(val).toString()
}
