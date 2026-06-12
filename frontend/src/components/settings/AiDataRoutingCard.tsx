import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface FeatureConfig {
  role: string
  label: string
  triggers: string[]
  provider: string
  provider_label: string
  is_cloud: boolean
}

interface AiProvidersData {
  features: FeatureConfig[]
}

const PROVIDER_META: Record<string, { color: string; dotShadow: string }> = {
  anthropic: { color: 'var(--aurora-violet)', dotShadow: '0 0 8px var(--aurora-violet)' },
  gemini:    { color: 'var(--sky-400)',        dotShadow: '0 0 8px var(--sky-400)' },
  local:     { color: 'var(--sun-400)',        dotShadow: '0 0 8px var(--sun-400)' },
  cloud:     { color: 'var(--fg-secondary)',   dotShadow: 'none' },
}

function providerDescription(provider: string, isCloud: boolean): string {
  if (!isCloud) return 'Processed on this server — your data never leaves.'
  if (provider === 'anthropic') return 'Sent to Anthropic\'s servers for processing.'
  if (provider === 'gemini') return 'Sent to Google\'s servers for processing.'
  return `Sent to ${provider}'s servers for processing.`
}

export function AiDataRoutingCard() {
  const { data, isLoading } = useQuery<AiProvidersData>({
    queryKey: ['settings', 'ai-providers'],
    queryFn: () => api.get('/settings/ai-providers'),
  })

  // Group features by provider
  const grouped = (data?.features ?? []).reduce<Record<string, { config: FeatureConfig; features: string[] }>>(
    (acc: Record<string, { config: FeatureConfig; features: string[] }>, f: FeatureConfig) => {
      if (!acc[f.provider]) {
        acc[f.provider] = { config: f, features: [] }
      }
      acc[f.provider].features.push(f.label)
      return acc
    },
    {},
  )

  const providerEntries: Array<{ config: FeatureConfig; features: string[] }> = Object.values(grouped)

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ margin: 0 }}>Data Routing</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: 13, margin: '4px 0 0' }}>
          Where your data goes when Luma uses AI. Reflects current server configuration.
        </p>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>Loading…</p>
      ) : providerEntries.length === 0 ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>No AI configuration available.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {providerEntries.map(({ config, features }) => {
            const meta = PROVIDER_META[config.provider] ?? PROVIDER_META.cloud
            return (
              <div key={config.provider} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Provider header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: meta.color,
                    boxShadow: meta.dotShadow,
                    flexShrink: 0,
                    display: 'inline-block',
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>
                    {config.provider_label}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 6px',
                    borderRadius: 4,
                    background: config.is_cloud
                      ? 'rgba(251, 113, 133, 0.12)'
                      : 'rgba(16, 185, 129, 0.12)',
                    color: config.is_cloud ? 'var(--fg-bad)' : 'var(--fg-good)',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}>
                    {config.is_cloud ? 'Cloud' : 'Local'}
                  </span>
                </div>

                {/* Features that use this provider */}
                <div style={{
                  padding: '10px 12px',
                  background: 'var(--glass-1)',
                  border: '1px solid var(--glass-edge)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                    {features.map((label) => (
                      <span key={label} style={{
                        fontSize: 12,
                        color: 'var(--fg-secondary)',
                        padding: '2px 8px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--glass-edge)',
                        borderRadius: 5,
                      }}>
                        {label}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: 0 }}>
                    {providerDescription(config.provider, config.is_cloud)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
