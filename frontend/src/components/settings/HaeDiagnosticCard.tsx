import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type HaeDiagnostic, type HaeDiagnosticStoredMetric } from './types'

function MetricRow({ row }: { row: HaeDiagnosticStoredMetric }) {
  const latestVal = row.latest_value != null
    ? Number(row.latest_value).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--glass-edge)', alignItems: 'center' }}>
      <span className="num" style={{ fontSize: 12, color: 'var(--fg-primary)', fontWeight: 500 }}>{row.internal_metric}</span>
      <span style={{ fontSize: 11, color: 'var(--fg-quiet)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.hae_metric ?? '—'}
      </span>
      <span className="num" style={{ fontSize: 12, color: 'var(--fg-tertiary)', textAlign: 'right' }}>{row.data_points.toLocaleString()}</span>
      <span className="num" style={{ fontSize: 12, color: 'var(--fg-secondary)', textAlign: 'right', minWidth: 60 }}>{latestVal}</span>
    </div>
  )
}

function TableHeader() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 12, paddingBottom: 8, borderBottom: '1px solid var(--glass-edge-strong)' }}>
      {['Internal metric', 'HAE source', 'Rows', 'Latest'].map((h) => (
        <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-quiet)' }}>{h}</span>
      ))}
    </div>
  )
}

export function HaeDiagnosticCard() {
  const [schemaOpen, setSchemaOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery<HaeDiagnostic>({
    queryKey: ['settings', 'hae-diagnostic'],
    queryFn: () => api.get('/settings/hae-diagnostic'),
    refetchInterval: 60000,
  })

  return (
    <div className="glass settings-card settings-llm-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Data coverage</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            Stored biometrics from Health Auto Export for your account.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => refetch()}
          disabled={isLoading}
          style={{ padding: '8px 12px', fontSize: 12, flexShrink: 0 }}
        >
          Refresh
        </button>
      </div>

      {data ? (
        <>
          {/* Stored metrics table */}
          {data.stored_metrics.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <TableHeader />
              {data.stored_metrics.map((row, i) => (
                <MetricRow key={`${row.internal_metric}-${i}`} row={row} />
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 0', marginBottom: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--fg-quiet)', margin: 0 }}>No HAE data stored yet.</p>
            </div>
          )}

          {/* Zero-coverage metrics */}
          {data.known_internal_metrics_with_no_data.length > 0 && (
            <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 14, marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>No data yet</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.known_internal_metrics_with_no_data.map((m) => (
                  <span key={m} className="num" style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', color: 'var(--fg-quiet)' }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Unrecognised in DB */}
          {data.unrecognised_internal_metrics_in_db.length > 0 && (
            <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 14, marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 6, color: 'var(--warn)' }}>Unrecognised in DB</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.unrecognised_internal_metrics_in_db.map((m) => (
                  <span key={m} className="num" style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--warn)' }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible schema reference */}
          <div style={{ borderTop: '1px solid var(--glass-edge)', paddingTop: 14 }}>
            <button
              type="button"
              onClick={() => setSchemaOpen((v) => !v)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-tertiary)', fontSize: 12, fontWeight: 500 }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition: 'transform 150ms', transform: schemaOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Schema reference ({Object.keys(data.schema.standard_metrics).length + Object.keys(data.schema.aggregate_metrics).length} mappings)
            </button>

            {schemaOpen && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SchemaSection title="Standard" entries={Object.entries(data.schema.standard_metrics)} />
                <SchemaSection
                  title="Aggregate"
                  entries={Object.entries(data.schema.aggregate_metrics).map(([k, v]) => [
                    k,
                    `${v.internal_name} (extracts ${v.field_extracted}${v.other_fields_available.length ? `; available: ${v.other_fields_available.join(', ')}` : ''})`,
                  ])}
                />
                <SchemaSection
                  title="Sleep v4 fields"
                  entries={Object.entries(data.schema.sleep_v4_fields).map(([k, v]) => [
                    k,
                    v.stored ? (v.internal_name ?? k) : `${k} — not stored`,
                  ])}
                  dimUnstored={(k) => !data.schema.sleep_v4_fields[k]?.stored}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>
          {isLoading ? 'Loading coverage data…' : 'Unable to load diagnostic data.'}
        </p>
      )}
    </div>
  )
}

function SchemaSection({
  title,
  entries,
  dimUnstored,
}: {
  title: string
  entries: [string, string][]
  dimUnstored?: (key: string) => boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-quiet)', marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {entries.map(([hae, internal]) => {
          const dim = dimUnstored?.(hae) ?? false
          return (
            <div key={hae} style={{ display: 'flex', gap: 8, alignItems: 'baseline', opacity: dim ? 0.5 : 1 }}>
              <span className="num" style={{ fontSize: 11, color: 'var(--sky-400)', flexShrink: 0 }}>{hae}</span>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>→</span>
              <span className="num" style={{ fontSize: 11, color: dim ? 'var(--fg-quiet)' : 'var(--fg-tertiary)' }}>{internal}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
