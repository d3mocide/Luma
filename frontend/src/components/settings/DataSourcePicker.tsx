import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Apple, Smartphone } from 'lucide-react'
import { api, type User } from '../../lib/api'

type DataSource = 'apple_health' | 'health_connect'

const OPTIONS: { value: DataSource; label: string; sub: string; Icon: typeof Apple }[] = [
  { value: 'apple_health',   label: 'Apple Health', sub: 'iPhone & Apple Watch', Icon: Apple },
  { value: 'health_connect', label: 'Health Connect', sub: 'Android devices', Icon: Smartphone },
]

export function DataSourcePicker() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { data: user } = useQuery<User>({ queryKey: ['me'], queryFn: () => api.get('/auth/me') })
  const active: DataSource = user?.data_source ?? 'apple_health'

  const mutation = useMutation({
    mutationFn: (data_source: DataSource) => api.patch<User>('/auth/me', { data_source }),
    onSuccess: (updated) => {
      qc.setQueryData(['me'], updated)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    },
  })

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Data source</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
        Choose where Luma reads your health data. Only one source is active at a time —
        steps, distance and active energy come from the source you pick.
      </p>

      <div role="radiogroup" aria-label="Health data source" style={{ display: 'flex', gap: 10 }}>
        {OPTIONS.map(({ value, label, sub, Icon }) => {
          const selected = active === value
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={mutation.isPending}
              onClick={() => { if (!selected) mutation.mutate(value) }}
              className="glass-inset"
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '14px 16px',
                borderRadius: 14,
                textAlign: 'left',
                cursor: selected ? 'default' : 'pointer',
                border: `1px solid ${selected ? 'var(--sky-500)' : 'var(--glass-edge)'}`,
                boxShadow: selected ? '0 0 0 1px var(--sky-500)' : 'none',
                color: 'var(--fg-primary)',
              }}
            >
              <Icon size={18} strokeWidth={1.5} color={selected ? 'var(--sky-400)' : 'var(--fg-tertiary)'} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{sub}</span>
            </button>
          )
        })}
      </div>

      <p style={{ fontSize: 12, color: saved ? 'var(--good)' : 'var(--fg-quiet)', margin: '12px 0 0', minHeight: 16 }}>
        {saved ? 'Saved' : 'Other metrics (weight, heart rate, sleep) merge from both sources.'}
      </p>
    </div>
  )
}
