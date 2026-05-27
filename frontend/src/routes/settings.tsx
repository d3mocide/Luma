import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, User } from '../lib/api'
import { useUIStore } from '../stores'

type MeasurementSystem = 'metric' | 'imperial'

type MeasurementSettings = {
  system: MeasurementSystem
}

type GoalSettings = {
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

type GoalFormState = {
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

const emptyGoalForm: GoalFormState = {
  target_weight_kg: '',
  target_ldl_mg_dl: '',
  current_ldl_mg_dl: '',
  current_ldl_drawn_at: '',
  daily_calorie_target: '',
  daily_sat_fat_g_max: '',
  daily_soluble_fiber_g: '',
  daily_protein_g_min: '',
  dietary_pattern: '',
}

type LlmMetrics = {
  scope: string
  resets_on_restart: boolean
  totals: {
    attempts: number
    successes: number
    failures: number
    fallback_retries: number
  }
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
  }>
}

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const theme = useUIStore((state) => state.theme)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [goalSaveError, setGoalSaveError] = useState<string | null>(null)
  const [goalSaveSuccess, setGoalSaveSuccess] = useState<string | null>(null)
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm)

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
  })

  const {
    data: measurementSettings,
    isLoading: measurementLoading,
  } = useQuery<MeasurementSettings>({
    queryKey: ['settings', 'measurements'],
    queryFn: () => api.get('/settings/measurements'),
  })

  const { data: goalSettings, isLoading: goalLoading } = useQuery<Partial<GoalSettings>>({
    queryKey: ['settings', 'goals'],
    queryFn: () => api.get('/goals'),
  })

  const { data: llmMetrics, isLoading: llmMetricsLoading, refetch: refetchLlmMetrics } = useQuery<LlmMetrics>({
    queryKey: ['settings', 'llm-metrics'],
    queryFn: () => api.get('/settings/llm-metrics'),
    refetchInterval: 15000,
  })

  const measurementMutation = useMutation({
    mutationFn: (system: MeasurementSystem) =>
      api.put<MeasurementSettings>('/settings/measurements', { system }),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'measurements'], data)
    },
  })

  const goalMutation = useMutation({
    mutationFn: (payload: GoalSettings) => api.put<GoalSettings>('/goals', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'goals'], data)
      setGoalSaveError(null)
      setGoalSaveSuccess('Goals saved.')
      window.setTimeout(() => setGoalSaveSuccess(null), 2500)
    },
    onError: (err: Error) => {
      setGoalSaveError(err.message || 'Could not save goals. Please try again.')
      setGoalSaveSuccess(null)
    },
  })

  const measurementSystem = measurementSettings?.system ?? 'metric'

  useEffect(() => {
    setGoalForm(toGoalFormState(goalSettings))
  }, [goalSettings])

  const setMeasurementSystem = (system: MeasurementSystem) => {
    if (measurementMutation.isPending || system === measurementSystem) return
    measurementMutation.mutate(system)
  }

  const handleLogout = async () => {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      await queryClient.invalidateQueries({ queryKey: ['today'] })
      window.location.assign('/')
    } catch (err: any) {
      setLogoutError(err?.message ?? 'Failed to sign out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  const handleGoalChange = (field: keyof GoalFormState, value: string) => {
    setGoalSaveError(null)
    setGoalSaveSuccess(null)
    setGoalForm((current) => ({ ...current, [field]: value }))
  }

  const handleGoalSubmit = () => {
    setGoalSaveError(null)
    setGoalSaveSuccess(null)
    goalMutation.mutate({
      target_weight_kg: parseOptionalNumber(goalForm.target_weight_kg),
      target_ldl_mg_dl: parseOptionalInteger(goalForm.target_ldl_mg_dl),
      current_ldl_mg_dl: parseOptionalInteger(goalForm.current_ldl_mg_dl),
      current_ldl_drawn_at: goalForm.current_ldl_drawn_at.trim() || null,
      daily_calorie_target: parseOptionalInteger(goalForm.daily_calorie_target),
      daily_sat_fat_g_max: parseOptionalNumber(goalForm.daily_sat_fat_g_max),
      daily_soluble_fiber_g: parseOptionalNumber(goalForm.daily_soluble_fiber_g),
      daily_protein_g_min: parseOptionalNumber(goalForm.daily_protein_g_min),
      dietary_pattern: goalForm.dietary_pattern.trim() || null,
    })
  }

  return (
    <div className="thin-scroll settings-page" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>
      <header className="mobile-hero settings-hero" style={{ marginBottom: 28 }}>
        <div className="mobile-hero-content">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Settings</div>
          <h1 className="mobile-hero-title" style={{ margin: 0, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your account
          </h1>
          <p className="mobile-hero-subcopy settings-hero-subcopy" style={{ margin: '8px 0 0', color: 'var(--fg-tertiary)', fontSize: 14 }}>
            Manage your profile, units, and process health from one place.
          </p>
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-stack settings-primary">
          <div className="glass settings-card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Account</div>
            {user ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <Row label="Name" value={user.display_name}/>
                <Row label="Email" value={user.email}/>
                <Row label="Role" value={user.role} last/>
              </div>
            ) : (
              <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>Not signed in</p>
            )}
          </div>

          <div className="glass settings-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Goals</div>
                <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
                  Your weight, LDL, and macro targets for the current phase.
                </p>
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-quiet)', textAlign: 'right', paddingTop: 2 }}>
                {goalLoading ? 'Loading…' : goalSettings ? 'Synced' : 'Unset'}
              </div>
            </div>

            <div className="settings-goals-summary">
              <SummaryPill label="Target weight" value={formatGoalNumber(goalSettings?.target_weight_kg, 1, 'kg')} />
              <SummaryPill label="Target LDL" value={formatGoalNumber(goalSettings?.target_ldl_mg_dl, 0, 'mg/dL')} />
              <SummaryPill label="Calories" value={formatGoalNumber(goalSettings?.daily_calorie_target, 0, 'kcal')} />
              <SummaryPill label="Sat fat max" value={formatGoalNumber(goalSettings?.daily_sat_fat_g_max, 1, 'g')} />
            </div>

            <div className="settings-goals-grid">
              <Field label="Target weight" unit="kg">
                <input
                  value={goalForm.target_weight_kg}
                  onChange={(e) => handleGoalChange('target_weight_kg', e.target.value)}
                  className="field-input"
                  inputMode="decimal"
                  placeholder="78.4"
                />
              </Field>
              <Field label="Target LDL" unit="mg/dL">
                <input
                  value={goalForm.target_ldl_mg_dl}
                  onChange={(e) => handleGoalChange('target_ldl_mg_dl', e.target.value)}
                  className="field-input"
                  inputMode="numeric"
                  placeholder="100"
                />
              </Field>
              <Field label="Current LDL" unit="mg/dL">
                <input
                  value={goalForm.current_ldl_mg_dl}
                  onChange={(e) => handleGoalChange('current_ldl_mg_dl', e.target.value)}
                  className="field-input"
                  inputMode="numeric"
                  placeholder="132"
                />
              </Field>
              <Field label="LDL drawn" unit="date">
                <input
                  value={goalForm.current_ldl_drawn_at}
                  onChange={(e) => handleGoalChange('current_ldl_drawn_at', e.target.value)}
                  className="field-input"
                  type="date"
                />
              </Field>
              <Field label="Calories" unit="kcal">
                <input
                  value={goalForm.daily_calorie_target}
                  onChange={(e) => handleGoalChange('daily_calorie_target', e.target.value)}
                  className="field-input"
                  inputMode="numeric"
                  placeholder="1850"
                />
              </Field>
              <Field label="Sat fat max" unit="g">
                <input
                  value={goalForm.daily_sat_fat_g_max}
                  onChange={(e) => handleGoalChange('daily_sat_fat_g_max', e.target.value)}
                  className="field-input"
                  inputMode="decimal"
                  placeholder="12"
                />
              </Field>
              <Field label="Soluble fiber" unit="g">
                <input
                  value={goalForm.daily_soluble_fiber_g}
                  onChange={(e) => handleGoalChange('daily_soluble_fiber_g', e.target.value)}
                  className="field-input"
                  inputMode="decimal"
                  placeholder="18"
                />
              </Field>
              <Field label="Protein floor" unit="g">
                <input
                  value={goalForm.daily_protein_g_min}
                  onChange={(e) => handleGoalChange('daily_protein_g_min', e.target.value)}
                  className="field-input"
                  inputMode="decimal"
                  placeholder="100"
                />
              </Field>
              <Field label="Dietary pattern" unit="text" fullWidth>
                <input
                  value={goalForm.dietary_pattern}
                  onChange={(e) => handleGoalChange('dietary_pattern', e.target.value)}
                  className="field-input"
                  placeholder="Mediterranean, lower-carb, vegetarian…"
                />
              </Field>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ minHeight: 20, fontSize: 13, color: goalSaveError ? 'var(--bad)' : 'var(--fg-quiet)' }}>
                {goalSaveError ?? goalSaveSuccess ?? 'These targets guide your meal plans and feedback.'}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGoalSubmit}
                disabled={goalMutation.isPending}
                style={{ padding: '10px 14px' }}
              >
                {goalMutation.isPending ? 'Saving…' : 'Save goals'}
              </button>
            </div>
          </div>

          <div className="glass settings-card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Session</div>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
              End your current session on this device.
            </p>
            {logoutError && (
              <div style={{
                marginBottom: 12,
                padding: '10px 12px',
                background: 'rgba(251,113,133,0.10)',
                border: '1px solid rgba(251,113,133,0.25)',
                borderRadius: 12,
                fontSize: 13,
                color: 'var(--bad)',
              }}>
                {logoutError}
              </div>
            )}
            <button
              type="button"
              className="btn"
              onClick={handleLogout}
              disabled={loggingOut}
              style={{ width: '100%', opacity: loggingOut ? 0.7 : 1 }}
            >
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>

        <div className="settings-stack settings-secondary">
          <div className="glass settings-card settings-card-spacious" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Measurements</div>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 14px' }}>
              Choose your preferred unit system for your account.
            </p>

            <div className={`theme-toggle ${theme === 'light' ? 'light-mode' : ''}`} style={{ width: '100%' }}>
              <button
                type="button"
                data-active={measurementSystem === 'metric' ? 'true' : 'false'}
                onClick={() => setMeasurementSystem('metric')}
                disabled={measurementLoading || measurementMutation.isPending}
                aria-label="Use metric units"
              >
                Metric
              </button>
              <button
                type="button"
                data-active={measurementSystem === 'imperial' ? 'true' : 'false'}
                onClick={() => setMeasurementSystem('imperial')}
                disabled={measurementLoading || measurementMutation.isPending}
                aria-label="Use imperial units"
              >
                Imperial
              </button>
            </div>

            {measurementMutation.isError && (
              <div style={{
                marginTop: 12,
                padding: '10px 12px',
                background: 'rgba(251,113,133,0.10)',
                border: '1px solid rgba(251,113,133,0.25)',
                borderRadius: 12,
                fontSize: 13,
                color: 'var(--bad)',
              }}>
                Could not update measurement settings. Please try again.
              </div>
            )}
          </div>

          <div className="glass settings-card settings-llm-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>LLM activity</div>
                <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
                  Live LiteLLM call health for this API process.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => refetchLlmMetrics()}
                disabled={llmMetricsLoading}
                style={{ padding: '8px 12px', fontSize: 12 }}
              >
                Refresh
              </button>
            </div>

            {llmMetrics ? (
              <>
                <div className="settings-metric-grid">
                  <Metric label="Attempts" value={String(llmMetrics.totals.attempts)} />
                  <Metric label="Successes" value={String(llmMetrics.totals.successes)} />
                  <Metric label="Failures" value={String(llmMetrics.totals.failures)} />
                  <Metric label="Fallbacks" value={String(llmMetrics.totals.fallback_retries)} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  <MiniRow label="Scope" value={llmMetrics.scope} />
                  <MiniRow label="Resets on restart" value={llmMetrics.resets_on_restart ? 'Yes' : 'No'} />
                  <MiniRow label="Last success" value={formatMetricsDate(llmMetrics.last_success_at)} />
                  <MiniRow label="Last failure" value={formatMetricsDate(llmMetrics.last_failure_at)} />
                </div>

                <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>Recent events</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {llmMetrics.recent_events.length ? llmMetrics.recent_events.slice(0, 5).map((event) => (
                      <div key={`${event.ts}-${event.event}-${event.model}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--glass-1)', border: '1px solid var(--glass-edge)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>
                            {event.event} · {event.model}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                            {event.provider} · {event.attempt}
                            {event.fallback_model ? ` · fallback ${event.fallback_model}` : ''}
                            {event.error_type ? ` · ${event.error_type}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div className="num" style={{ fontSize: 12, color: 'var(--fg-secondary)' }}>
                            {event.elapsed_ms != null ? `${event.elapsed_ms.toFixed(1)}ms` : '—'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                            {event.total_tokens != null ? `${event.total_tokens} tok` : 'no usage'}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div style={{ fontSize: 13, color: 'var(--fg-quiet)' }}>No LiteLLM calls recorded yet.</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>
                {llmMetricsLoading ? 'Loading activity…' : 'Unable to load LiteLLM activity.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
      <div className="num" style={{ fontSize: 18, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</div>
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</div>
    </div>
  )
}

function Field({
  label,
  unit,
  fullWidth,
  children,
}: {
  label: string
  unit: string
  fullWidth?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, gridColumn: fullWidth ? '1 / -1' : 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        <span>{label}</span>
        <span>{unit}</span>
      </div>
      {children}
    </label>
  )
}

function toGoalFormState(goal?: Partial<GoalSettings>): GoalFormState {
  return {
    target_weight_kg: goal?.target_weight_kg?.toString() ?? '',
    target_ldl_mg_dl: goal?.target_ldl_mg_dl?.toString() ?? '',
    current_ldl_mg_dl: goal?.current_ldl_mg_dl?.toString() ?? '',
    current_ldl_drawn_at: goal?.current_ldl_drawn_at ?? '',
    daily_calorie_target: goal?.daily_calorie_target?.toString() ?? '',
    daily_sat_fat_g_max: goal?.daily_sat_fat_g_max?.toString() ?? '',
    daily_soluble_fiber_g: goal?.daily_soluble_fiber_g?.toString() ?? '',
    daily_protein_g_min: goal?.daily_protein_g_min?.toString() ?? '',
    dietary_pattern: goal?.dietary_pattern ?? '',
  }
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalInteger(value: string): number | null {
  const parsed = parseOptionalNumber(value)
  return parsed == null ? null : Math.round(parsed)
}

function formatGoalNumber(value: number | null | undefined, decimals: number, unit: string) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const formatted = decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(Number(value)))
  return unit ? `${formatted} ${unit}` : formatted
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
      <span style={{ color: 'var(--fg-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--fg-primary)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function formatMetricsDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0',
      borderBottom: last ? 'none' : '1px solid var(--glass-edge)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</span>
    </div>
  )
}
