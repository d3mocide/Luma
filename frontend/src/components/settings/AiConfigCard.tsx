import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type AiConfig } from './types'
import { ChevronDown, ChevronUp } from 'lucide-react'

const ROLE_META = {
  meal_planner: { label: 'Meal Planner', desc: 'Generates weekly menus & recipes' },
  coach_agent: { label: 'Coach Agent', desc: 'Handles dietary chat & feedback' },
  food_extractor: { label: 'Food Extractor', desc: 'Extracts macros from text/voice' },
  vision_classifier: { label: 'Vision Classifier', desc: 'Identifies meals in images' },
  insight_narrator: { label: 'Insight Narrator', desc: 'Generates daily trend commentary' },
}

export function AiConfigCard() {
  const { data: aiConfig, isLoading } = useQuery<AiConfig>({
    queryKey: ['settings', 'ai-config'],
    queryFn: () => api.get('/settings/ai-config'),
  })

  const [expanded, setExpanded] = useState(false)

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ margin: 0 }}>AI Routing Config</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: 13, margin: '4px 0 0' }}>
          Active mapping of intelligence roles to physical model nodes.
        </p>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>Loading routing table…</p>
      ) : aiConfig ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ overflowX: 'auto', margin: '0 -24px', padding: '0 24px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-edge)' }}>
                  <th style={{ padding: '8px 0', fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Service</th>
                  <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Primary model</th>
                  <th style={{ padding: '8px 0', fontSize: 11, fontWeight: 600, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Fallback</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(ROLE_META) as Array<keyof typeof ROLE_META>).map((role) => {
                  const meta = ROLE_META[role]
                  const primary = aiConfig.models[role]?.primary || '—'
                  const fallback = aiConfig.models[role]?.fallback

                  return (
                    <tr key={role} style={{ borderBottom: '1px solid var(--glass-edge)' }}>
                      <td style={{ padding: '14px 0', verticalAlign: 'middle' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{meta.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 1 }}>{meta.desc}</div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-secondary)' }}>
                            {primary}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                            padding: '1px 5px', borderRadius: 4,
                            background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)',
                            color: '#10b981', display: 'inline-block',
                          }}>
                            ACTIVE
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 0', verticalAlign: 'middle', textAlign: 'right' }}>
                        {fallback ? (
                          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--sun-400)' }}>
                            {fallback}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>None</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              style={{
                background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 500, color: 'var(--fg-secondary)',
                outline: 'none',
              }}
            >
              <span>{expanded ? 'Hide System Endpoints' : 'Show System Endpoints'}</span>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {expanded && (
              <div className="glass-inset" style={{ padding: 12, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>LOCAL_AI_API_BASE</span>
                  <span style={{ color: aiConfig.endpoints.local_ai_api_base ? 'var(--fg-primary)' : 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
                    {aiConfig.endpoints.local_ai_api_base || 'Not Configured'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>WHISPER_URL</span>
                  <span style={{ color: aiConfig.endpoints.whisper_url ? 'var(--fg-primary)' : 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
                    {aiConfig.endpoints.whisper_url || 'Not Configured'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>Unable to load routing details.</p>
      )}
    </div>
  )
}
