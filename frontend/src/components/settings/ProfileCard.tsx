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
  className,
}: {
  value: T | null | undefined
  options: readonly { value: T; label: string; desc?: string }[]
  onChange: (v: T) => void
  className?: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className={className}>
      {options.map(opt => {
        const isActive = value === opt.value
        const isHovered = hovered === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            onMouseEnter={() => setHovered(opt.value)}
            onMouseLeave={() => setHovered(null)}
            title={opt.desc}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: isActive 
                ? '1px solid rgba(56, 189, 248, 0.4)' 
                : '1px solid var(--glass-edge)',
              background: isActive 
                ? 'linear-gradient(180deg, var(--sky-400), var(--sky-500))' 
                : isHovered 
                  ? 'rgba(255, 255, 255, 0.08)' 
                  : 'rgba(255, 255, 255, 0.03)',
              color: isActive 
                ? '#050811' 
                : isHovered 
                  ? 'var(--fg-primary)' 
                  : 'var(--fg-tertiary)',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: isActive ? 600 : 400,
              boxShadow: isActive ? '0 4px 12px -4px rgba(56,189,248,0.4)' : 'none',
              transition: 'all 150ms ease-out',
              outline: 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
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
    <div className="glass settings-card settings-card-spacious" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Profile</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 18px' }}>
        Used to personalise your Dietary Reference Intake values and AI recommendations.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Birth year & Height Row */}
        <div className="profile-form-row">
          
          {/* Birth year */}
          <div style={{ flex: '1 1 120px' }}>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
              Birth year{age !== null && age > 0 ? ` (age ${age})` : ''}
            </label>
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
                type="number"
                value={birthYear}
                onChange={e => setBirthYear(e.target.value)}
                placeholder={String(currentYear - 35)}
                min={1920}
                max={currentYear - 13}
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
          </div>

          {/* Height */}
          <div style={{ flex: '1 1 180px' }}>
            <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
              Height
            </label>
            {isImperial ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                  padding: '10px 14px',
                  border: '1px solid var(--glass-edge)',
                  borderRadius: 14,
                  background: 'var(--glass-1)',
                  transition: 'all 150ms ease-out',
                }} className="field-input">
                  <input
                    type="number"
                    value={heightRaw}
                    onChange={e => setHeightRaw(e.target.value)}
                    placeholder="5"
                    min={3} max={8}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--fg-primary)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 14,
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--fg-quiet)' }}>ft</span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                  padding: '10px 14px',
                  border: '1px solid var(--glass-edge)',
                  borderRadius: 14,
                  background: 'var(--glass-1)',
                  transition: 'all 150ms ease-out',
                }} className="field-input">
                  <input
                    type="number"
                    value={heightIn}
                    onChange={e => setHeightIn(e.target.value)}
                    placeholder="10"
                    min={0} max={11}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--fg-primary)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 14,
                      textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--fg-quiet)' }}>in</span>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                border: '1px solid var(--glass-edge)',
                borderRadius: 14,
                background: 'var(--glass-1)',
                transition: 'all 150ms ease-out',
              }} className="field-input">
                <input
                  type="number"
                  value={heightRaw}
                  onChange={e => setHeightRaw(e.target.value)}
                  placeholder="175"
                  min={100} max={250}
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
                <span style={{ fontSize: 13, color: 'var(--fg-quiet)' }}>cm</span>
              </div>
            )}
          </div>
        </div>

        {/* Biological sex */}
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
            Biological sex <span style={{ textTransform: 'none', letterSpacing: 'normal', color: 'var(--fg-quiet)', fontWeight: 400, fontFamily: 'var(--font-sans)' }}>(for nutritional DRI — not used elsewhere)</span>
          </label>
          <SegmentControl value={sex} options={SEX_OPTIONS} onChange={setSex} className="segment-control-sex" />
        </div>

        {/* Activity level */}
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>
            Activity level <span style={{ textTransform: 'none', letterSpacing: 'normal', color: 'var(--fg-quiet)', fontWeight: 400, fontFamily: 'var(--font-sans)' }}>(auto-updated daily from your step data)</span>
          </label>
          <SegmentControl value={activity} options={ACTIVITY_OPTIONS} onChange={setActivity} className="segment-control-activity" />
          {activity && (
            <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: '8px 0 0', lineHeight: 1.4, fontStyle: 'italic' }}>
              {ACTIVITY_OPTIONS.find(opt => opt.value === activity)?.desc}
            </p>
          )}
        </div>

        {/* Save */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
          {saved && <span style={{ fontSize: 12, color: 'var(--good)' }}>Saved</span>}
          {mutation.isError && <span style={{ fontSize: 12, color: 'var(--color-warning)' }}>Save failed</span>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={mutation.isPending}
            style={{ padding: '8px 20px', fontSize: 13 }}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  )
}

