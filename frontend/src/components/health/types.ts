// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Medication {
  id: string
  name: string
  generic_name: string | null
  dose: string | null
  frequency: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  taken_today?: boolean
}

export interface Supplement {
  id: string
  name: string
  dose: string | null
  frequency: string | null
  nutrients_per_dose: Record<string, number>
  is_active: boolean
  created_at: string
  taken_today?: boolean
}

export interface InteractionAlert {
  rule_id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  message: string
}

export interface InteractionsResponse {
  alerts: InteractionAlert[]
  checked_at: string
  medications_checked: number
  meal_events_today: number
}

export interface LdlSimResult {
  baseline_ldl: number | null
  projected_ldl: number
  delta_ldl: number
  current_avg_sat_fat_pct: number
  current_avg_soluble_fiber_g: number
  target_sat_fat_pct: number
  target_soluble_fiber_g: number
  trajectory: { week: number; ldl: number }[]
  weeks: number
  note: string
}

export interface WeightSimResult {
  current_weight_kg: number
  goal_weight_kg: number | null
  target_weekly_loss_kg: number
  required_daily_deficit_kcal: number
  suggested_daily_kcal: number | null
  trajectory: { week: number; kg: number }[]
  weeks_to_goal: number | null
  weeks: number
  note: string
}

export interface ProteinSimResult {
  avg_protein_g: number | null
  target_protein_g: number | null
  body_weight_kg: number | null
  g_per_kg: number | null
  zone: 'low' | 'maintenance' | 'optimal' | 'above' | 'unknown'
  note: string
}

// ---------------------------------------------------------------------------
// Supplement nutrient fields (subset meaningful for supplements)
// ---------------------------------------------------------------------------

// Core macro-level fields shown by default. Sugar & sodium matter for gummy /
// chewable supplements, so they live alongside the other macros here.
export const SUPPLEMENT_CORE_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'calories',              label: 'Calories',         unit: 'kcal' },
  { key: 'protein_g',             label: 'Protein',          unit: 'g'    },
  { key: 'fat_g',                 label: 'Total Fat',        unit: 'g'    },
  { key: 'saturated_fat_g',       label: 'Saturated Fat',    unit: 'g'    },
  { key: 'polyunsaturated_fat_g', label: 'Poly Fat (Ω-3/6)', unit: 'g'    },
  { key: 'carbohydrates_g',       label: 'Carbohydrates',    unit: 'g'    },
  { key: 'sugars_g',              label: 'Sugar',            unit: 'g'    },
  { key: 'fiber_g',               label: 'Fiber',            unit: 'g'    },
  { key: 'soluble_fiber_g',       label: 'Soluble Fiber',    unit: 'g'    },
  { key: 'sodium_mg',             label: 'Sodium',           unit: 'mg'   },
]

// Vitamins & minerals — tucked behind a toggle to keep the panel calm.
export const SUPPLEMENT_MICRO_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'vitamin_a_mcg',         label: 'Vitamin A',        unit: 'mcg'  },
  { key: 'vitamin_c_mg',          label: 'Vitamin C',        unit: 'mg'   },
  { key: 'vitamin_d_mcg',         label: 'Vitamin D',        unit: 'mcg'  },
  { key: 'vitamin_e_mg',          label: 'Vitamin E',        unit: 'mg'   },
  { key: 'vitamin_k_mcg',         label: 'Vitamin K',        unit: 'mcg'  },
  { key: 'vitamin_b12_mcg',       label: 'Vitamin B12',      unit: 'mcg'  },
  { key: 'folate_mcg',            label: 'Folate',           unit: 'mcg'  },
  { key: 'calcium_mg',            label: 'Calcium',          unit: 'mg'   },
  { key: 'iron_mg',               label: 'Iron',             unit: 'mg'   },
  { key: 'magnesium_mg',          label: 'Magnesium',        unit: 'mg'   },
  { key: 'zinc_mg',               label: 'Zinc',             unit: 'mg'   },
  { key: 'selenium_mcg',          label: 'Selenium',         unit: 'mcg'  },
]

export const SUPPLEMENT_NUTRIENT_FIELDS = [...SUPPLEMENT_CORE_FIELDS, ...SUPPLEMENT_MICRO_FIELDS]

// ---------------------------------------------------------------------------
// Common supplement presets
// ---------------------------------------------------------------------------

export const SUPPLEMENT_PRESETS: { label: string; nutrients: Record<string, number> }[] = [
  { label: 'Fish Oil 1000 mg', nutrients: { polyunsaturated_fat_g: 0.6, fat_g: 1.0, calories: 9 } },
  { label: 'Vitamin D 1000 IU', nutrients: { vitamin_d_mcg: 25 } },
  { label: 'Vitamin D 2000 IU', nutrients: { vitamin_d_mcg: 50 } },
  { label: 'Magnesium 200 mg', nutrients: { magnesium_mg: 200 } },
  { label: 'Zinc 15 mg', nutrients: { zinc_mg: 15 } },
  { label: 'Vitamin C 500 mg', nutrients: { vitamin_c_mg: 500 } },
  { label: 'Fiber supplement 5 g', nutrients: { fiber_g: 5, soluble_fiber_g: 3.5 } },
  { label: 'B12 1000 mcg', nutrients: { vitamin_b12_mcg: 1000 } },
  { label: 'Iron 18 mg', nutrients: { iron_mg: 18 } },
  { label: 'Calcium 500 mg', nutrients: { calcium_mg: 500, vitamin_d_mcg: 6.25 } },
  { label: 'Multivitamin gummy (2)', nutrients: { calories: 15, carbohydrates_g: 4, sugars_g: 3, sodium_mg: 15, vitamin_c_mg: 30, vitamin_d_mcg: 10 } },
]
