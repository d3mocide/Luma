import { handleMockApiRequest, isMockApiEnabled, MockApiError } from './mock-api'
import type { DraftItem } from '../components/log-sheet/types'

const BASE = '/api/v1'

const CSRF_COOKIE = 'csrf_token'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

let csrfBootstrap: Promise<unknown> | null = null

// The server issues the CSRF cookie on any response. Normally the app's first
// GET (/auth/me or /auth/setup-status) has already set it; this covers the
// rare case where a mutating request fires before any GET completes.
async function ensureCsrfToken(): Promise<string | null> {
  const existing = readCookie(CSRF_COOKIE)
  if (existing) return existing
  csrfBootstrap ??= fetch(`${BASE}/auth/setup-status`, { credentials: 'include' }).catch(() => undefined)
  await csrfBootstrap
  csrfBootstrap = null
  return readCookie(CSRF_COOKIE)
}

// Header for state-mutating requests — exported for call sites that use raw
// fetch (streaming, multipart) instead of this module's request helper.
export async function csrfHeaders(): Promise<Record<string, string>> {
  const token = await ensureCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMockApiEnabled()) {
    try {
      return await handleMockApiRequest(path, init) as T
    } catch (err) {
      if (err instanceof MockApiError) throw new Error(err.message, { cause: err })
      throw err
    }
  }

  const isFormData = init?.body instanceof FormData
  const isMutating = (init?.method ?? 'GET') !== 'GET'
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      // Don't set Content-Type for multipart — the browser sets it with the boundary.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(isMutating ? await csrfHeaders() : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecipeImportDraftIngredient {
  raw_text: string
  name: string
  quantity: number
  unit: string
  notes: string | null
  food_id: string | null
  food_name: string | null
}

export interface RecipeImportDraft {
  name: string
  description: string | null
  instructions: string[]
  prep_minutes: number | null
  cook_minutes: number | null
  servings: number
  tags: string[]
  source_url: string
  ingredients: RecipeImportDraftIngredient[]
}

export interface TodayData {
  date: string
  weight: {
    latest_kg: number | null
    trend_7d: number | null
    trend_28d: number | null
    target_kg: number | null
  }
  adherence_today: {
    calories: { logged: number | null; target: number | null; pct: number | null }
    sat_fat_g: { logged: number | null; target: number | null; pct: number | null }
    soluble_fiber_g: { logged: number | null; target: number | null; pct: number | null }
    sugars_g: { logged: number | null; target: number | null; pct: number | null }
  }
  biometrics_latest: {
    hrv_ms: number | null
    rhr_bpm: number | null
    heart_rate_avg_bpm: number | null
    sleep_score: number | null
    sleep_duration_min: number | null
    steps: number | null
    active_kcal: number | null
    bmr_kcal: number | null
    exercise_min: number | null
    respiratory_rate_bpm: number | null
    spo2_pct: number | null
    body_temp_c: number | null
  }
  plan_today: Array<{
    id: string
    plan_id: string
    slot: string
    custom_name: string | null
    notes: string | null
    recipe_id: string | null
    logged: boolean
  }>
  streak_days: number | null
  recent_meals: Array<{
    id: string
    ts: string
    slot: string
    source: string
    item_count: number
    calories: number
    headline: string
    items?: DraftItem[]
    raw_input?: string | null
  }>
  active_insight: {
    id: string
    severity: string
    headline: string
    cta: string
    thread_seed: string
  } | null
}

export interface TrendSeries {
  metric: string
  range: string
  series: Array<{
    date: string
    avg: number | null
    min: number | null
    max: number | null
    sum: number | null
    last: number | null
    sample_count: number
  }>
}

export interface Insight {
  id: string
  ts: string
  rule_id: string
  severity: string
  headline: string
  body: string
  thread_seed: string
  status: string
}

export interface DriEntry {
  rda: number
  unit: string
  direction: 'min' | 'max'
}

export type Dri = Record<string, DriEntry>

export interface User {
  id: string
  email: string
  display_name: string
  role: string
  is_password_temp?: boolean
  birth_year?: number | null
  biological_sex?: 'male' | 'female' | 'prefer_not_to_say' | null
  height_cm?: number | null
  activity_level?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | null
  dri?: Dri | null
}

// ── Family sharing ────────────────────────────────────────────────────────────

export interface FamilyGroup {
  id: string
  name: string
  created_at: string
  role: 'owner' | 'member'
  member_count: number
}

export interface FamilyMember {
  id: string
  display_name: string
  email: string
  role: 'owner' | 'member'
  joined_at: string
}

export interface FamilyGroupDetail {
  id: string
  name: string
  created_at: string
  members: FamilyMember[]
}

export type ResourceType = 'recipe' | 'favorite' | 'plan'

export interface GroupShare {
  id: string
  resource_type: ResourceType
  resource_id: string
  resource_name: string | null
  note: string | null
  shared_at: string
  shared_by_id: string
  shared_by_name: string
}

export interface MemberStatus {
  user_id: string
  display_name: string
  calories_pct: number | null
}
