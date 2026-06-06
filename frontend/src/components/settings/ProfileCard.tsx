import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type User } from '../../lib/api'
import { useMeasurementSystem } from '../../lib/measurements'

const CM_TO_IN = 0.393701
const IN_TO_CM = 2.54

const SEX_OPTIONS = [
  { value: 'male',              label: 'Male' },
  { value: 'female',            label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const

const ACTIVITY_OPTIONS = [
  { value: 'sedentary',         label: 'Sedentary',         desc: 'Desk job, little exercise' },
  { value: 'lightly_active',    label: 'Light',             desc: '1–3 days/week exercise' },
  { value: 'moderately_active', label: 'Moderate',          desc: '3–5 days/week exercise' },
  { value: 'very_active',       label: 'Very active',       desc: '6–7 days/week hard training' },
] as const

function SegmentControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null | undefined
  options: readonly { value: T; label: string; desc?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          title={opt.desc}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid var(--glass-edge)',
            background: value === opt.value ? 'var(--color-accent, #6366f1)' : 'transparent',
            color: value === opt.value ? '#fff' : 'var(--fg-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: value === opt.value ? 600 : 400,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function ProfileCard() {
  const qc = useQueryClient()
  const { data: user } = useQuery<User>({ queryKey: ['me'], queryFn: () => api.get('/auth/me') })
  const measurementSystem = useMeasurementSystem()
  const isImperial = measurementSystem === 'imperial'

  // Local form state
  const [birthYear, setBirthYear] = useState<string>('')
  const [sex, setSex] = useState<string | null>(null)
  const [heightRaw, setHeightRaw] = useState<string>('')  // ft or cm depending on system
  const [heightIn, setHeightIn] = useState<string>('')    // inches part (imperial only)
  const [activity, setActivity] = useState<string | null>(null)
  const [initialised, setInitialised] = useState(false)
  const [saved, setSaved] = useState(false)

  // Populate once user loads
  if (user && !initialised) {
    setBirthYear(user.birth_year ? String(user.birth_year) : '')
    setSex(user.biological_sex ?? null)
    setActivity(user.activity_level ?? null)
    if (user.height_cm) {
      if (isImperial) {
        const totalIn = user.height_cm * CM_TO_IN
        setHeightRaw(String(Math.floor(totalIn / 12)))
        setHeightIn(String(Math.round(totalIn % 12)))
      } else {
        setHeightRaw(String(Math.round(user.height_cm)))
      }
    }
    setInitialised(true)
  }

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<User>('/auth/me', body),
    onSuccess: (updated) => {
      qc.setQueryData(['me'], updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function save() {
    const body: Record<string, unknown> = {}
    if (birthYear) {
      const yr = parseInt(birthYear, 10)
      if (!isNaN(yr)) body.birth_year = yr
    }
    if (sex) body.biological_sex = sex
    if (activity) body.activity_level = activity

    let height_cm: number | null = null
    if (isImperial && heightRaw) {
      const ft = parseInt(heightRaw, 10) || 0
      const inch = parseInt(heightIn, 10) || 0
      height_cm = (ft * 12 + inch) * IN_TO_CM
    } else if (!isImperial && heightRaw) {
      height_cm = parseFloat(heightRaw)
    }
    if (height_cm && height_cm > 0) body.height_cm = height_cm

    mutation.mutate(body)
  }

  const currentYear = new Date().getFullYear()
  const age = birthYear && !isNaN(parseInt(birthYear, 10)) ? currentYear - parseInt(birthYear, 10) : null

  return (
    <div className="glass" style={{ padding: 24, marginTop: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>Profile</div>
      <p style={{ fontSize: 13, color: 'var(--fg-tertiary)', marginBottom: 20, marginTop: 4 }}>
        Used to personalise your Dietary Reference Intake values and AI recommendations.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Birth year */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--fg-tertiary)', display: 'block', marginBottom: 6 }}>
            Birth year{age !== null && age > 0 ? ` (age ${age})` : ''}
          </label>
          <input
            type="number"
            value={birthYear}
            onChange={e => setBirthYear(e.target.value)}
            placeholder={String(currentYear - 35)}
            min={1920}
            max={currentYear - 13}
            style={{
              background: 'var(--glass-edge)',
              border: '1px solid var(--glass-edge)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              color: 'var(--fg-primary)',
              width: 110,
            }}
          />
        </div>

        {/* Biological sex */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--fg-tertiary)', display: 'block', marginBottom: 6 }}>
            Biological sex <span style={{ fontWeight: 400, opacity: 0.7 }}>(for nutritional DRI — not used elsewhere)</span>
          </label>
          <SegmentControl value={sex} options={SEX_OPTIONS} onChange={setSex} />
        </div>

        {/* Height */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--fg-tertiary)', display: 'block', marginBottom: 6 }}>
            Height
          </label>
          {isImperial ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                value={heightRaw}
                onChange={e => setHeightRaw(e.target.value)}
                placeholder="5"
                min={3} max={8}
                style={{ background: 'var(--glass-edge)', border: '1px solid var(--glass-edge)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--fg-primary)', width: 70 }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>ft</span>
              <input
                type="number"
                value={heightIn}
                onChange={e => setHeightIn(e.target.value)}
                placeholder="10"
                min={0} max={11}
                style={{ background: 'var(--glass-edge)', border: '1px solid var(--glass-edge)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--fg-primary)', width: 70 }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>in</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                value={heightRaw}
                onChange={e => setHeightRaw(e.target.value)}
                placeholder="175"
                min={100} max={250}
                style={{ background: 'var(--glass-edge)', border: '1px solid var(--glass-edge)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--fg-primary)', width: 90 }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>cm</span>
            </div>
          )}
        </div>

        {/* Activity level */}
        <div>
          <label style={{ fontSize: 12, color: 'var(--fg-tertiary)', display: 'block', marginBottom: 6 }}>
            Activity level
          </label>
          <SegmentControl value={activity} options={ACTIVITY_OPTIONS} onChange={setActivity} />
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={mutation.isPending}
            style={{ padding: '8px 20px', fontSize: 13 }}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {saved && <span style={{ fontSize: 12, color: 'var(--good)' }}>Saved</span>}
          {mutation.isError && <span style={{ fontSize: 12, color: 'var(--color-warning)' }}>Save failed</span>}
        </div>

      </div>
    </div>
  )
}
