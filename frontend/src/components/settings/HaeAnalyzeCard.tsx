import { useState } from 'react'
import { api } from '../../lib/api'
import { type HaeAnalysis, type HaeAnalysisEntry } from './types'

type StatusBadgeProps = { status: HaeAnalysisEntry['status'] }
function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Record<HaeAnalysisEntry['status'], { label: string; color: string; bg: string; border: string }> = {
    mapped:          { label: 'Mapped',        color: 'var(--good)',           bg: 'rgba(52,211,153,0.08)',   border: 'rgba(52,211,153,0.25)' },
    sleep_v4_partial:{ label: 'Partial',       color: 'var(--warn)',           bg: 'rgba(251,191,36,0.08)',   border: 'rgba(251,191,36,0.25)' },
    sleep_legacy:    { label: 'Sleep legacy',  color: 'var(--fg-tertiary)',    bg: 'var(--glass-1)',          border: 'var(--glass-edge)' },
    unmapped:        { label: 'Unmapped',      color: 'var(--bad)',            bg: 'rgba(251,113,133,0.08)', border: 'rgba(251,113,133,0.25)' },
  }
  const s = styles[status]
  return (
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, color: s.color, background: s.bg, border: `1px solid ${s.border}`, flexShrink: 0 }}>
      {s.label}
    </span>
  )
}

function FieldTag({ label, dim }: { label: string; dim?: boolean }) {
  return (
    <span className="num" style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, background: dim ? 'var(--glass-1)' : 'rgba(251,191,36,0.08)', border: dim ? '1px solid var(--glass-edge)' : '1px solid rgba(251,191,36,0.25)', color: dim ? 'var(--fg-faint)' : 'var(--warn)' }}>
      {label}
    </span>
  )
}

function AnalysisRow({ entry }: { entry: HaeAnalysisEntry }) {
  const [open, setOpen] = useState(false)
  const hasDetail = entry.fields_not_extracted.length > 0 || entry.likely_misalignment || (entry.suggestions?.length ?? 0) > 0

  return (
    <div style={{ borderBottom: '1px solid var(--glass-edge)' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: hasDetail ? 'pointer' : 'default' }}
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        {hasDetail && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', color: 'var(--fg-faint)' }}>
            <path d="M3 1.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {!hasDetail && <div style={{ width: 10, flexShrink: 0 }} />}

        <span className="num" style={{ fontSize: 12, color: 'var(--fg-primary)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.hae_name}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {entry.internal_names.length > 0 && (
            <span className="num" style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>
              → {entry.internal_names.join(', ')}
            </span>
          )}
          <StatusBadge status={entry.status} />
          <span className="num" style={{ fontSize: 11, color: 'var(--fg-faint)', minWidth: 36, textAlign: 'right' }}>
            {entry.data_point_count} pts
          </span>
        </div>
      </div>

      {open && hasDetail && (
        <div style={{ paddingBottom: 12, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entry.fields_not_extracted.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-faint)', marginBottom: 5 }}>Fields received but not extracted</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {entry.fields_in_data.map((f) => (
                  <FieldTag key={f} label={f} dim={!entry.fields_not_extracted.includes(f)} />
                ))}
              </div>
            </div>
          )}

          {entry.likely_misalignment && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.20)' }}>
              <span style={{ fontSize: 12, color: 'var(--warn)' }}>
                Likely misalignment — did you mean{' '}
                <span className="num" style={{ fontWeight: 600 }}>{entry.likely_misalignment}</span>?
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-quiet)', display: 'block', marginTop: 2 }}>{entry.misalignment_reason}</span>
            </div>
          )}

          {(entry.suggestions?.length ?? 0) > 0 && !entry.likely_misalignment && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-faint)', marginBottom: 5 }}>Possible matches</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {entry.suggestions!.map((s) => (
                  <span key={s} className="num" style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', color: 'var(--fg-tertiary)' }}>{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryPill({ label, value, variant }: { label: string; value: number; variant?: 'good' | 'warn' | 'bad' }) {
  const color = variant === 'bad' ? 'var(--bad)' : variant === 'warn' ? 'var(--warn)' : variant === 'good' ? 'var(--good)' : 'var(--fg-tertiary)'
  return (
    <div className="glass-inset" style={{ padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</div>
      <div className="num" style={{ fontSize: 18, fontWeight: 500, color }}>{value}</div>
    </div>
  )
}

export function HaeAnalyzeCard() {
  const [raw, setRaw] = useState('')
  const [result, setResult] = useState<HaeAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleAnalyze = async () => {
    setError(null)
    setResult(null)
    setLoading(true)
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      setError('Invalid JSON — paste a complete HAE payload.')
      setLoading(false)
      return
    }
    try {
      const data = await api.post<HaeAnalysis>('/settings/hae-diagnostic/analyze', { payload })
      setResult(data)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Analysis failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass settings-card settings-llm-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Payload analyzer</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
          Paste a raw HAE JSON export to inspect field coverage without storing data.
        </p>
      </div>

      <textarea
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setResult(null); setError(null) }}
        placeholder={'{\n  "data": {\n    "metrics": [...]\n  }\n}'}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: 120,
          background: 'var(--glass-1)',
          border: '1px solid var(--glass-edge)',
          borderRadius: 12,
          padding: '10px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--fg-secondary)',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: 10,
        }}
      />

      {error && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.22)', borderRadius: 10, fontSize: 12, color: 'var(--bad)' }}>
          {error}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleAnalyze}
        disabled={loading || !raw.trim()}
        style={{ width: '100%', opacity: loading || !raw.trim() ? 0.6 : 1 }}
      >
        {loading ? 'Analyzing…' : 'Analyze payload'}
      </button>

      {result && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--glass-edge)', paddingTop: 16 }}>
          <div className="settings-metric-grid" style={{ marginBottom: 16 }}>
            <SummaryPill label="Total" value={result.metrics_in_payload} />
            <SummaryPill label="Mapped" value={result.metrics_mapped} variant="good" />
            <SummaryPill label="Unmapped" value={result.metrics_unmapped} variant={result.metrics_unmapped > 0 ? 'bad' : undefined} />
            <SummaryPill label="Partial" value={result.metrics_with_unextracted_fields} variant={result.metrics_with_unextracted_fields > 0 ? 'warn' : undefined} />
          </div>

          <div className="eyebrow" style={{ marginBottom: 8 }}>Metric analysis</div>
          <div>
            {result.analysis.map((entry, i) => (
              <AnalysisRow key={`${entry.hae_name}-${i}`} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
