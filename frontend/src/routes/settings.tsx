import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, User } from '../lib/api'
import { useUIStore } from '../stores'

type MeasurementSystem = 'metric' | 'imperial'

type MeasurementSettings = {
  system: MeasurementSystem
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

  const measurementSystem = measurementSettings?.system ?? 'metric'

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

  return (
    <div className="thin-scroll settings-page" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>
      <header className="mobile-hero" style={{ marginBottom: 28 }}>
        <div className="mobile-hero-content">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Settings</div>
          <h1 className="mobile-hero-title" style={{ margin: 0, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your account
          </h1>
        </div>
      </header>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="glass" style={{ padding: 24 }}>
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

        <div className="glass" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Goals</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            Goal configuration coming in Phase 0 final polish.
          </p>
        </div>

        <div className="glass" style={{ padding: 24 }}>
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

        <div className="glass" style={{ padding: 24 }}>
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

        <div className="glass" style={{ padding: 24 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
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
