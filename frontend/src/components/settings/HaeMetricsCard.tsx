import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type HaeMetrics, formatMetricsDate } from './types'

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

export function HaeMetricsCard() {
  const { data: haeMetrics, isLoading, refetch } = useQuery<HaeMetrics>({
    queryKey: ['settings', 'hae-metrics'],
    queryFn: () => api.get('/settings/hae-metrics'),
    refetchInterval: 30000,
  })

  return (
    <div className="glass settings-card settings-llm-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>HAE ingestion</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            Health Auto Export data flow for this process.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => refetch()} disabled={isLoading} style={{ padding: '8px 12px', fontSize: 12 }}>
          Refresh
        </button>
      </div>

      {haeMetrics ? (
        <>
          <div className="settings-metric-grid">
            <Metric label="Ingestions" value={String(haeMetrics.totals.successes)} />
            <Metric label="Rows in" value={String(haeMetrics.totals.rows_inserted)} />
            <Metric label="Errors" value={String(haeMetrics.totals.errors)} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <MiniRow label="Last success" value={formatMetricsDate(haeMetrics.last_success_at)} />
            <MiniRow label="Last error" value={formatMetricsDate(haeMetrics.last_error_at)} />
          </div>

          <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Recent ingestions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {haeMetrics.recent_events.length ? haeMetrics.recent_events.slice(0, 5).map((event, i) => (
                <div key={`${event.ts}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--glass-1)', border: '1px solid var(--glass-edge)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: event.error ? 'var(--bad)' : 'var(--fg-primary)', fontWeight: 500 }}>
                      {event.error ? 'Error' : `${event.rows_inserted} rows`}
                    </div>
                    {event.error && (
                      <div style={{ fontSize: 11, color: 'var(--fg-quiet)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {event.error}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                      {new Date(event.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              )) : (
                <div style={{ fontSize: 13, color: 'var(--fg-quiet)' }}>No HAE ingestions recorded yet.</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>
          {isLoading ? 'Loading ingestion data…' : 'Unable to load HAE metrics.'}
        </p>
      )}
    </div>
  )
}
