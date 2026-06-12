import { type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

interface TriggerStat {
  trigger: string
  count: number
  last_used: string | null
}

interface ProviderStat {
  provider: string
  count: number
  pct: number
}

interface RecentEvent {
  trigger: string
  provider: string
  event: string
  elapsed_ms: number | null
  ts: string
}

interface AiUsageData {
  summary: { calls_7d: number; calls_30d: number }
  by_trigger: TriggerStat[]
  by_provider: ProviderStat[]
  recent_events: RecentEvent[]
}

const TRIGGER_LABELS: Record<string, string> = {
  coach_tool_call: 'Coach conversation',
  coach_compress:  'Coach conversation',
  coach_context:   'Coach conversation',
  food_extract:    'Food text scan',
  photo_log:       'Food photo scan',
  meal_plan:       'Meal planning',
  meal_alternatives: 'Meal suggestions',
  goal_rationale:  'Goal setup',
  insight_narrate: 'Health insight',
  recipe_import:   'Recipe import',
}

const PROVIDER_META: Record<string, { label: string; color: string }> = {
  anthropic: { label: 'Anthropic',  color: 'var(--aurora-violet)' },
  gemini:    { label: 'Google',     color: 'var(--sky-400)' },
  local:     { label: 'Local',      color: 'var(--sun-400)' },
  cloud:     { label: 'Cloud AI',   color: 'var(--fg-secondary)' },
}

function triggerLabel(trigger: string): string {
  return TRIGGER_LABELS[trigger] ?? trigger.replace(/_/g, ' ')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const tile: CSSProperties = {
  background: 'var(--glass-1)',
  border: '1px solid var(--glass-edge)',
  borderRadius: 10,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

export function AiUsageCard() {
  const { data, isLoading } = useQuery<AiUsageData>({
    queryKey: ['settings', 'ai-usage'],
    queryFn: () => api.get('/settings/ai-usage'),
    refetchInterval: 30_000,
  })

  const maxCount = Math.max(...((data?.by_trigger ?? []).map((t: TriggerStat) => t.count)), 1)

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ margin: 0 }}>Your AI Activity</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: 13, margin: '4px 0 0' }}>
          AI-powered features you've used in the past 30 days.
        </p>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>Loading…</p>
      ) : !data ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>Unable to load usage data.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Summary tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={tile}>
              <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-primary)' }}>
                {data.summary.calls_7d}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                This week
              </span>
            </div>
            <div style={tile}>
              <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-primary)' }}>
                {data.summary.calls_30d}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                This month
              </span>
            </div>
          </div>

          {/* Feature breakdown */}
          {data.by_trigger.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                By feature
              </span>
              {data.by_trigger.map((t: TriggerStat) => {
                const prov = PROVIDER_META[
                  data.by_provider.find(() => true)?.provider ?? 'cloud'
                ]
                const barPct = Math.round((t.count / maxCount) * 100)
                return (
                  <div key={t.trigger} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
                        {triggerLabel(t.trigger)}
                      </span>
                      <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--fg-tertiary)' }}>
                        {t.count}×
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${barPct}%`,
                        height: '100%',
                        borderRadius: 2,
                        background: prov?.color ?? 'var(--fg-quiet)',
                        transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Recent events */}
          {data.recent_events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Recent activity
              </span>
              {data.recent_events.slice(0, 8).map((e: RecentEvent, i: number) => {
                const provMeta = PROVIDER_META[e.provider] ?? PROVIDER_META.cloud
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 10px',
                    background: 'var(--glass-1)',
                    border: '1px solid var(--glass-edge)',
                    borderRadius: 7,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
                        {triggerLabel(e.trigger)}
                      </span>
                      <span style={{ fontSize: 11, color: provMeta.color }}>
                        {provMeta.label}
                        {e.elapsed_ms != null && (
                          <span style={{ color: 'var(--fg-quiet)' }}> · {(e.elapsed_ms / 1000).toFixed(1)}s</span>
                        )}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--fg-quiet)', flexShrink: 0 }}>
                      {timeAgo(e.ts)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {data.summary.calls_30d === 0 && (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0, textAlign: 'center', padding: '16px 0' }}>
              Your AI activity will appear here once you start using Luma's features.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
