export type MeasurementSystem = 'metric' | 'imperial'

export type MeasurementSettings = {
  system: MeasurementSystem
}

export type GoalSettings = {
  target_weight_kg: number | null
  target_ldl_mg_dl: number | null
  current_ldl_mg_dl: number | null
  current_ldl_drawn_at: string | null
  daily_calorie_target: number | null
  daily_sat_fat_g_max: number | null
  daily_soluble_fiber_g: number | null
  daily_protein_g_min: number | null
  dietary_pattern: string | null
}

export type GoalFormState = {
  target_weight_kg: string
  target_ldl_mg_dl: string
  current_ldl_mg_dl: string
  current_ldl_drawn_at: string
  daily_calorie_target: string
  daily_sat_fat_g_max: string
  daily_soluble_fiber_g: string
  daily_protein_g_min: string
  dietary_pattern: string
}

export const emptyGoalForm: GoalFormState = {
  target_weight_kg: '',
  target_ldl_mg_dl: '',
  current_ldl_mg_dl: '',
  current_ldl_drawn_at: '',
  daily_calorie_target: '',
  daily_sat_fat_g_max: '',
  daily_soluble_fiber_g: '',
  daily_protein_g_min: '',
  dietary_pattern: 'cholesterol-lowering',
}

export type GoalRecommendation = {
  daily_calorie_target: number
  daily_sat_fat_g_max: number
  daily_soluble_fiber_g: number
  daily_protein_g_min: number | null
  basis: {
    tdee_kcal: number | null
    bmr_7d_avg: number | null
    active_7d_avg: number | null
    current_weight_kg: number | null
    avg_steps_7d: number | null
    data_days: number
    mode: 'deficit' | 'maintenance' | 'insufficient_data'
    data_quality_warning: true | null
  }
  rationale: string | null
}

export type HaeImportSettings = {
  token: string
  app_secret: string
}

export type HaeMetrics = {
  totals: {
    attempts: number
    successes: number
    errors: number
    rows_inserted: number
  }
  last_success_at: string | null
  last_error_at: string | null
  recent_events: Array<{
    ts: string
    rows_inserted: number
    error?: string
  }>
}

export type LlmMetrics = {
  scope: string
  resets_on_restart: boolean
  totals: {
    attempts: number
    successes: number
    failures: number
    fallback_retries: number
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  model_totals?: Record<string, number>
  last_success_at: string | null
  last_failure_at: string | null
  recent_events: Array<{
    ts: string
    event: string
    model: string
    provider: string
    attempt: string
    elapsed_ms?: number
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    error_type?: string
    fallback_model?: string
    trigger?: string
  }>
}

export function toGoalFormState(goal?: Partial<GoalSettings>): GoalFormState {
  return {
    target_weight_kg: goal?.target_weight_kg?.toString() ?? '',
    target_ldl_mg_dl: goal?.target_ldl_mg_dl?.toString() ?? '',
    current_ldl_mg_dl: goal?.current_ldl_mg_dl?.toString() ?? '',
    current_ldl_drawn_at: goal?.current_ldl_drawn_at ?? '',
    daily_calorie_target: goal?.daily_calorie_target?.toString() ?? '',
    daily_sat_fat_g_max: goal?.daily_sat_fat_g_max?.toString() ?? '',
    daily_soluble_fiber_g: goal?.daily_soluble_fiber_g?.toString() ?? '',
    daily_protein_g_min: goal?.daily_protein_g_min?.toString() ?? '',
    dietary_pattern: goal?.dietary_pattern || 'cholesterol-lowering',
  }
}

export function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseOptionalInteger(value: string): number | null {
  const parsed = parseOptionalNumber(value)
  return parsed == null ? null : Math.round(parsed)
}

export function formatGoalNumber(value: number | null | undefined, decimals: number, unit: string) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const formatted = decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(Number(value)))
  return unit ? `${formatted} ${unit}` : formatted
}

export function formatMetricsDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatEventTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  }
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

// ── HAE Diagnostic ────────────────────────────────────────────────────────────

export type HaeDiagnosticStoredMetric = {
  internal_metric: string
  hae_metric: string | null
  data_points: number
  earliest_ts: string | null
  latest_ts: string | null
  latest_value: number | null
}

export type HaeDiagnostic = {
  schema: {
    standard_metrics: Record<string, string>
    aggregate_metrics: Record<string, {
      internal_name: string
      field_extracted: string
      other_fields_available: string[]
    }>
    sleep_sub_types: Record<string, string>
    sleep_v4_fields: Record<string, { internal_name: string | null; stored: boolean }>
  }
  stored_metrics: HaeDiagnosticStoredMetric[]
  known_internal_metrics_with_no_data: string[]
  unrecognised_internal_metrics_in_db: string[]
}

export type HaeAnalysisEntry = {
  hae_name: string
  units: string
  data_point_count: number
  fields_in_data: string[]
  status: 'mapped' | 'unmapped' | 'sleep_v4_partial' | 'sleep_legacy'
  internal_names: string[]
  fields_not_extracted: string[]
  field_extracted?: string
  likely_misalignment?: string
  misalignment_reason?: string
  suggestions?: string[]
}

export type HaeAnalysis = {
  metrics_in_payload: number
  metrics_mapped: number
  metrics_unmapped: number
  metrics_with_unextracted_fields: number
  analysis: HaeAnalysisEntry[]
}

export type AiConfig = {
  models: {
    meal_planner: { primary: string; fallback: string | null }
    coach_agent: { primary: string; fallback: string | null }
    food_extractor: { primary: string; fallback: string | null }
    vision_classifier: { primary: string; fallback: string | null }
    insight_narrator: { primary: string; fallback: string | null }
  }
  endpoints: {
    local_ai_api_base: string | null
    whisper_url: string | null
  }
}

