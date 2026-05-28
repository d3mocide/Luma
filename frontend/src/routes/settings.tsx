import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, User } from '../lib/api'
import {
  type GoalSettings, type GoalFormState,
  emptyGoalForm, toGoalFormState, parseOptionalNumber, parseOptionalInteger,
} from '../components/settings/types'
import { GoalsCard } from '../components/settings/GoalsCard'
import { MeasurementsCard } from '../components/settings/MeasurementsCard'
import { LlmMetricsCard } from '../components/settings/LlmMetricsCard'
import { HaeMetricsCard } from '../components/settings/HaeMetricsCard'
import { HaeImportCard } from '../components/settings/HaeImportCard'
import { useMeasurementSystem, convertWeightToKg } from '../lib/measurements'

const KG_TO_LB = 2.2046226218

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--glass-edge)' }}>
      <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</span>
    </div>
  )
}

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const measurementSystem = useMeasurementSystem()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [goalSaveError, setGoalSaveError] = useState<string | null>(null)
  const [goalSaveSuccess, setGoalSaveSuccess] = useState<string | null>(null)
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm)

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
  })

  const { data: goalSettings } = useQuery<Partial<GoalSettings>>({
    queryKey: ['settings', 'goals'],
    queryFn: () => api.get('/goals'),
  })

  const goalMutation = useMutation({
    mutationFn: (payload: GoalSettings) => api.put<GoalSettings>('/goals', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'goals'], data)
      setGoalSaveError(null)
      setGoalSaveSuccess('Goals saved.')
      window.setTimeout(() => setGoalSaveSuccess(null), 2500)
    },
    onError: (err: Error) => {
      setGoalSaveError(err.message || 'Could not save goals. Please try again.')
      setGoalSaveSuccess(null)
    },
  })

  useEffect(() => {
    const base = toGoalFormState(goalSettings)
    if (measurementSystem === 'imperial' && goalSettings?.target_weight_kg != null) {
      base.target_weight_kg = (goalSettings.target_weight_kg * KG_TO_LB).toFixed(1)
    }
    setGoalForm(base)
  }, [goalSettings, measurementSystem])

  const handleLogout = async () => {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      await api.post('/auth/logout')
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      await queryClient.invalidateQueries({ queryKey: ['today'] })
      window.location.assign('/')
    } catch (err: unknown) {
      setLogoutError((err as Error)?.message ?? 'Failed to sign out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  const handleGoalChange = (field: keyof GoalFormState, value: string) => {
    setGoalSaveError(null)
    setGoalSaveSuccess(null)
    setGoalForm((current) => ({ ...current, [field]: value }))
  }

  const handleGoalSubmit = () => {
    setGoalSaveError(null)
    setGoalSaveSuccess(null)
    goalMutation.mutate({
      target_weight_kg: convertWeightToKg(parseOptionalNumber(goalForm.target_weight_kg), measurementSystem),
      target_ldl_mg_dl: parseOptionalInteger(goalForm.target_ldl_mg_dl),
      current_ldl_mg_dl: parseOptionalInteger(goalForm.current_ldl_mg_dl),
      current_ldl_drawn_at: goalForm.current_ldl_drawn_at.trim() || null,
      daily_calorie_target: parseOptionalInteger(goalForm.daily_calorie_target),
      daily_sat_fat_g_max: parseOptionalNumber(goalForm.daily_sat_fat_g_max),
      daily_soluble_fiber_g: parseOptionalNumber(goalForm.daily_soluble_fiber_g),
      daily_protein_g_min: parseOptionalNumber(goalForm.daily_protein_g_min),
      dietary_pattern: goalForm.dietary_pattern.trim() || null,
    })
  }

  return (
    <div className="thin-scroll settings-page" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>
      <header className="mobile-hero settings-hero" style={{ marginBottom: 28 }}>
        <div className="mobile-hero-content">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Settings</div>
          <h1 className="mobile-hero-title" style={{ margin: 0, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your account
          </h1>
          <p className="mobile-hero-subcopy settings-hero-subcopy" style={{ margin: '8px 0 0', color: 'var(--fg-tertiary)', fontSize: 14 }}>
            Manage your profile, units, and process health from one place.
          </p>
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-stack settings-primary">
          <div className="glass settings-card" style={{ padding: 24 }}>
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

          <GoalsCard
            goalForm={goalForm}
            onFieldChange={handleGoalChange}
            goalSaveError={goalSaveError}
            goalSaveSuccess={goalSaveSuccess}
            onSubmit={handleGoalSubmit}
            isPending={goalMutation.isPending}
            measurementSystem={measurementSystem}
          />

          <div className="glass settings-card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Session</div>
            <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 16px' }}>
              End your current session on this device.
            </p>
            {logoutError && (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)', borderRadius: 12, fontSize: 13, color: 'var(--bad)' }}>
                {logoutError}
              </div>
            )}
            <button type="button" className="btn" onClick={handleLogout} disabled={loggingOut} style={{ width: '100%', opacity: loggingOut ? 0.7 : 1 }}>
              {loggingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>

        <div className="settings-stack settings-secondary">
          <MeasurementsCard />
          <HaeImportCard />
          <HaeMetricsCard />
          <LlmMetricsCard />
        </div>
      </div>
    </div>
  )
}
