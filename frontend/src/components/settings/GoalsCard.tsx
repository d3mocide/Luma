import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type GoalSettings, type GoalFormState, formatGoalNumber } from './types'

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-inset" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{label}</div>
      <div className="num" style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</div>
    </div>
  )
}

function Field({ label, unit, fullWidth, children }: { label: string; unit: string; fullWidth?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, gridColumn: fullWidth ? '1 / -1' : 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        <span>{label}</span>
        <span>{unit}</span>
      </div>
      {children}
    </label>
  )
}

type Props = {
  goalForm: GoalFormState
  onFieldChange: (field: keyof GoalFormState, value: string) => void
  goalSaveError: string | null
  goalSaveSuccess: string | null
  onSubmit: () => void
  isPending: boolean
}

export function GoalsCard({ goalForm, onFieldChange, goalSaveError, goalSaveSuccess, onSubmit, isPending }: Props) {
  const { data: goalSettings, isLoading: goalLoading } = useQuery<Partial<GoalSettings>>({
    queryKey: ['settings', 'goals'],
    queryFn: () => api.get('/goals'),
  })

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Goals</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            Your weight, LDL, and macro targets for the current phase.
          </p>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-quiet)', textAlign: 'right', paddingTop: 2 }}>
          {goalLoading ? 'Loading…' : goalSettings ? 'Synced' : 'Unset'}
        </div>
      </div>

      <div className="settings-goals-summary">
        <SummaryPill label="Target weight" value={formatGoalNumber(goalSettings?.target_weight_kg, 1, 'kg')} />
        <SummaryPill label="Target LDL" value={formatGoalNumber(goalSettings?.target_ldl_mg_dl, 0, 'mg/dL')} />
        <SummaryPill label="Calories" value={formatGoalNumber(goalSettings?.daily_calorie_target, 0, 'kcal')} />
        <SummaryPill label="Sat fat max" value={formatGoalNumber(goalSettings?.daily_sat_fat_g_max, 1, 'g')} />
      </div>

      <div className="settings-goals-grid">
        {(
          [
            { field: 'target_weight_kg', label: 'Target weight', unit: 'kg', mode: 'decimal', placeholder: '78.4' },
            { field: 'target_ldl_mg_dl', label: 'Target LDL', unit: 'mg/dL', mode: 'numeric', placeholder: '100' },
            { field: 'current_ldl_mg_dl', label: 'Current LDL', unit: 'mg/dL', mode: 'numeric', placeholder: '132' },
            { field: 'daily_calorie_target', label: 'Calories', unit: 'kcal', mode: 'numeric', placeholder: '1850' },
            { field: 'daily_sat_fat_g_max', label: 'Sat fat max', unit: 'g', mode: 'decimal', placeholder: '12' },
            { field: 'daily_soluble_fiber_g', label: 'Soluble fiber', unit: 'g', mode: 'decimal', placeholder: '18' },
            { field: 'daily_protein_g_min', label: 'Protein floor', unit: 'g', mode: 'decimal', placeholder: '100' },
          ] as const
        ).map(({ field, label, unit, mode, placeholder }) => (
          <Field key={field} label={label} unit={unit}>
            <input
              value={goalForm[field]}
              onChange={(e) => onFieldChange(field, e.target.value)}
              className="field-input"
              inputMode={mode}
              placeholder={placeholder}
            />
          </Field>
        ))}
        <Field label="LDL drawn" unit="date">
          <input
            value={goalForm.current_ldl_drawn_at}
            onChange={(e) => onFieldChange('current_ldl_drawn_at', e.target.value)}
            className="field-input"
            type="date"
          />
        </Field>
        <Field label="Dietary pattern" unit="text" fullWidth>
          <input
            value={goalForm.dietary_pattern}
            onChange={(e) => onFieldChange('dietary_pattern', e.target.value)}
            className="field-input"
            placeholder="Mediterranean, lower-carb, vegetarian…"
          />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ minHeight: 20, fontSize: 13, color: goalSaveError ? 'var(--bad)' : 'var(--fg-quiet)' }}>
          {goalSaveError ?? goalSaveSuccess ?? 'These targets guide your meal plans and feedback.'}
        </div>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={isPending} style={{ padding: '10px 14px' }}>
          {isPending ? 'Saving…' : 'Save goals'}
        </button>
      </div>
    </div>
  )
}
