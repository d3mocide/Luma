import { useState } from 'react'
import { api } from '../../lib/api'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

export function InsightsDiagnosticCard() {
  const [bypassDedup, setBypassDedup] = useState(true)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const handleTrigger = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      await api.post(`/insights/trigger?bypass_dedup=${bypassDedup}`)
      setSuccess('Alert engine executed successfully. New insights generated!')
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
    </div>
  )
}
