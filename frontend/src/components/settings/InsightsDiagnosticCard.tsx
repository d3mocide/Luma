import { useState } from 'react'
import { api } from '../../lib/api'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

interface Insight {
  id: string
  ts: string
  rule_id: string
  severity: string
  headline: string
  body: string
  thread_seed: string
  status: string
}

export function InsightsDiagnosticCard() {
  const [bypassDedup, setBypassDedup] = useState(true)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const queryClient = useQueryClient()

  const handleTrigger = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setInsights(null)
    try {
      const res = await api.post<{ insights: Insight[] }>(`/insights/trigger?bypass_dedup=${bypassDedup}`)
      setInsights(res.insights)
      setSuccess('Alert engine executed successfully.')
      await queryClient.invalidateQueries({ queryKey: ['today'] })
      await queryClient.invalidateQueries({ queryKey: ['settings', 'hae-diagnostic'] })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execution failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass settings-card settings-llm-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Insights Diagnostic</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
          Trigger the alert evaluation engine immediately. This will run all health audit rules for your account and narrate any generated insights.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <input
          type="checkbox"
          id="bypass-dedup"
          checked={bypassDedup}
          onChange={(e) => setBypassDedup(e.target.checked)}
          style={{ width: 16, height: 16, cursor: 'pointer' }}
        />
        <label htmlFor="bypass-dedup" style={{ fontSize: 13, color: 'var(--fg-secondary)', cursor: 'pointer', userSelect: 'none' }}>
          Bypass rule deduplication window (force re-evaluate)
        </label>
      </div>

      {error && (
        <div style={{
          marginBottom: 14,
          padding: '10px 12px',
          background: 'rgba(251,113,133,0.08)',
          border: '1px solid rgba(251,113,133,0.22)',
          borderRadius: 10,
          fontSize: 12,
          color: 'var(--bad)',
          display: 'flex', gap: 8, alignItems: 'center'
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {success && (
        <div style={{
          marginBottom: 14,
          padding: '10px 12px',
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.22)',
          borderRadius: 10,
          fontSize: 12,
          color: 'var(--good)',
          display: 'flex', gap: 8, alignItems: 'center'
        }}>
          <CheckCircle2 size={14} /> {success}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleTrigger}
        disabled={loading}
        style={{ width: '100%', opacity: loading ? 0.6 : 1 }}
      >
        {loading ? 'Evaluating Health Data…' : 'Trigger Alert Engine'}
      </button>

      {insights && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--glass-edge)', paddingTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Generated Insights ({insights.length})</div>
          {insights.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {insights.map((insight) => (
                <div key={insight.id} className="glass-inset" style={{ padding: '14px 16px', borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 }}>
                    <span className="num" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-quiet)' }}>
                      {insight.rule_id.replace(/_/g, ' ')}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: 4,
                      color: insight.severity === 'warning' ? 'var(--bad)' : insight.severity === 'info' ? 'var(--sky-300)' : 'var(--good)',
                      background: insight.severity === 'warning' ? 'rgba(251,113,133,0.08)' : 'rgba(56,189,248,0.08)',
                      border: `1px solid ${insight.severity === 'warning' ? 'rgba(251,113,133,0.2)' : 'rgba(56,189,248,0.2)'}`
                    }}>
                      {insight.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 4 }}>
                    {insight.headline || 'No headline generated'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.4 }}>
                    {insight.body || 'No narrative body generated'}
                  </div>
                  {insight.thread_seed && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--sky-300)', fontStyle: 'italic' }}>
                      Suggested: "{insight.thread_seed}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0, textAlign: 'center', padding: '10px 0' }}>
              No new insights were triggered by current health metrics.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
