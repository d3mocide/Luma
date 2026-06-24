import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, AlertTriangle, Info } from 'lucide-react'
import { api } from '../../lib/api'
import type { Medication, InteractionsResponse } from './types'

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityColor(sev: string) {
  if (sev === 'high')   return 'var(--bad)'
  if (sev === 'medium') return 'var(--sun-400)'
  return 'var(--sky-300)'
}

function severityBg(sev: string) {
  if (sev === 'high')   return 'rgba(251,113,133,0.08)'
  if (sev === 'medium') return 'rgba(251,191,36,0.08)'
  return 'rgba(56,189,248,0.08)'
}

function SeverityIcon({ sev }: { sev: string }) {
  if (sev === 'high' || sev === 'medium')
    return <AlertTriangle size={16} strokeWidth={1.5} color={severityColor(sev)} />
  return <Info size={16} strokeWidth={1.5} color={severityColor(sev)} />
}

// ---------------------------------------------------------------------------
// Interactions tab
// ---------------------------------------------------------------------------

export function InteractionsTab() {

  const { data, isLoading, error } = useQuery<InteractionsResponse>({
    queryKey: ['health', 'interactions'],
    queryFn: () => api.get('/health/interactions'),
    refetchOnWindowFocus: true,
  })

  const { data: meds = [] } = useQuery<Medication[]>({
    queryKey: ['health', 'medications'],
    queryFn: () => api.get('/health/medications'),
  })

  const activeMeds = meds.filter((m) => m.is_active)

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-quiet)', fontSize: 13 }}>Checking interactions…</div>
  if (error) return <div style={{ padding: 24, color: 'var(--bad)', fontSize: 13 }}>Failed to check interactions.</div>

  const alerts = data?.alerts ?? []

  return (
    <div className="health-grid">
      {/* Left column: Alerts list / Empty states */}
      <div className="settings-stack">
        {activeMeds.length === 0 ? (
          <div className="glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 24px', textAlign: 'center', borderRadius: 14 }}>
            <ShieldAlert size={28} strokeWidth={1.2} style={{ opacity: 0.4, color: 'var(--fg-quiet)' }} />
            <span style={{ fontSize: 13, color: 'var(--fg-quiet)', maxWidth: 260, lineHeight: 1.5 }}>
              Add and enable medications in the Medications tab to enable active interaction checking.
            </span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 24px', textAlign: 'center', borderRadius: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.2)',
            }}>
              <ShieldAlert size={22} strokeWidth={1.5} color="var(--good)" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>No interactions flagged</span>
            <span style={{ fontSize: 13, color: 'var(--fg-quiet)', maxWidth: 260, lineHeight: 1.5 }}>
              Today's meals look clear based on your active medication list.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {alerts.map((alert) => (
              <div key={alert.rule_id} style={{
                padding: '14px 16px', borderRadius: 14,
                background: severityBg(alert.severity),
                border: `1px solid ${severityColor(alert.severity)}33`,
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0, marginTop: 1 }}>
                    <SeverityIcon sev={alert.severity} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: severityColor(alert.severity), marginBottom: 4 }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                      {alert.message}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right column: Checked metrics & local rules info */}
      <div className="settings-stack">
        <div className="glass settings-card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Checking Status</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Meds checked</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}>
                {data?.medications_checked ?? activeMeds.length}
              </div>
            </div>
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Meals today</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}>
                {data?.meal_events_today ?? 0}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--glass-1)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--glass-edge)' }}>
            <Info size={14} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--fg-quiet)', lineHeight: 1.4 }}>
              Interaction screening runs entirely within your browser and backend container. No health data is uploaded to third-party APIs.
            </span>
          </div>
        </div>

        <div className="glass settings-card" style={{ padding: 24, border: '1px solid rgba(251,191,36,0.2)' }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--sun-400)' }}>Clinical Guidance</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
            Luma helps you track adherence and screen for dietary interactions based on local rule engines. Always consult your primary care physician or pharmacist before starting, modifying, or terminating any drug regimen.
          </p>
        </div>
      </div>
    </div>
  )
}
