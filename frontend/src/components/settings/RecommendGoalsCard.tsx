import { useState } from 'react'
import { api } from '../../lib/api'
import type { GoalRecommendation } from './types'

const MODE_LABEL: Record<GoalRecommendation['basis']['mode'], string> = {
  deficit: 'Weight-loss mode',
  maintenance: 'Maintenance',
  insufficient_data: 'Estimated — limited data',
}

function RecPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 15, fontWeight: 500, color: 'var(--aurora-mint)' }}>
        {value}
      </div>
    </div>
  )
}

type Props = {
  onApply: (rec: GoalRecommendation) => void
}

export function RecommendGoalsCard({ onApply }: Props) {
  const [rec, setRec] = useState<GoalRecommendation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<GoalRecommendation>('/goals/recommend')
      setRec(data)
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not calculate recommendations.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: rec ? 12 : 0 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Suggested Targets</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            {rec
              ? `Based on ${rec.basis.data_days}-day Apple Watch average · ${MODE_LABEL[rec.basis.mode]}`
              : 'Auto-calculate targets from your Apple Watch biometric data.'}
          </p>
        </div>

        {loading ? (
          <span style={{ fontSize: 13, color: 'var(--fg-quiet)', flexShrink: 0, paddingTop: 2 }}>Calculating…</span>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={fetch}
            style={{ padding: '8px 12px', fontSize: 12, flexShrink: 0 }}
          >
            {rec ? '↻ Recalculate' : 'Suggest targets →'}
          </button>
        )}
      </div>

      {error && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--bad)' }}>{error}</p>
      )}

      {rec && (
        <>
          <div className="settings-goals-summary">
            <RecPill label="Calories" value={`${rec.daily_calorie_target.toLocaleString()} kcal`} />
            <RecPill label="Sat fat max" value={`${rec.daily_sat_fat_g_max} g`} />
            <RecPill label="Soluble fiber" value={`${rec.daily_soluble_fiber_g} g`} />
            {rec.daily_protein_g_min != null && (
              <RecPill label="Protein floor" value={`${rec.daily_protein_g_min} g`} />
            )}
          </div>

          {rec.rationale && (
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.6 }}>
              {rec.rationale}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onApply(rec)}
              style={{ padding: '10px 14px' }}
            >
              Apply to form
            </button>
          </div>
        </>
      )}
    </div>
  )
}
