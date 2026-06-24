import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { NavLink } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { FlaskConical, Settings, TrendingDown, Dumbbell } from 'lucide-react'
import { api } from '../../lib/api'
import type { LdlSimResult, WeightSimResult, ProteinSimResult } from './types'
import { EmptyState } from './shared'

// ---------------------------------------------------------------------------
// LDL Simulator
// ---------------------------------------------------------------------------

function LdlSimulator() {
  const { data: goals } = useQuery<{ current_ldl_mg_dl?: number | null; target_ldl_mg_dl?: number | null }>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals'),
  })

  const [satFatPct, setSatFatPct] = useState(8)
  const [fiberG, setFiberG] = useState(10)
  const [simResult, setSimResult] = useState<LdlSimResult | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const simulateMut = useMutation({
    mutationFn: (body: { target_sat_fat_pct: number; target_soluble_fiber_g: number; weeks: number }) =>
      api.post<LdlSimResult>('/health/ldl-simulate', body),
    onSuccess: (data) => { setSimResult(data); setSimError(null) },
    onError: (err: Error) => setSimError(err.message),
  })

  const hasLdl = goals?.current_ldl_mg_dl != null

  if (!hasLdl) {
    return (
      <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <FlaskConical size={16} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>LDL Simulator</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-quiet)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Set your current LDL in Settings to unlock the dietary impact simulator.
        </p>
        <NavLink
          to="/settings"
          className="btn"
          style={{ display: 'inline-flex', gap: 6, fontSize: 13 }}
        >
          <Settings size={13} /> Open settings
        </NavLink>
      </div>
    )
  }

  const targetLdl = goals?.target_ldl_mg_dl
  const currentLdl = goals.current_ldl_mg_dl!

  return (
    <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <FlaskConical size={16} strokeWidth={1.5} style={{ color: 'var(--sky-300)' }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>LDL Simulator</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: '4px 0 20px', lineHeight: 1.4 }}>
        Adjust dietary targets and project estimated LDL change over 8 weeks using the Mensink-Katan equation.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
        <SliderField
          label="Target saturated fat"
          value={satFatPct}
          min={3}
          max={20}
          step={0.5}
          unit="% of calories"
          onChange={setSatFatPct}
          hint="AHA recommends <7% for LDL lowering"
        />
        <SliderField
          label="Target soluble fiber"
          value={fiberG}
          min={1}
          max={30}
          step={0.5}
          unit="g / day"
          onChange={setFiberG}
          hint="10–20 g/day lowers LDL by 7–14 mg/dL"
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
        disabled={simulateMut.isPending}
        onClick={() => simulateMut.mutate({ target_sat_fat_pct: satFatPct, target_soluble_fiber_g: fiberG, weeks: 8 })}
      >
        {simulateMut.isPending ? 'Simulating…' : 'Run simulation'}
      </button>

      {simError && (
        <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12 }}>{simError}</div>
      )}

      {simResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill label="Current LDL" value={`${currentLdl} mg/dL`} />
            <StatPill
              label="Projected (8 wk)"
              value={`${simResult.projected_ldl} mg/dL`}
              accent={simResult.delta_ldl < 0 ? 'good' : simResult.delta_ldl > 0 ? 'bad' : undefined}
            />
            <StatPill
              label="Change"
              value={`${simResult.delta_ldl > 0 ? '+' : ''}${simResult.delta_ldl} mg/dL`}
              accent={simResult.delta_ldl < 0 ? 'good' : simResult.delta_ldl > 0 ? 'bad' : undefined}
            />
          </div>

          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simResult.trajectory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="week"
                  tickFormatter={(v) => v === 0 ? 'Now' : `W${v}`}
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-2)', border: '1px solid var(--glass-edge)',
                    borderRadius: 10, fontSize: 12, color: 'var(--fg-primary)',
                  }}
                  formatter={(v: number) => [`${v} mg/dL`, 'LDL']}
                  labelFormatter={(l: number) => l === 0 ? 'Now' : `Week ${l}`}
                />
                {targetLdl && (
                  <ReferenceLine
                    y={targetLdl}
                    stroke="var(--good)"
                    strokeDasharray="4 4"
                    label={{ value: `Target ${targetLdl}`, position: 'right', fontSize: 10, fill: 'var(--good)' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="ldl"
                  stroke="var(--sky-300)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--sky-300)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--fg-quiet)', flexWrap: 'wrap' }}>
            <span>Your recent avg: <strong style={{ color: 'var(--fg-secondary)' }}>{simResult.current_avg_sat_fat_pct}% sat fat</strong></span>
            <span>·</span>
            <span><strong style={{ color: 'var(--fg-secondary)' }}>{simResult.current_avg_soluble_fiber_g}g</strong> sol. fiber</span>
          </div>

          <p style={{ fontSize: 11, color: 'var(--fg-quiet)', margin: 0, lineHeight: 1.4 }}>{simResult.note}</p>
        </div>
      )}
    </div>
  )
}

function SliderField({ label, value, min, max, step, unit, onChange, hint }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}>
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', cursor: 'pointer' }}
      />
      {hint && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: 'good' | 'bad' }) {
  const color = accent === 'good' ? 'var(--good)' : accent === 'bad' ? 'var(--bad)' : 'var(--fg-primary)'
  return (
    <div style={{
      flex: 1, padding: '10px 12px', borderRadius: 12,
      background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weight loss simulator (Hall energy balance model)
// ---------------------------------------------------------------------------

function WeightLossSimulator() {
  const [lossRate, setLossRate] = useState(0.5)
  const [weeks, setWeeks] = useState(12)
  const [simResult, setSimResult] = useState<WeightSimResult | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const simulateMut = useMutation({
    mutationFn: (body: { target_weekly_loss_kg: number; weeks: number }) =>
      api.post<WeightSimResult>('/health/weight-simulate', body),
    onSuccess: (data) => { setSimResult(data); setSimError(null) },
    onError: (err: Error) => {
      setSimError(
        err.message.includes('no_weight_data')
          ? 'No weight logged yet — add a weight entry to unlock this simulator.'
          : err.message
      )
    },
  })

  return (
    <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <TrendingDown size={16} strokeWidth={1.5} style={{ color: 'var(--good)' }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>Weight Loss</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: '4px 0 20px', lineHeight: 1.4 }}>
        Project your weight trajectory from a target weekly loss rate using the Hall energy balance model.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
        <SliderField
          label="Target weekly loss"
          value={lossRate}
          min={0.25}
          max={1.0}
          step={0.05}
          unit="kg / week"
          onChange={setLossRate}
          hint="0.5 kg/week is the widely recommended sustainable rate"
        />
        <SliderField
          label="Projection window"
          value={weeks}
          min={4}
          max={52}
          step={4}
          unit="weeks"
          onChange={setWeeks}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
        disabled={simulateMut.isPending}
        onClick={() => simulateMut.mutate({ target_weekly_loss_kg: lossRate, weeks })}
      >
        {simulateMut.isPending ? 'Simulating…' : 'Run simulation'}
      </button>

      {simError && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12 }}>{simError}</div>}

      {simResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill label="Current" value={`${simResult.current_weight_kg} kg`} />
            <StatPill
              label={`Week ${simResult.weeks}`}
              value={`${simResult.trajectory[simResult.trajectory.length - 1].kg} kg`}
              accent="good"
            />
            {simResult.weeks_to_goal != null && (
              <StatPill label="Weeks to goal" value={`${simResult.weeks_to_goal} wk`} />
            )}
          </div>

          {simResult.suggested_daily_kcal != null && (
            <div style={{
              fontSize: 12, color: 'var(--fg-quiet)',
              padding: '8px 12px', borderRadius: 10,
              background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
            }}>
              Required deficit: <strong style={{ color: 'var(--fg-secondary)' }}>{simResult.required_daily_deficit_kcal} kcal/day</strong>
              {' '}→ suggested daily calories: <strong style={{ color: 'var(--fg-secondary)' }}>{simResult.suggested_daily_kcal} kcal</strong>
            </div>
          )}

          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simResult.trajectory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="week"
                  tickFormatter={(v) => v === 0 ? 'Now' : `W${v}`}
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false} tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--glass-edge)', borderRadius: 10, fontSize: 12, color: 'var(--fg-primary)' }}
                  formatter={(v: number) => [`${v} kg`, 'Weight']}
                  labelFormatter={(l: number) => l === 0 ? 'Now' : `Week ${l}`}
                />
                {simResult.goal_weight_kg != null && (
                  <ReferenceLine
                    y={simResult.goal_weight_kg}
                    stroke="var(--good)"
                    strokeDasharray="4 4"
                    label={{ value: `Goal ${simResult.goal_weight_kg} kg`, position: 'right', fontSize: 10, fill: 'var(--good)' }}
                  />
                )}
                <Line type="monotone" dataKey="kg" stroke="var(--good)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--good)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p style={{ fontSize: 11, color: 'var(--fg-quiet)', margin: 0, lineHeight: 1.4 }}>{simResult.note}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Protein adequacy simulator (ISSN zones)
// ---------------------------------------------------------------------------

const PROTEIN_ZONES = [
  { from: 0,   to: 1.2, color: 'rgba(251,113,133,0.5)',  label: 'Low'         },
  { from: 1.2, to: 1.6, color: 'rgba(251,191,36,0.5)',   label: 'Maintenance' },
  { from: 1.6, to: 2.2, color: 'rgba(52,211,153,0.55)',  label: 'Optimal'     },
  { from: 2.2, to: 3.0, color: 'rgba(56,189,248,0.45)',  label: 'Above'       },
]
const PROTEIN_BAR_MAX = 3.0

function ProteinZoneBar({ gPerKg }: { gPerKg: number | null }) {
  const pct = (v: number) => `${(v / PROTEIN_BAR_MAX) * 100}%`
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ position: 'relative', height: 10, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
        {PROTEIN_ZONES.map((z) => (
          <div key={z.from} style={{ position: 'absolute', left: pct(z.from), width: pct(z.to - z.from), top: 0, bottom: 0, background: z.color }} />
        ))}
        {gPerKg != null && (
          <div style={{
            position: 'absolute',
            left: pct(Math.min(gPerKg, PROTEIN_BAR_MAX)),
            top: -2, bottom: -2, width: 3,
            background: 'white', borderRadius: 2,
            transform: 'translateX(-50%)',
            boxShadow: '0 0 5px rgba(255,255,255,0.7)',
          }} />
        )}
      </div>
      <div style={{ position: 'relative', height: 16, marginTop: 3 }}>
        {[0, 1.2, 1.6, 2.2, 3.0].map((v) => (
          <span key={v} style={{ position: 'absolute', left: pct(v), transform: 'translateX(-50%)', fontSize: 9, color: 'var(--fg-quiet)' }}>
            {v}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {PROTEIN_ZONES.map((z) => (
          <div key={z.from} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: z.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>{z.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProteinSimulator() {
  const { data, isLoading } = useQuery<ProteinSimResult>({
    queryKey: ['health', 'protein-sim'],
    queryFn: () => api.get('/health/protein-simulate'),
  })

  const zoneAccent: Record<string, 'good' | 'bad' | undefined> = {
    optimal: 'good', low: 'bad',
  }

  return (
    <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Dumbbell size={16} strokeWidth={1.5} style={{ color: 'var(--aurora-violet)' }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>Protein Adequacy</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: '4px 0 20px', lineHeight: 1.4 }}>
        7-day average protein intake plotted against muscle-synthesis zones, adjusted for body weight.
      </p>

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--fg-quiet)', padding: '12px 0' }}>Loading…</div>
      ) : data?.avg_protein_g == null ? (
        <EmptyState icon={Dumbbell} message="Log meals for at least one day to see your protein adequacy." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill label="7-day avg" value={`${data.avg_protein_g} g/day`} />
            {data.g_per_kg != null && (
              <StatPill label="Per kg bodyweight" value={`${data.g_per_kg} g/kg`} accent={zoneAccent[data.zone]} />
            )}
            {data.target_protein_g != null && (
              <StatPill label="Your target" value={`${data.target_protein_g} g/day`} />
            )}
          </div>

          <ProteinZoneBar gPerKg={data.g_per_kg} />

          <p style={{ fontSize: 11, color: 'var(--fg-quiet)', margin: 0, lineHeight: 1.4 }}>{data.note}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Simulations tab — wraps all three simulators
// ---------------------------------------------------------------------------

export function SimulationsTab() {
  return (
    <div className="health-simulators-grid">
      <LdlSimulator />
      <WeightLossSimulator />
      <div className="health-simulators-protein-wrapper">
        <ProteinSimulator />
      </div>
    </div>
  )
}
