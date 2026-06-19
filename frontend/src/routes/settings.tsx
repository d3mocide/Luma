import { type CSSProperties, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, User } from '../lib/api'
import {
  type GoalSettings, type GoalFormState, type GoalRecommendation,
  emptyGoalForm, toGoalFormState, parseOptionalNumber, parseOptionalInteger,
} from '../components/settings/types'
import { GoalsCard } from '../components/settings/GoalsCard'
import { RecommendGoalsCard } from '../components/settings/RecommendGoalsCard'
import { MeasurementsCard } from '../components/settings/MeasurementsCard'
import { HydrationCard } from '../components/settings/HydrationCard'
import { PasswordCard } from '../components/settings/PasswordCard'
import { NotificationsCard } from '../components/settings/NotificationsCard'
import { LlmMetricsCard } from '../components/settings/LlmMetricsCard'
import { AiConfigCard } from '../components/settings/AiConfigCard'
import { AiPerformanceCard } from '../components/settings/AiPerformanceCard'
import { AiPriceCalculator } from '../components/settings/AiPriceCalculator'
import { AiUsageCard } from '../components/settings/AiUsageCard'
import { AiDataRoutingCard } from '../components/settings/AiDataRoutingCard'
import { HaeMetricsCard } from '../components/settings/HaeMetricsCard'
import { HaeImportCard } from '../components/settings/HaeImportCard'
import { HealthConnectCard } from '../components/settings/HealthConnectCard'
import { DataSourcePicker } from '../components/settings/DataSourcePicker'
import { HaeDiagnosticCard } from '../components/settings/HaeDiagnosticCard'
import { HaeAnalyzeCard } from '../components/settings/HaeAnalyzeCard'
import { InsightsDiagnosticCard } from '../components/settings/InsightsDiagnosticCard'
import { MetricVisibilityCard } from '../components/settings/MetricVisibilityCard'
import { ProfileCard } from '../components/settings/ProfileCard'
import { useMeasurementSystem, convertWeightToKg } from '../lib/measurements'

const KG_TO_LB = 2.2046226218

type SettingsTab = 'account' | 'data-sources' | 'ai-usage' | 'ai-routing' | 'admin'

const TAB_META: Record<SettingsTab, { label: string; minRole?: string }> = {
  'account':        { label: 'Settings' },
  'data-sources':   { label: 'Data Sources' },
  'ai-usage':       { label: 'AI Usage' },
  'ai-routing':     { label: 'AI Routing', minRole: 'operator' },
  'admin':          { label: 'Users', minRole: 'admin' },
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

function DisplayNameRow({ user, last }: { user: User; last?: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.display_name)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (display_name: string) => api.patch<User>('/auth/me', { display_name }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      setEditing(false)
      setError(null)
    },
    onError: (err: Error) => setError(err.message || 'Could not update name.'),
  })

  const beginEdit = () => {
    setName(user.display_name)
    setError(null)
    setEditing(true)
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name cannot be empty.')
      return
    }
    if (trimmed === user.display_name) {
      setEditing(false)
      return
    }
    mutation.mutate(trimmed)
  }

  const rowStyle = { padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--glass-edge)' }
  const smallBtn = {
    background: 'var(--glass-2, rgba(255, 255, 255, 0.05))',
    border: '1px solid var(--glass-edge, rgba(255, 255, 255, 0.1))',
    fontSize: 11,
    color: 'var(--fg-tertiary)',
    cursor: 'pointer',
    padding: '3px 8px',
    borderRadius: 6,
  } as const

  if (!editing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...rowStyle }}>
        <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>Name</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{user.display_name}</span>
          <button type="button" onClick={beginEdit} style={smallBtn}>Edit</button>
        </div>
      </div>
    )
  }

  return (
    <div style={rowStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>Name</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setEditing(false); setError(null) }
            }}
            maxLength={100}
            className="field-input"
            style={{ fontSize: 13, padding: '4px 8px', width: 160, textAlign: 'right' }}
          />
          <button type="button" onClick={save} disabled={mutation.isPending} style={{ ...smallBtn, color: 'var(--sky-400)', borderColor: 'rgba(14,165,233,0.3)' }}>
            {mutation.isPending ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setError(null) }} style={smallBtn}>Cancel</button>
        </div>
      </div>
      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--bad)', textAlign: 'right' }}>{error}</div>
      )}
    </div>
  )
}

function CopyRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--glass-edge)' }}>
      <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--fg-secondary, #94a3b8)' }}>{value}</span>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            background: 'var(--glass-2, rgba(255, 255, 255, 0.05))',
            border: '1px solid var(--glass-edge, rgba(255, 255, 255, 0.1))',
            fontSize: 11,
            color: copied ? '#10b981' : 'var(--fg-tertiary)',
            cursor: 'pointer',
            padding: '3px 8px',
            borderRadius: 6,
            transition: 'all 0.2s',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
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

// ── Family status sharing card ────────────────────────────────────────────────

interface Preference { kind: string; value: string }

function FamilyStatusCard() {
  const queryClient = useQueryClient()

  const { data: prefs = [] } = useQuery<Preference[]>({
    queryKey: ['preferences'],
    queryFn: () => api.get('/preferences'),
  })

  const isEnabled = prefs.some((p) => p.kind === 'share_family_status' && p.value === 'true')

  const enableMutation = useMutation({
    mutationFn: () => api.post('/preferences', { kind: 'share_family_status', value: 'true' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  })

  const disableMutation = useMutation({
    mutationFn: () => api.delete(`/preferences/share_family_status/${encodeURIComponent('true')}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preferences'] }),
  })

  const isPending = enableMutation.isPending || disableMutation.isPending

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Family</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 4 }}>
            Share daily summary
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
            Let family group members see your daily calorie progress (% of goal). Biometrics and health details are never shared.
          </div>
        </div>
        <button
          type="button"
          onClick={() => isEnabled ? disableMutation.mutate() : enableMutation.mutate()}
          disabled={isPending}
          style={{
            flexShrink: 0,
            width: 40, height: 22, borderRadius: 11,
            background: isEnabled ? 'var(--sky-400)' : 'var(--glass-2)',
            border: `1px solid ${isEnabled ? 'var(--sky-400)' : 'var(--glass-edge)'}`,
            cursor: isPending ? 'wait' : 'pointer',
            position: 'relative',
            transition: 'background 200ms, border-color 200ms',
            opacity: isPending ? 0.7 : 1,
          }}
          aria-label={isEnabled ? 'Disable daily summary sharing' : 'Enable daily summary sharing'}
        >
          <span style={{
            position: 'absolute',
            top: 2,
            left: isEnabled ? 20 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: 'white',
            transition: 'left 200ms',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </button>
      </div>
    </div>
  )
}

// ── Tab panels ─────────────────────────────────────────────────────────────────

function AccountTab({
  user,
  userLoading,
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
  userLoading: boolean
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
        <div className="glass settings-card settings-order-account" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Account</div>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <DisplayNameRow user={user} />
              <Row label="Email" value={user.email} />
              <Row label="Role"  value={user.role} />
              <CopyRow label="User ID" value={user.id} last />
            </div>
          ) : userLoading ? (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>Loading your account…</p>
          ) : (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>Not signed in</p>
          )}
        </div>

        <div className="settings-order-measurements">
          <MeasurementsCard />
        </div>
        <div className="settings-order-hydration">
          <HydrationCard />
        </div>
        <div className="settings-order-notifications">
          <NotificationsCard />
        </div>
        <div className="settings-order-family">
          <FamilyStatusCard />
        </div>
        <div className="settings-order-password">
          <PasswordCard />
        </div>

        <div className="glass settings-card settings-order-session" style={{ padding: 24 }}>
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
        <div className="settings-order-profile">
          <ProfileCard />
        </div>
        <div className="settings-order-suggested">
          <RecommendGoalsCard onApply={onApplyRecommendations} isSaving={isPending} />
        </div>
        <div className="settings-order-goals">
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
    </div>
  )
}

function DataSourcesTab({ user, isOperator }: { user: User | undefined; isOperator: boolean }) {
  const source = user?.data_source ?? 'apple_health'
  return (
    <div className="settings-grid">
      {/* Left: source selection + the active source's config */}
      <div className="settings-stack settings-primary">
        <DataSourcePicker />
        {source === 'health_connect' ? <HealthConnectCard /> : <HaeImportCard />}
        <HaeMetricsCard />
        <MetricVisibilityCard />
      </div>

      {/* Right: data coverage (all users) + payload analyzer (operator only) */}
      <div className="settings-stack settings-secondary">
        <HaeDiagnosticCard />
        {isOperator && <HaeAnalyzeCard />}
      </div>
    </div>
  )
}

function AiUsageTab() {
  return (
    <div className="settings-grid">
      <div className="settings-stack settings-primary">
        <AiUsageCard />
      </div>
      <div className="settings-stack settings-secondary">
        <AiDataRoutingCard />
      </div>
    </div>
  )
}

function AiRoutingTab({ isOperator }: { isOperator: boolean }) {
  if (!isOperator) return <AccessDenied />
  return (
    <div className="settings-grid">
      {/* Left: active LLM events & activity metrics */}
      <div className="settings-stack settings-primary">
        <LlmMetricsCard />
        <AiPriceCalculator />
      </div>

      {/* Right: AI model configurations & provider performance stats */}
      <div className="settings-stack settings-secondary">
        <AiPerformanceCard />
        <AiConfigCard />
        <InsightsDiagnosticCard />
      </div>
    </div>
  )
}

// ── Admin tab types ────────────────────────────────────────────────────────────

interface AdminUserRecord {
  id: string
  email: string
  display_name: string
  role: string
}

interface AdminCreateUserResponse {
  user: AdminUserRecord
  temporary_password: string
}

interface AdminResetPasswordResponse {
  temporary_password: string
}

interface TempPasswordAlert {
  label: string
  password: string
  emailSent?: boolean
}

interface SmtpConfigSnapshot {
  send_path: string
  smtp_host: string
  smtp_port: number
  smtp_from: string
  smtp_user: string
  smtp_use_tls: boolean
  smtp_oauth_token_url: string
  smtp_oauth_client_id: string
  smtp_oauth_client_secret_set: boolean
  app_base_url: string
}

interface TestEmailResponse {
  ok: boolean
  to: string
  config: SmtpConfigSnapshot
  error: string | null
}

// ── SMTP Diagnostic Card ───────────────────────────────────────────────────────

function SmtpDiagnosticCard() {
  const [result, setResult] = useState<TestEmailResponse | null>(null)
  const [sending, setSending] = useState(false)

  const handleTest = async () => {
    setSending(true)
    setResult(null)
    try {
      const data = await api.post<TestEmailResponse>('/admin/test-email')
      setResult(data)
    } catch (err) {
      setResult({
        ok: false,
        to: '',
        config: {
          send_path: 'disabled',
          smtp_host: '',
          smtp_port: 587,
          smtp_from: '',
          smtp_user: '',
          smtp_use_tls: true,
          smtp_oauth_token_url: '',
          smtp_oauth_client_id: '',
          smtp_oauth_client_secret_set: false,
          app_base_url: '',
        },
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSending(false)
    }
  }

  const cfgRow = (label: string, value: string | number | boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--glass-edge)' }}>
      <span style={{ fontSize: 12, color: 'var(--fg-tertiary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: typeof value === 'boolean' ? (value ? 'var(--good)' : 'var(--bad)') : 'var(--fg-secondary)', textAlign: 'right', marginLeft: 12, wordBreak: 'break-all' }}>
        {String(value)}
      </span>
    </div>
  )

  const PATH_LABELS: Record<string, { label: string; color: string }> = {
    graph:      { label: 'Microsoft Graph API', color: 'var(--sky-400)' },
    xoauth2:    { label: 'SMTP XOAUTH2',        color: 'var(--sun-300)' },
    basic_auth: { label: 'SMTP Basic Auth',      color: 'var(--fg-secondary)' },
    disabled:   { label: 'Disabled',             color: 'var(--bad)' },
  }

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>Email Diagnostics</div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
        Send a real test email to your admin address and inspect the active configuration.
      </p>

      <button
        type="button"
        className="btn"
        onClick={handleTest}
        disabled={sending}
        style={{ width: '100%', marginBottom: 16, opacity: sending ? 0.7 : 1 }}
      >
        {sending ? 'Sending…' : 'Send test email'}
      </button>

      {result && (
        <>
          <div style={{
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 14,
            background: result.ok ? 'rgba(16,185,129,0.08)' : 'rgba(251,113,133,0.08)',
            border: `1px solid ${result.ok ? 'rgba(16,185,129,0.25)' : 'rgba(251,113,133,0.25)'}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: result.ok ? 'var(--good)' : 'var(--bad)', marginBottom: result.error ? 6 : 0 }}>
              {result.ok ? `✓ Email sent to ${result.to}` : '✗ Send failed'}
            </div>
            {result.error && (
              <div style={{ fontSize: 12, color: 'var(--bad)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                {result.error}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="eyebrow" style={{ fontSize: 9 }}>Active Config</div>
            {(() => {
              const p = PATH_LABELS[result.config.send_path] ?? { label: result.config.send_path, color: 'var(--fg-quiet)' }
              return (
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: p.color,
                  background: 'var(--glass-2)',
                  border: '1px solid var(--glass-edge)',
                  padding: '2px 8px', borderRadius: 6,
                }}>{p.label}</span>
              )
            })()}
          </div>
          <div style={{ marginBottom: 0 }}>
            {cfgRow('smtp_from', result.config.smtp_from || '(not set)')}
            {cfgRow('smtp_host', result.config.smtp_host || '(not set)')}
            {cfgRow('smtp_port', result.config.smtp_port)}
            {cfgRow('smtp_use_tls', result.config.smtp_use_tls)}
            {cfgRow('smtp_user', result.config.smtp_user || '(not set)')}
            {cfgRow('oauth_token_url', result.config.smtp_oauth_token_url || '(not set)')}
            {cfgRow('oauth_client_id', result.config.smtp_oauth_client_id || '(not set)')}
            {cfgRow('oauth_secret_set', result.config.smtp_oauth_client_secret_set)}
            {cfgRow('app_base_url', result.config.app_base_url)}
          </div>
        </>
      )}
    </div>
  )
}

// ── Admin tab ──────────────────────────────────────────────────────────────────

const ROLES = ['user', 'operator', 'admin']

function AdminTab({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [tempAlert, setTempAlert] = useState<TempPasswordAlert | null>(null)
  const [alertCopied, setAlertCopied] = useState(false)
  const [copiedUuid, setCopiedUuid] = useState<string | null>(null)
  const copyUuid = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedUuid(id)
    window.setTimeout(() => setCopiedUuid(null), 2000)
  }
  const [createForm, setCreateForm] = useState({ email: '', display_name: '', role: 'user' })
  const [createError, setCreateError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: users, isLoading } = useQuery<AdminUserRecord[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<AdminUserRecord[]>('/admin/users'),
  })

  const roleChangeMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch<AdminUserRecord>(`/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setActionError(null)
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<AdminResetPasswordResponse>(`/admin/users/${userId}/reset-password`),
    onSuccess: (data, userId) => {
      const u = users?.find(x => x.id === userId)
      setTempAlert({ label: `Reset for ${u?.display_name ?? 'user'}`, password: data.temporary_password })
      setActionError(null)
    },
    onError: (err: Error) => setActionError(err.message),
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.delete<{ detail: string }>(`/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setConfirmDeleteId(null)
      setActionError(null)
    },
    onError: (err: Error) => {
      setActionError(err.message)
      setConfirmDeleteId(null)
    },
  })

  const createUserMutation = useMutation({
    mutationFn: (body: { email: string; display_name: string; role: string }) =>
      api.post<AdminCreateUserResponse>('/admin/users', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setTempAlert({
        label: `New user: ${data.user.display_name}`,
        password: data.temporary_password,
        emailSent: true,
      })
      setCreateForm({ email: '', display_name: '', role: 'user' })
      setCreateError(null)
    },
    onError: (err: Error) => setCreateError(err.message),
  })

  const handleCopyAlert = async () => {
    if (!tempAlert) return
    await navigator.clipboard.writeText(tempAlert.password)
    setAlertCopied(true)
    window.setTimeout(() => setAlertCopied(false), 2000)
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    background: 'var(--glass-2)',
    border: '1px solid var(--glass-edge)',
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--fg-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const selectStyle: CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    color: 'var(--fg-secondary)',
  }

  const smallBtnBase: CSSProperties = {
    background: 'var(--glass-2)',
    border: '1px solid var(--glass-edge)',
    color: 'var(--fg-tertiary)',
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {tempAlert && (
        <div style={{
          padding: '14px 20px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginBottom: 4 }}>{tempAlert.label}</div>
            <div style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>
              Temporary password:{' '}
              <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--fg-primary)', letterSpacing: '0.05em' }}>
                {tempAlert.password}
              </span>
            </div>
            {tempAlert.emailSent && (
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                📧 Welcome email dispatched (if SMTP is configured)
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={handleCopyAlert} style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: alertCopied ? '#10b981' : 'var(--fg-secondary)',
              fontSize: 12,
              padding: '4px 12px',
              borderRadius: 8,
              cursor: 'pointer',
            }}>
              {alertCopied ? 'Copied!' : 'Copy'}
            </button>
            <button type="button" onClick={() => setTempAlert(null)} style={{
              background: 'transparent',
              border: '1px solid var(--glass-edge)',
              color: 'var(--fg-tertiary)',
              fontSize: 12,
              padding: '4px 12px',
              borderRadius: 8,
              cursor: 'pointer',
            }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div style={{ padding: '10px 16px', background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)', borderRadius: 12, fontSize: 13, color: 'var(--bad)' }}>
          {actionError}
        </div>
      )}

      <div className="settings-grid">
        <div className="settings-stack settings-primary">
          <div className="glass settings-card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>All Users</div>
            {isLoading ? (
              <div style={{ color: 'var(--fg-quiet)', fontSize: 14, padding: '16px 0' }}>Loading…</div>
            ) : !users?.length ? (
              <div style={{ color: 'var(--fg-quiet)', fontSize: 14 }}>No users found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {users.map((u, i) => (
                  <div key={u.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 0',
                    borderBottom: i < users.length - 1 ? '1px solid var(--glass-edge)' : 'none',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: 'var(--glass-2)',
                      border: '1px solid var(--glass-edge)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 600, color: 'var(--fg-secondary)',
                      flexShrink: 0,
                    }}>
                      {u.display_name.charAt(0).toUpperCase()}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {u.display_name}
                        {u.id === currentUserId && (
                          <span style={{ fontSize: 10, color: 'var(--fg-tertiary)', background: 'var(--glass-2)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--glass-edge)' }}>you</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                      <button
                        type="button"
                        onClick={() => copyUuid(u.id)}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          textAlign: 'left', display: 'block', width: '100%',
                        }}
                        title="Copy UUID"
                      >
                        <span style={{
                          fontSize: 10, fontFamily: 'var(--font-mono)',
                          color: copiedUuid === u.id ? 'var(--fg-good)' : 'var(--fg-quiet)',
                          display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {copiedUuid === u.id ? 'copied!' : u.id}
                        </span>
                      </button>
                    </div>

                    <select
                      value={u.role}
                      disabled={u.id === currentUserId || roleChangeMutation.isPending}
                      onChange={(e) => roleChangeMutation.mutate({ userId: u.id, role: e.target.value })}
                      style={{
                        background: 'var(--glass-2)',
                        border: '1px solid var(--glass-edge)',
                        color: 'var(--fg-secondary)',
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 8,
                        cursor: u.id === currentUserId ? 'not-allowed' : 'pointer',
                        opacity: u.id === currentUserId ? 0.5 : 1,
                      }}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>

                    <button
                      type="button"
                      onClick={() => resetPasswordMutation.mutate(u.id)}
                      disabled={resetPasswordMutation.isPending}
                      style={smallBtnBase}
                    >
                      Reset PW
                    </button>

                    {u.id !== currentUserId && (
                      confirmDeleteId === u.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => deleteUserMutation.mutate(u.id)}
                            disabled={deleteUserMutation.isPending}
                            style={{ ...smallBtnBase, background: 'rgba(251,113,133,0.15)', border: '1px solid rgba(251,113,133,0.3)', color: 'var(--bad)' }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            style={{ ...smallBtnBase, background: 'transparent' }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(u.id)}
                          style={{ ...smallBtnBase, background: 'transparent' }}
                        >
                          Delete
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="settings-stack settings-secondary">
          <div className="glass settings-card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 16 }}>Add User</div>

            {createError && (
              <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)', borderRadius: 12, fontSize: 13, color: 'var(--bad)' }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 6 }}>Display name</label>
                <input
                  type="text"
                  value={createForm.display_name}
                  onChange={(e) => setCreateForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="Jane Smith"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 6 }}>Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 6 }}>Role</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm(f => ({ ...f, role: e.target.value }))}
                  style={selectStyle}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (!createForm.email.trim() || !createForm.display_name.trim()) {
                    setCreateError('Name and email are required.')
                    return
                  }
                  setCreateError(null)
                  createUserMutation.mutate(createForm)
                }}
                disabled={createUserMutation.isPending}
                style={{ width: '100%', marginTop: 4, opacity: createUserMutation.isPending ? 0.7 : 1 }}
              >
                {createUserMutation.isPending ? 'Creating…' : 'Create user'}
              </button>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-quiet)' }}>
                A temporary password is generated and a welcome email dispatched if SMTP is configured.
              </p>
            </div>
          </div>

          <SmtpDiagnosticCard />
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsRoute() {
  const queryClient = useQueryClient()
  const measurementSystem = useMeasurementSystem()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [goalSaveError, setGoalSaveError] = useState<string | null>(null)
  const [goalSaveSuccess, setGoalSaveSuccess] = useState<string | null>(null)
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm)

  const tabParam = searchParams.get('tab')
  const activeTab: SettingsTab = tabParam && tabParam in TAB_META ? (tabParam as SettingsTab) : 'account'

  const setActiveTab = useCallback((id: SettingsTab) => {
    const next = new URLSearchParams(searchParams)
    if (id === 'account') next.delete('tab')
    else next.set('tab', id)
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
  })

  useEffect(() => {
    if (user && !hasRole(user, TAB_META[activeTab].minRole)) {
      setActiveTab('account')
    }
  }, [user, activeTab, setActiveTab])

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
      ...(rec.daily_sodium_mg_max != null ? { daily_sodium_mg_max: String(rec.daily_sodium_mg_max) } : {}),
    }))
    goalMutation.mutate({
      target_weight_kg: convertWeightToKg(parseOptionalNumber(goalForm.target_weight_kg), measurementSystem),
      target_ldl_mg_dl: parseOptionalInteger(goalForm.target_ldl_mg_dl),
      current_ldl_mg_dl: parseOptionalInteger(goalForm.current_ldl_mg_dl),
      current_ldl_drawn_at: goalForm.current_ldl_drawn_at.trim() || null,
      daily_calorie_target: rec.daily_calorie_target,
      daily_sat_fat_g_max: rec.daily_sat_fat_g_max,
      daily_soluble_fiber_g: rec.daily_soluble_fiber_g,
      daily_protein_g_min: rec.daily_protein_g_min ?? null,
      daily_sodium_mg_max: rec.daily_sodium_mg_max ?? 2300.0,
      dietary_pattern: goalForm.dietary_pattern.trim() || null,
    })
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
      daily_sodium_mg_max: parseOptionalNumber(goalForm.daily_sodium_mg_max),
      dietary_pattern: goalForm.dietary_pattern.trim() || null,
    })
  }

  const isOperator = hasRole(user, 'operator')
  const tabs: SettingsTab[] = ['account', 'data-sources', 'ai-usage', 'ai-routing', 'admin']
  const visibleTabs = tabs.filter((id) => hasRole(user, TAB_META[id].minRole))

  return (
    <div className="thin-scroll settings-page" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>
      <header className="mobile-hero settings-hero" style={{ marginBottom: 20 }}>
        <div className="mobile-hero-content">
          <h1 className="mobile-hero-title" style={{ margin: 0, fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your account
          </h1>
          <p className="mobile-hero-subcopy settings-hero-subcopy" style={{ margin: '8px 0 0', color: 'var(--fg-tertiary)', fontSize: 14 }}>
            Manage your profile, units, and health data from one place.
          </p>
        </div>
      </header>

      {/* Tab strip */}
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {visibleTabs.map((id, idx) => {
          const { label } = TAB_META[id]
          const selected = activeTab === id
          return (
            <button
              key={id}
              id={`settings-tab-${id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`settings-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              className="settings-tab"
              onClick={() => setActiveTab(id)}
              onKeyDown={(e) => {
                let nextIdx: number | null = null
                if (e.key === 'ArrowRight') nextIdx = (idx + 1) % visibleTabs.length
                else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + visibleTabs.length) % visibleTabs.length
                else if (e.key === 'Home') nextIdx = 0
                else if (e.key === 'End') nextIdx = visibleTabs.length - 1
                if (nextIdx !== null) {
                  e.preventDefault()
                  const nextId = visibleTabs[nextIdx]
                  setActiveTab(nextId)
                  document.getElementById(`settings-tab-${nextId}`)?.focus()
                }
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Tab panels */}
      {activeTab === 'account' && (
        <div role="tabpanel" id="settings-panel-account" aria-labelledby="settings-tab-account">
          <AccountTab
            user={user}
            userLoading={userLoading}
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
        </div>
      )}

      {activeTab === 'data-sources' && (
        <div role="tabpanel" id="settings-panel-data-sources" aria-labelledby="settings-tab-data-sources">
          <DataSourcesTab user={user} isOperator={isOperator} />
        </div>
      )}

      {activeTab === 'ai-usage' && (
        <div role="tabpanel" id="settings-panel-ai-usage" aria-labelledby="settings-tab-ai-usage">
          <AiUsageTab />
        </div>
      )}

      {activeTab === 'ai-routing' && (
        <div role="tabpanel" id="settings-panel-ai-routing" aria-labelledby="settings-tab-ai-routing">
          <AiRoutingTab isOperator={isOperator} />
        </div>
      )}

      {activeTab === 'admin' && (
        <div role="tabpanel" id="settings-panel-admin" aria-labelledby="settings-tab-admin">
          {hasRole(user, 'admin')
            ? <AdminTab currentUserId={user?.id ?? ''} />
            : <AccessDenied />}
        </div>
      )}
    </div>
  )
}
