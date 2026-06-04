import { useHiddenMetrics } from '../../lib/hidden-metrics'

// Metrics that surface in the Today biometrics panel
const TODAY_PANEL_IDS = new Set([
  'hrv_ms', 'rhr_bpm', 'sleep_duration_min', 'sleep_score',
  'spo2_pct', 'steps', 'active_kcal', 'exercise_min',
  'respiratory_rate_bpm', 'body_temp_c',
])

const GROUPS = [
  {
    label: 'Vitals & Composition',
    metrics: [
      { id: 'spo2_pct',            label: 'Blood Oxygen' },
      { id: 'body_temp_c',         label: 'Body Temp' },
      { id: 'heart_rate_avg_bpm',  label: 'Avg Heart Rate' },
      { id: 'walking_hr_bpm',      label: 'Walking Heart Rate' },
      { id: 'bp_systolic_mmhg',    label: 'Systolic BP' },
      { id: 'bp_diastolic_mmhg',   label: 'Diastolic BP' },
      { id: 'bmi',                 label: 'BMI' },
      { id: 'body_fat_pct',        label: 'Body Fat' },
    ],
  },
  {
    label: 'Recovery & Sleep',
    metrics: [
      { id: 'hrv_ms',                  label: 'HRV' },
      { id: 'rhr_bpm',                 label: 'Resting HR' },
      { id: 'sleep_duration_min',      label: 'Sleep Duration' },
      { id: 'sleep_score',             label: 'Sleep Score' },
      { id: 'respiratory_rate_bpm',    label: 'Respiratory Rate' },
      { id: 'wrist_temp_c',            label: 'Wrist Temp Deviation' },
      { id: 'breathing_disturbances',  label: 'Breathing Disturbances' },
    ],
  },
  {
    label: 'Activity & Energy',
    metrics: [
      { id: 'steps',       label: 'Steps' },
      { id: 'active_kcal', label: 'Active Calories' },
      { id: 'exercise_min', label: 'Exercise' },
      { id: 'distance_km', label: 'Distance' },
      { id: 'stand_hours', label: 'Stand Hours' },
      { id: 'daylight_min', label: 'Daylight Exposure' },
      { id: 'mindful_min', label: 'Mindfulness' },
    ],
  },
  {
    label: 'Gait & Posture',
    metrics: [
      { id: 'walking_speed_kmh',      label: 'Walking Speed' },
      { id: 'walking_asymmetry_pct',  label: 'Walking Asymmetry' },
      { id: 'step_length_cm',         label: 'Step Length' },
      { id: 'double_support_pct',     label: 'Double Support Time' },
      { id: 'stair_speed_up_mps',     label: 'Stair Speed Up' },
      { id: 'stair_speed_down_mps',   label: 'Stair Speed Down' },
    ],
  },
]

export function MetricVisibilityCard() {
  const { hidden, toggle, isLoading } = useHiddenMetrics()

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Metric Visibility</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 20px' }}>
        Hide metrics you don't track. Hidden metrics are removed from the Today panel and Trends page.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {GROUPS.map(group => (
          <div key={group.label}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginBottom: 8 }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {group.metrics.map((m, i) => {
                const isHidden = hidden.has(m.id)
                const isLast = i === group.metrics.length - 1
                return (
                  <label
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: isLast ? 'none' : '1px solid var(--glass-edge)',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: isHidden ? 'var(--fg-tertiary)' : 'var(--fg-primary)' }}>
                        {m.label}
                      </span>
                      {TODAY_PANEL_IDS.has(m.id) && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                          textTransform: 'uppercase', padding: '2px 6px',
                          borderRadius: 4, background: 'var(--glass-2)',
                          border: '1px solid var(--glass-edge)',
                          color: 'var(--fg-tertiary)',
                        }}>
                          Today
                        </span>
                      )}
                    </div>
                    <Toggle
                      checked={!isHidden}
                      disabled={isLoading}
                      onChange={() => toggle(m.id)}
                    />
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={{
        flexShrink: 0,
        width: 36,
        height: 20,
        borderRadius: 10,
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: checked ? 'var(--good)' : 'var(--glass-2)',
        position: 'relative',
        transition: 'background 0.2s',
        outline: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: checked ? '#fff' : 'var(--fg-tertiary)',
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}
