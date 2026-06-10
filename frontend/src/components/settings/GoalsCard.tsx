import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { type GoalSettings, type GoalFormState, type MeasurementSystem, formatGoalNumber } from './types'
import { convertWeight, measurementWeightUnit } from '../../lib/measurements'

const predefinedOptions = [
  { value: 'cholesterol-lowering', label: 'Cholesterol-lowering' },
  { value: 'mediterranean',        label: 'Mediterranean' },
  { value: 'heart-healthy',         label: 'Heart-healthy' },
  { value: 'vegetarian',            label: 'Vegetarian' },
  { value: 'vegan',                 label: 'Vegan' },
  { value: 'low-carb',              label: 'Low-carb' },
]

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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, gridColumn: fullWidth ? '1 / -1' : 'auto' }}>
      <div className="eyebrow" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10 }}>
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
  measurementSystem: MeasurementSystem
}

export function GoalsCard({ goalForm, onFieldChange, goalSaveError, goalSaveSuccess, onSubmit, isPending, measurementSystem }: Props) {
  const weightUnit = measurementWeightUnit(measurementSystem)
  const { data: goalSettings, isLoading: goalLoading } = useQuery<Partial<GoalSettings>>({
    queryKey: ['settings', 'goals'],
    queryFn: () => api.get('/goals'),
  })

  const currentPattern = goalForm.dietary_pattern || 'cholesterol-lowering'
  const isPredefined = predefinedOptions.some(p => p.value === currentPattern.toLowerCase())

  const [isCustomMode, setIsCustomMode] = useState(false)

  useEffect(() => {
    const isPre = predefinedOptions.some(p => p.value === (goalForm.dietary_pattern || '').toLowerCase())
    if (goalForm.dietary_pattern && !isPre) {
      setIsCustomMode(true)
    } else {
      setIsCustomMode(false)
    }
  }, [goalForm.dietary_pattern])

  const selectValue = isCustomMode ? 'custom' : (isPredefined ? currentPattern.toLowerCase() : 'custom')

  const handleSelectChange = (val: string) => {
    if (val === 'custom') {
      setIsCustomMode(true)
      onFieldChange('dietary_pattern', '')
    } else {
      setIsCustomMode(false)
      onFieldChange('dietary_pattern', val)
    }
  }

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
        <SummaryPill label="Target weight" value={formatGoalNumber(convertWeight(goalSettings?.target_weight_kg, measurementSystem), 1, weightUnit)} />
        <SummaryPill label="Target LDL" value={formatGoalNumber(goalSettings?.target_ldl_mg_dl, 0, 'mg/dL')} />
        <SummaryPill label="Calories" value={formatGoalNumber(goalSettings?.daily_calorie_target, 0, 'kcal')} />
        <SummaryPill label="Sat fat max" value={formatGoalNumber(goalSettings?.daily_sat_fat_g_max, 1, 'g')} />
        <SummaryPill label="Sugar max" value={formatGoalNumber(goalSettings?.daily_sugar_g_max, 1, 'g')} />
      </div>

      <div className="settings-goals-grid">
        {(
          [
            { field: 'target_weight_kg', label: 'Target weight', unit: weightUnit, mode: 'decimal', placeholder: measurementSystem === 'imperial' ? '172.8' : '78.4' },
            { field: 'target_ldl_mg_dl', label: 'Target LDL', unit: 'mg/dL', mode: 'numeric', placeholder: '100' },
            { field: 'daily_protein_g_min', label: 'Protein floor', unit: 'g', mode: 'decimal', placeholder: '100' },
            { field: 'daily_calorie_target', label: 'Calories', unit: 'kcal', mode: 'numeric', placeholder: '1850' },
            { field: 'daily_sat_fat_g_max', label: 'Sat fat max', unit: 'g', mode: 'decimal', placeholder: '12' },
            { field: 'daily_soluble_fiber_g', label: 'Soluble fiber', unit: 'g', mode: 'decimal', placeholder: '18' },
            { field: 'current_ldl_mg_dl', label: 'Current LDL', unit: 'mg/dL', mode: 'numeric', placeholder: '132' },
            { field: 'daily_sugar_g_max', label: 'Sugar limit', unit: 'g', mode: 'decimal', placeholder: '36' },
          ] as { field: keyof GoalFormState; label: string; unit: string; mode: 'decimal' | 'numeric'; placeholder: string }[]
        ).map(({ field, label, unit, mode, placeholder }) => (
          <Field key={field} label={label} unit={unit}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 14px',
              border: '1px solid var(--glass-edge)',
              borderRadius: 14,
              background: 'var(--glass-1)',
              transition: 'all 150ms ease-out',
            }} className="field-input">
              <input
                value={goalForm[field]}
                onChange={(e) => onFieldChange(field, e.target.value)}
                inputMode={mode}
                placeholder={placeholder}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--fg-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                }}
              />
            </div>
          </Field>
        ))}
        <Field label="Last LDL test" unit="date drawn">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            border: '1px solid var(--glass-edge)',
            borderRadius: 14,
            background: 'var(--glass-1)',
            transition: 'all 150ms ease-out',
          }} className="field-input">
            <input
              type="date"
              value={goalForm.current_ldl_drawn_at}
              onChange={(e) => onFieldChange('current_ldl_drawn_at', e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-primary)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
              }}
            />
          </div>
        </Field>
        <Field label="Dietary pattern" unit="selection" fullWidth>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 14px',
              border: '1px solid var(--glass-edge)',
              borderRadius: 14,
              background: 'var(--glass-1)',
              transition: 'all 150ms ease-out',
            }} className="field-input">
              <select
                value={selectValue}
                onChange={(e) => handleSelectChange(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--fg-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {predefinedOptions.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>
                    {opt.label}
                  </option>
                ))}
                <option value="custom" style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>Custom...</option>
              </select>
            </div>

            {isCustomMode && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                border: '1px solid var(--glass-edge)',
                borderRadius: 14,
                background: 'var(--glass-1)',
                transition: 'all 150ms ease-out',
              }} className="field-input">
                <input
                  value={goalForm.dietary_pattern}
                  onChange={(e) => onFieldChange('dietary_pattern', e.target.value)}
                  placeholder="Enter custom dietary pattern (e.g., keto, plant-forward Mediterranean)..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--fg-primary)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 14,
                  }}
                />
              </div>
            )}
          </div>
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <div style={{ minHeight: 20, fontSize: 13, color: goalSaveError ? 'var(--bad)' : goalSaveSuccess ? 'var(--good)' : 'var(--fg-quiet)' }}>
          {goalSaveError ?? goalSaveSuccess ?? 'These targets guide your meal plans and feedback.'}
        </div>
        <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={isPending} style={{ padding: '8px 20px', fontSize: 13 }}>
          {isPending ? 'Saving…' : 'Save goals'}
        </button>
      </div>
    </div>
  )
}
