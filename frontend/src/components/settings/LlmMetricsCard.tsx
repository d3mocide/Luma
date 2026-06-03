import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type LlmMetrics, formatMetricsDate } from './types'

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

export function LlmMetricsCard() {
  const { data: llmMetrics, isLoading: llmMetricsLoading, refetch: refetchLlmMetrics } = useQuery<LlmMetrics>({
    queryKey: ['settings', 'llm-metrics'],
    queryFn: () => api.get('/settings/llm-metrics'),
    refetchInterval: 15000,
  })

  return (
    <div className="glass settings-card settings-llm-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>LLM activity</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            Live LiteLLM call health for this API process.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => refetchLlmMetrics()} disabled={llmMetricsLoading} style={{ padding: '8px 12px', fontSize: 12 }}>
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
                      {event.trigger ? ` · ${event.trigger}` : ''}
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
  )
}
