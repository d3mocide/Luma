import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, User } from '../lib/api'

type MeasurementSystem = 'metric' | 'imperial'

type MeasurementSettings = {
  system: MeasurementSystem
}

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
  })

  const {
    data: measurementSettings,
    isLoading: measurementLoading,
  } = useQuery<MeasurementSettings>({
    queryKey: ['settings', 'measurements'],
    queryFn: () => api.get('/settings/measurements'),
  })

  const measurementMutation = useMutation({
    mutationFn: (system: MeasurementSystem) =>
      api.put<MeasurementSettings>('/settings/measurements', { system }),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'measurements'], data)
    },
  })

  const measurementSystem = measurementSettings?.system ?? 'metric'

  const setMeasurementSystem = (system: MeasurementSystem) => {
    if (measurementMutation.isPending || system === measurementSystem) return
    measurementMutation.mutate(system)
  }

  const handleLogout = async () => {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      await queryClient.invalidateQueries({ queryKey: ['today'] })
      window.location.assign('/')
    } catch (err: any) {
      setLogoutError(err?.message ?? 'Failed to sign out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="thin-scroll" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Settings</div>
      <h1 style={{ margin: '0 0 28px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
        Your account
      </h1>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="glass" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Account</div>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Row label="Name" value={user.display_name}/>
              <Row label="Email" value={user.email}/>
              <Row label="Role" value={user.role} last/>
            </div>
          ) : (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>Not signed in</p>
          )}
        </div>

        <div className="glass" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Goals</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            Goal configuration coming in Phase 0 final polish.
          </p>
        </div>

        <div className="glass" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Measurements</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 14px' }}>
            Choose your preferred unit system for your account.
          </p>

          <div className="theme-toggle" style={{ width: '100%' }}>
            <button
              type="button"
              data-active={measurementSystem === 'metric' ? 'true' : 'false'}
              onClick={() => setMeasurementSystem('metric')}
              disabled={measurementLoading || measurementMutation.isPending}
              aria-label="Use metric units"
            >
              Metric
            </button>
            <button
              type="button"
              data-active={measurementSystem === 'imperial' ? 'true' : 'false'}
              onClick={() => setMeasurementSystem('imperial')}
              disabled={measurementLoading || measurementMutation.isPending}
              aria-label="Use imperial units"
            >
              Imperial
            </button>
          </div>

          {measurementMutation.isError && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              background: 'rgba(251,113,133,0.10)',
              border: '1px solid rgba(251,113,133,0.25)',
              borderRadius: 12,
              fontSize: 13,
              color: 'var(--bad)',
            }}>
              Could not update measurement settings. Please try again.
            </div>
          )}
        </div>

        <div className="glass" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Session</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
            End your current session on this device.
          </p>
          {logoutError && (
            <div style={{
              marginBottom: 12,
              padding: '10px 12px',
              background: 'rgba(251,113,133,0.10)',
              border: '1px solid rgba(251,113,133,0.25)',
              borderRadius: 12,
              fontSize: 13,
              color: 'var(--bad)',
            }}>
              {logoutError}
            </div>
          )}
          <button
            type="button"
            className="btn"
            onClick={handleLogout}
            disabled={loggingOut}
            style={{ width: '100%', opacity: loggingOut ? 0.7 : 1 }}
          >
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0',
      borderBottom: last ? 'none' : '1px solid var(--glass-edge)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</span>
    </div>
  )
}
