import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type HaeImportSettings } from './types'

const SETUP_STEPS = [
  'Install the Health Connect Webhook app on your Android phone and grant it read access to the metrics you want (allow background + history for older data).',
  'Open the app, add a webhook, and paste the endpoint URL above.',
  'Set a sync interval of 30–60 minutes and pick the metrics to send.',
]

export function HealthConnectCard() {
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useQuery<HaeImportSettings>({
    queryKey: ['settings', 'hae-import'],
    queryFn: () => api.get('/settings/hae-import'),
  })

  const webhookUrl = data
    ? `${window.location.origin}/api/v1/ingest/health-connect/${data.token}`
    : ''

  const handleCopy = async () => {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Health Connect</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
        Send Android health data to Luma with a Health Connect exporter app.
        Unlike Apple Health there is no header secret — the token in this URL is
        the credential, so keep it private.
      </p>

      {isLoading ? (
        <p style={{ fontSize: 13, color: 'var(--fg-quiet)', margin: 0 }}>Loading…</p>
      ) : data ? (
        <>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Endpoint URL
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              readOnly
              value={webhookUrl}
              aria-label="Health Connect endpoint URL"
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 12,
                fontFamily: 'var(--font-mono, monospace)',
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--glass-edge)',
                background: 'var(--glass-1)',
                color: 'var(--fg-primary)',
                outline: 'none',
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={handleCopy}
              style={{ padding: '8px 14px', fontSize: 12, flexShrink: 0 }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Setup
            </span>
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--fg-secondary)', fontSize: 13, lineHeight: 1.6 }}>
            {SETUP_STEPS.map((step) => (
              <li key={step} style={{ marginBottom: 6 }}>{step}</li>
            ))}
          </ol>
        </>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--fg-quiet)', margin: 0 }}>Unable to load import token.</p>
      )}
    </div>
  )
}
