import { handleMockApiRequest, isMockApiEnabled, MockApiError } from './mock-api'

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (isMockApiEnabled()) {
    try {
      return await handleMockApiRequest(path, init) as T
    } catch (err: any) {
      if (err instanceof MockApiError) throw new Error(err.message)
      throw err
    }
  }

  const isFormData = init?.body instanceof FormData
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      // Don't set Content-Type for multipart — the browser sets it with the boundary.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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

export interface TodayData {
  date: string
  weight: {
    latest_kg: number | null
    trend_7d: number | null
    trend_28d: number | null
    target_kg: number | null
  }
  adherence_yesterday: {
    calories: { logged: number | null; target: number | null; pct: number | null }
    sat_fat_g: { logged: number | null; target: number | null; pct: number | null }
    soluble_fiber_g: { logged: number | null; target: number | null; pct: number | null }
  }
  biometrics_latest: {
    hrv_ms: number | null
    rhr_bpm: number | null
    sleep_score: number | null
    sleep_duration_min: number | null
  }
  plan_today: Array<{
    slot: string
    name: string
    recipe_id: string | null
    logged: boolean
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
    last: number | null
    sample_count: number
  }>
}

export interface User {
  id: string
  email: string
  display_name: string
  role: string
}
