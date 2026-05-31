import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, User } from '../lib/api'
import {
  type GoalSettings, type GoalFormState, type GoalRecommendation,
  emptyGoalForm, toGoalFormState, parseOptionalNumber, parseOptionalInteger,
} from '../components/settings/types'
import { GoalsCard } from '../components/settings/GoalsCard'
import { RecommendGoalsCard } from '../components/settings/RecommendGoalsCard'
import { MeasurementsCard } from '../components/settings/MeasurementsCard'
import { LlmMetricsCard } from '../components/settings/LlmMetricsCard'
import { HaeMetricsCard } from '../components/settings/HaeMetricsCard'
import { HaeImportCard } from '../components/settings/HaeImportCard'
import { HaeDiagnosticCard } from '../components/settings/HaeDiagnosticCard'
import { HaeAnalyzeCard } from '../components/settings/HaeAnalyzeCard'
import { useMeasurementSystem, convertWeightToKg } from '../lib/measurements'

const KG_TO_LB = 2.2046226218

type SettingsTab = 'account' | 'health-import' | 'ai-routing'

const TAB_META: Record<SettingsTab, { label: string; minRole?: string }> = {
  'account':        { label: 'Settings' },
  'health-import':  { label: 'Health Import' },
  'ai-routing':     { label: 'AI Routing', minRole: 'operator' },
}

function hasRole(user: User | undefined, minRole: string | undefined): boolean {
  if (!minRole) return true
  // Simple linear hierarchy: user < operator < admin
  const ladder = ['user', 'operator', 'admin']
  const userIdx = ladder.indexOf(user?.role ?? '')
  const reqIdx  = ladder.indexOf(minRole)
  return userIdx >= reqIdx
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--glass-edge)' }}>
      <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</span>
    </div>
  )
}

function AccessDenied() {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--fg-quiet)' }}>You don't have permission to view this section.</div>
    </div>
  )
}

// ── Tab panels ─────────────────────────────────────────────────────────────────

function AccountTab({
  user,
  goalForm,
  onFieldChange,
  goalSaveError,
  goalSaveSuccess,
  onSubmit,
  isPending,
  measurementSystem,
  loggingOut,
  logoutError,
  onLogout,
  onApplyRecommendations,
}: {
  user: User | undefined
  goalForm: GoalFormState
  onFieldChange: (field: keyof GoalFormState, value: string) => void
  goalSaveError: string | null
  goalSaveSuccess: string | null
  onSubmit: () => void
  isPending: boolean
  measurementSystem: 'metric' | 'imperial'
  loggingOut: boolean
  logoutError: string | null
  onLogout: () => void
  onApplyRecommendations: (rec: GoalRecommendation) => void
}) {
  return (
    <div className="settings-grid">
      {/* Left: identity + device settings */}
      <div className="settings-stack">
        <div className="glass settings-card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Account</div>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Row label="Name"  value={user.display_name} />
              <Row label="Email" value={user.email} />
              <Row label="Role"  value={user.role} last />
            </div>
          ) : (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>Not signed in</p>
          )}
        </div>

        <MeasurementsCard />

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
          <button
            type="button"
            className="btn"
            onClick={onLogout}
            disabled={loggingOut}
            style={{ width: '100%', opacity: loggingOut ? 0.7 : 1 }}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>

      {/* Right: goals + suggestions */}
      <div className="settings-stack">
        <RecommendGoalsCard onApply={onApplyRecommendations} />

        <GoalsCard
          goalForm={goalForm}
          onFieldChange={onFieldChange}
          goalSaveError={goalSaveError}
          goalSaveSuccess={goalSaveSuccess}
          onSubmit={onSubmit}
          isPending={isPending}
          measurementSystem={measurementSystem}
        />
      </div>
    </div>
  )
}

function HealthImportTab({ isOperator }: { isOperator: boolean }) {
  return (
    <div className="settings-grid">
      {/* Left: config + live metrics */}
      <div className="settings-stack settings-primary">
        <HaeImportCard />
        <HaeMetricsCard />
      </div>

      {/* Right: diagnostic tools (operator only) */}
      <div className="settings-stack settings-secondary">
        {isOperator ? (
          <>
            <HaeDiagnosticCard />
            <HaeAnalyzeCard />
          </>
        ) : (
          <div className="glass settings-card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Diagnostics</div>
            <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>
              Operator role required to view data coverage and the payload analyzer.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function AiRoutingTab({ isOperator }: { isOperator: boolean }) {
  if (!isOperator) return <AccessDenied />
  return (
    <div className="settings-stack" style={{ maxWidth: 680 }}>
      <LlmMetricsCard />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const measurementSystem = useMeasurementSystem()
  const [activeTab, setActiveTab] = useState<SettingsTab>('account')
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

  const handleApplyRecommendations = (rec: GoalRecommendation) => {
    setGoalSaveError(null)
    setGoalSaveSuccess(null)
    setGoalForm((current) => ({
      ...current,
      daily_calorie_target: String(rec.daily_calorie_target),
      daily_sat_fat_g_max: String(rec.daily_sat_fat_g_max),
      daily_soluble_fiber_g: String(rec.daily_soluble_fiber_g),
      ...(rec.daily_protein_g_min != null ? { daily_protein_g_min: String(rec.daily_protein_g_min) } : {}),
    }))
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

  const isOperator = hasRole(user, 'operator')
  const tabs: SettingsTab[] = ['account', 'health-import', 'ai-routing']

  return (
    <div className="thin-scroll settings-page" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>
      <header className="mobile-hero settings-hero" style={{ marginBottom: 20 }}>
        <div className="mobile-hero-content">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Settings</div>
          <h1 className="mobile-hero-title" style={{ margin: 0, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your account
          </h1>
          <p className="mobile-hero-subcopy settings-hero-subcopy" style={{ margin: '8px 0 0', color: 'var(--fg-tertiary)', fontSize: 14 }}>
            Manage your profile, units, and health data from one place.
          </p>
        </div>
      </header>

      {/* Tab strip */}
      <div className="settings-tabs" role="tablist">
        {tabs.map((id) => {
          const { label, minRole } = TAB_META[id]
          const allowed = hasRole(user, minRole)
          return (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              className={`settings-tab${!allowed ? ' settings-tab-locked' : ''}`}
              onClick={() => allowed && setActiveTab(id)}
              title={!allowed ? `Requires ${minRole} role` : undefined}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      {activeTab === 'account' && (
        <AccountTab
          user={user}
          goalForm={goalForm}
          onFieldChange={handleGoalChange}
          goalSaveError={goalSaveError}
          goalSaveSuccess={goalSaveSuccess}
          onSubmit={handleGoalSubmit}
          isPending={goalMutation.isPending}
          measurementSystem={measurementSystem}
          loggingOut={loggingOut}
          logoutError={logoutError}
          onLogout={handleLogout}
          onApplyRecommendations={handleApplyRecommendations}
        />
      )}

      {activeTab === 'health-import' && (
        <HealthImportTab isOperator={isOperator} />
      )}

      {activeTab === 'ai-routing' && (
        <AiRoutingTab isOperator={isOperator} />
      )}
    </div>
  )
}
