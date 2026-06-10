import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type LlmMetrics } from './types'

type ProviderStats = {
  key: string
  label: string
  color: string
  barBg: string
  totalRequests: number
  totalSuccesses: number
  avgLatency: number
  avgTokens: number
}

export function AiPerformanceCard() {
  const { data: llmMetrics, isLoading } = useQuery<LlmMetrics>({
    queryKey: ['settings', 'llm-metrics'],
    queryFn: () => api.get('/settings/llm-metrics'),
  })

  // Calculate aggregates from recent rolling events
  const calculateStats = (): ProviderStats[] => {
    const providers = [
      { key: 'gemini', label: 'Gemini AI', color: 'var(--sky-400)', barBg: 'rgba(56, 189, 248, 0.15)' },
      { key: 'anthropic', label: 'Anthropic Claude', color: 'var(--aurora-violet)', barBg: 'rgba(167, 139, 250, 0.15)' },
      { key: 'local', label: 'Local Ollama/LocalAI', color: 'var(--sun-400)', barBg: 'rgba(251, 191, 36, 0.15)' },
    ]

    const events = llmMetrics?.recent_events || []

    return providers.map((prov) => {
      const provEvents = events.filter((e) => e.provider === prov.key)
      const count = provEvents.length

      if (count === 0) {
        return {
          ...prov,
          totalRequests: 0,
          totalSuccesses: 0,
          avgLatency: 0,
          avgTokens: 0,
        }
      }

      const successes = provEvents.filter((e) => e.event === 'success').length
      const latencySum = provEvents.reduce((sum, e) => sum + (e.elapsed_ms || 0), 0)
      const tokensSum = provEvents.reduce((sum, e) => sum + (e.total_tokens || 0), 0)

      return {
        ...prov,
        totalRequests: count,
        totalSuccesses: successes,
        avgLatency: Math.round(latencySum / count),
        avgTokens: Math.round(tokensSum / count),
      }
    })
  }

  const stats = calculateStats()
  const LATENCY_CEILING_MS = 60_000 // fixed scale so bars are comparable across loads

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ margin: 0 }}>AI Provider Telemetry</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: 13, margin: '4px 0 0' }}>
          Real-time latency and efficiency analysis across active providers.
        </p>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>Loading performance stats…</p>
      ) : llmMetrics ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {stats.map((prov) => {
            const hasData = prov.totalRequests > 0
            const successRate = hasData ? Math.round((prov.totalSuccesses / prov.totalRequests) * 100) : 0
            const latencyPercent = hasData ? Math.min((prov.avgLatency / LATENCY_CEILING_MS) * 100, 100) : 0
            const successColor = successRate === 100 ? '#10b981' : 'var(--sun-400)'

            return (
              <div key={prov.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: hasData ? '#10b981' : 'var(--fg-quiet)',
                        boxShadow: hasData ? '0 0 8px #10b981' : 'none',
                        display: 'inline-block',
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>
                        {prov.label}
                      </span>
                    </div>
                    {hasData ? (
                      <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                        Based on last {prov.totalRequests} events
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
                        No telemetry events cached
                      </span>
                    )}
                  </div>

                  {hasData && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'right' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {prov.avgLatency.toLocaleString()} ms
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>avg latency</div>
                      </div>
                      <div style={{ borderLeft: '1px solid var(--glass-edge)', height: 24 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)' }}>
                          {prov.avgTokens} t
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>avg payload</div>
                      </div>
                    </div>
                  )}
                </div>

                {hasData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase',
                        letterSpacing: '0.08em', width: 52, flexShrink: 0,
                      }}>
                        Success
                      </span>
                      <div style={{
                        flex: 1, height: 6, borderRadius: 3,
                        background: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${successRate}%`, height: '100%', borderRadius: 3,
                          background: successColor,
                          boxShadow: `0 0 10px ${successColor}`,
                          transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                        }} />
                      </div>
                      <span style={{
                        fontSize: 11, fontFamily: 'var(--font-mono)', color: successColor,
                        width: 56, textAlign: 'right', flexShrink: 0,
                      }}>
                        {successRate}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase',
                        letterSpacing: '0.08em', width: 52, flexShrink: 0,
                      }}>
                        Latency
                      </span>
                      <div style={{
                        flex: 1, height: 6, borderRadius: 3,
                        background: 'rgba(255, 255, 255, 0.05)', overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${latencyPercent}%`, height: '100%', borderRadius: 3,
                          background: prov.color,
                          boxShadow: `0 0 10px ${prov.color}`,
                          transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                        }} />
                      </div>
                      <span style={{
                        fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-secondary)',
                        width: 56, textAlign: 'right', flexShrink: 0,
                      }}>
                        {(prov.avgLatency / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>
                        Latency scale: 0–{LATENCY_CEILING_MS / 1000}s
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '8px 12px', background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 6, border: '1px solid var(--glass-edge)',
                    fontSize: 12, color: 'var(--fg-quiet)', textAlign: 'center',
                  }}>
                    Await network activity to generate performance stats.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>Unable to load telemetry details.</p>
      )}
    </div>
  )
}
