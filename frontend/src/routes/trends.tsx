import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { Heart, Activity, Moon, Flame, TrendingUp, TrendingDown, X, Timer, Wind, Sun, type LucideIcon } from 'lucide-react'
import { api, TrendSeries } from '../lib/api'
import { convertWeight, measurementWeightUnit, type MeasurementSystem, useMeasurementSystem } from '../lib/measurements'
import Spark from '../components/ui/Spark'

const RANGES = ['7d', '30d', '90d', '1y'] as const
type Range = typeof RANGES[number]

const TABS = [
  { id: 'vitals',    label: 'Vitals & Composition', Icon: Heart },
  { id: 'recovery',  label: 'Recovery & Sleep', Icon: Moon },
  { id: 'activity',  label: 'Activity & Energy', Icon: Flame },
  { id: 'gait',      label: 'Gait & Posture',   Icon: TrendingUp },
  { id: 'wellbeing', label: 'Wellbeing', Icon: Sun },
] as const

type TabId = typeof TABS[number]['id']

const METRICS = [
  // Recovery & Sleep
  { id: 'hrv_ms', label: 'HRV', unit: 'ms', color: 'var(--bad)', Icon: Heart, tab: 'recovery',
    insight: 'HRV responds to sleep and recovery. Trending up means adaptation.' },
  { id: 'rhr_bpm', label: 'Resting HR', unit: 'bpm', color: 'var(--sky-400)', Icon: Activity, invert: true, tab: 'recovery',
    insight: 'Lower resting HR over time signals improving aerobic fitness.' },
  { id: 'sleep_duration_min', label: 'Sleep Duration', unit: 'h', color: 'var(--aurora-violet)', Icon: Moon, tab: 'recovery',
    insight: 'More 7+ hour nights than not. Hold steady.' },
  { id: 'sleep_score', label: 'Sleep Score', unit: '/100', color: 'var(--sun-400)', Icon: Moon, tab: 'recovery',
    insight: 'Consistent, restorative sleep is your metabolic superpower.' },
  { id: 'respiratory_rate_bpm', label: 'Respiratory Rate', unit: 'bpm', color: 'var(--sky-300)', Icon: Wind, tab: 'recovery',
    insight: 'Sleeping respiratory rate is highly stable. Small shifts signal autonomic load.' },
  { id: 'wrist_temp_c', label: 'Wrist Temp Deviation', unit: '°C', color: 'var(--good)', Icon: Activity, tab: 'recovery',
    insight: 'Tracks nocturnal skin temperature deviation from your baseline.' },
  { id: 'breathing_disturbances', label: 'Breathing Disturbances', unit: '/hr', color: 'var(--bad)', Icon: Wind, invert: true, tab: 'recovery',
    insight: 'Fewer breathing disturbances correlate with higher deep sleep ratios.' },

  // Activity & Energy
  { id: 'active_kcal', label: 'Active Calories', unit: 'kcal', color: 'var(--sun-400)', Icon: Flame, tab: 'activity',
    insight: 'Consistency over intensity builds lasting metabolic health.' },
  { id: 'steps', label: 'Steps', unit: 'steps', color: 'var(--sky-400)', Icon: Activity, tab: 'activity',
    insight: 'Daily steps build vascular health and insulin sensitivity.' },
  { id: 'exercise_min', label: 'Exercise', unit: 'min', color: 'var(--good)', Icon: Timer, tab: 'activity',
    insight: 'Regular active minutes support glucose control and cardiovascular adaptation.' },
  { id: 'distance_km', label: 'Distance', unit: 'km', color: 'var(--sky-300)', Icon: Activity, tab: 'activity',
    insight: 'Aerobic volume aids systemic recovery and lipid clearance.' },
  { id: 'stand_hours', label: 'Stand Hours', unit: 'h', color: 'var(--aurora-violet)', Icon: Activity, tab: 'activity',
    insight: 'Frequent posture breaks support healthy endothelial function.' },
  { id: 'daylight_min', label: 'Daylight Exposure', unit: 'min', color: 'var(--sun-400)', Icon: Sun, tab: 'activity',
    insight: 'Morning daylight exposure regulates circadian rhythms and sleep quality.' },

  // Gait & Posture
  { id: 'walking_speed_kmh', label: 'Walking Speed', unit: 'km/h', color: 'var(--good)', Icon: Activity, tab: 'gait',
    insight: 'Walking speed is an integrated marker of neuromuscular health.' },
  { id: 'walking_asymmetry_pct', label: 'Walking Asymmetry', unit: '%', color: 'var(--bad)', Icon: TrendingDown, invert: true, tab: 'gait',
    insight: 'Lower asymmetry represents balanced symmetry and healthy gait patterns.' },
  { id: 'step_length_cm', label: 'Step Length', unit: 'cm', color: 'var(--sky-400)', Icon: Activity, tab: 'gait',
    insight: 'Longer stride length indicates healthy pelvic mobility and lower-body power.' },
  { id: 'double_support_pct', label: 'Double Support Time', unit: '%', color: 'var(--sky-300)', Icon: Activity, invert: true, tab: 'gait',
    insight: 'Time spent with both feet on the ground. Lower % means greater dynamic balance.' },
  { id: 'stair_speed_up_mps', label: 'Stair Speed Up', unit: 'm/s', color: 'var(--good)', Icon: TrendingUp, tab: 'gait',
    insight: 'Ascending speed reflects explosive lower-body power and joint function.' },
  { id: 'stair_speed_down_mps', label: 'Stair Speed Down', unit: 'm/s', color: 'var(--good)', Icon: TrendingDown, tab: 'gait',
    insight: 'Descending speed evaluates eccentric control, knee health, and stability.' },

  // Vitals & Composition
  { id: 'bmi', label: 'BMI', unit: 'index', color: 'var(--sky-300)', Icon: Activity, tab: 'vitals',
    insight: 'Calculated body mass index based on weight and height.' },
  { id: 'body_fat_pct', label: 'Body Fat', unit: '%', color: 'var(--aurora-violet)', Icon: Activity, tab: 'vitals',
    insight: 'Body fat ratio. Gradual decrease signals high-quality body recomposition.' },
  { id: 'heart_rate_avg_bpm', label: 'Avg Heart Rate', unit: 'bpm', color: 'var(--bad)', Icon: Heart, tab: 'vitals',
    insight: 'A general vitals indicator of cardiac performance and circulatory load.' },
  { id: 'walking_hr_bpm', label: 'Walking Heart Rate', unit: 'bpm', color: 'var(--bad)', Icon: Heart, invert: true, tab: 'vitals',
    insight: 'Cardiovascular response to light effort. Lower means higher efficiency.' },
]

// Cumulative metrics arrive as many interval samples; the daily figure that
// matters is the total, so chart their daily sum rather than a per-sample avg.
const CUMULATIVE_METRICS = new Set([
  'active_kcal', 'steps', 'exercise_min', 'distance_km',
  'stand_hours', 'stand_min', 'flights_climbed', 'daylight_min',
])

interface Insight {
  id: string
  ts: string
  rule_id: string
  severity: string
  headline: string
  body: string
  status: string
}

interface MealSummary {
  id: string
  ts: string
  slot: string
  calories: number
  headline: string
}

// ── Wellbeing tab ────────────────────────────────────────────────────────────

interface JournalEntry {
  logged_at: string
  energy: number
  digestion: number
  mood: number
  satiety: number
}

const WELL_METRICS = [
  { key: 'energy' as const,    label: 'Energy',    color: 'var(--sky-400)', insight: 'How energised you feel after meals. Low scores may point to blood sugar spikes or heavy sat-fat loads.' },
  { key: 'digestion' as const, label: 'Digestion', color: 'var(--good)',    insight: 'Consistent low digestion scores alongside specific meals can reveal intolerances.' },
  { key: 'mood' as const,      label: 'Mood',      color: '#a78bfa',        insight: 'Mood after eating tracks gut-brain signalling. Omega-3-rich meals tend to score well here.' },
  { key: 'satiety' as const,   label: 'Satiety',   color: 'var(--sun-400)', insight: 'High-fibre, high-protein meals sustain satiety. Low scores often precede overeating.' },
]

function WellbeingTab() {
  const { data, isLoading } = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ['journal'],
    queryFn: () => api.get('/journal?limit=200'),
    staleTime: 60_000,
  })

  const entries = data?.entries ?? []

  // Bucket entries by date, average scores per day
  const byDate = entries.reduce<Record<string, { energy: number[]; digestion: number[]; mood: number[]; satiety: number[] }>>((acc, e) => {
    const d = e.logged_at.slice(0, 10)
    if (!acc[d]) acc[d] = { energy: [], digestion: [], mood: [], satiety: [] }
    acc[d].energy.push(e.energy)
    acc[d].digestion.push(e.digestion)
    acc[d].mood.push(e.mood)
    acc[d].satiety.push(e.satiety)
    return acc
  }, {})

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      energy: +(scores.energy.reduce((a, b) => a + b, 0) / scores.energy.length).toFixed(1),
      digestion: +(scores.digestion.reduce((a, b) => a + b, 0) / scores.digestion.length).toFixed(1),
      mood: +(scores.mood.reduce((a, b) => a + b, 0) / scores.mood.length).toFixed(1),
      satiety: +(scores.satiety.reduce((a, b) => a + b, 0) / scores.satiety.length).toFixed(1),
    }))

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="glass" style={{ padding: '48px 24px', textAlign: 'center', borderRadius: 16, border: '1px solid var(--glass-edge)', margin: '0 auto', maxWidth: 420 }}>
        <Sun size={32} style={{ color: 'var(--fg-quiet)', marginBottom: 12 }} />
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-secondary)', fontWeight: 500 }}>No journal data yet.</p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-tertiary)' }}>
          Log how meals make you feel in the Meals → Journal tab and your trends will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="trends-metric-grid" style={{ marginTop: 0 }}>
      {WELL_METRICS.map(({ key, label, color, insight }) => (
        <div key={key} className="glass" style={{ padding: 20, borderRadius: 16, border: '1px solid var(--glass-edge)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <div className="eyebrow">{label}</div>
            <span className="num" style={{ fontSize: 11, color, fontWeight: 600 }}>
              avg {(chartData.reduce((a, d) => a + d[key], 0) / chartData.length).toFixed(1)} / 5
            </span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--fg-quiet)', lineHeight: 1.5 }}>{insight}</p>
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -32, bottom: 0 }}>
              <defs>
                <linearGradient id={`wg-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--fg-quiet)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 9, fill: 'var(--fg-quiet)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--glass-edge)', borderRadius: 8, fontSize: 12 }}
                formatter={(val: number) => [`${val} / 5`, label]}
                labelStyle={{ color: 'var(--fg-tertiary)', fontSize: 11 }}
              />
              <ReferenceLine y={3} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey={key} stroke={color} strokeWidth={2} fill={`url(#wg-${key})`} dot={chartData.length <= 14 ? { r: 3, fill: color, strokeWidth: 0 } : false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  )
}

export default function TrendsRoute() {
  const [range, setRange] = useState<Range>('90d')
  const [activeTab, setActiveTab] = useState<TabId>('vitals')
  const [drillDate, setDrillDate] = useState<string | null>(null)
  const measurementSystem = useMeasurementSystem()

  const { data: insightsData } = useQuery<{ insights: Insight[] }>({
    queryKey: ['insights'],
    queryFn: () => api.get('/insights?limit=50'),
  })
  const alerts = insightsData?.insights ?? []

  return (
    <div className="thin-scroll trends-page">
      <header className="mobile-hero mobile-hero-with-controls trends-header" style={{ marginBottom: 24 }}>
        <div className="mobile-hero-content">
          <div className="eyebrow">Trends</div>
          <h1 className="mobile-hero-title" style={{ margin: '6px 0 6px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Ninety days of{' '}
            <span className="serif-italic" style={{
              background: 'var(--accent-gradient-hero)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>quiet progress</span>.
          </h1>
          <p className="mobile-hero-subcopy" style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
            You're trending the right way. The body keeps score; you keep showing up.
          </p>
        </div>

        <div className="mobile-hero-control trends-range-toggle" style={{
          display: 'flex', padding: 4,
          background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 999,
        }}>
          {RANGES.map((r) => {
            const active = r === range
            return (
              <button key={r} onClick={() => setRange(r)} style={{
                padding: '8px 16px', borderRadius: 999,
                background: active ? 'linear-gradient(180deg, var(--sky-300), var(--sky-500))' : 'transparent',
                border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 600 : 500,
                color: active ? 'var(--bg-1)' : 'var(--fg-tertiary)',
                fontFamily: 'var(--font-mono)',
                boxShadow: active ? '0 4px 14px -4px rgba(14,165,233,0.6)' : 'none',
                transition: 'all 150ms ease-out',
              }}>{r}</button>
            )
          })}
        </div>
      </header>

      {/* Primary Goal Persistent Hero Card */}
      <MetricChart
        metricId="weight_kg"
        label="Weight"
        unit={measurementWeightUnit(measurementSystem)}
        color="var(--sky-400)"
        range={range}
        measurementSystem={measurementSystem}
        alerts={alerts}
        large
        insight="Track the trend line, not the noise. Daily fluctuations are normal."
        onDrillDown={setDrillDate}
      />

      {/* Premium Tab Selector */}
      <div className="trends-tabs-container" style={{
        display: 'flex',
        gap: 8,
        padding: 4,
        background: 'var(--glass-1)',
        border: '1px solid var(--glass-edge)',
        borderRadius: 16,
        marginTop: 24,
        marginBottom: 20,
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}>
        {TABS.map((t) => {
          const active = t.id === activeTab
          const TabIcon = t.Icon
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 12,
                background: active ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                border: active ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
                transition: 'all 150ms ease-out',
                flexShrink: 0,
              }}
            >
              <TabIcon size={14} style={{ color: active ? 'var(--sky-400)' : 'var(--fg-quiet)' }} />
              {t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'wellbeing' ? (
        <WellbeingTab />
      ) : (
        <div className="trends-metric-grid">
          {METRICS.filter(m => m.tab === activeTab).map((m) => (
            <MetricChart
              key={m.id}
              metricId={m.id}
              label={m.label}
              unit={m.unit}
              color={m.color}
              range={range}
              measurementSystem={measurementSystem}
              alerts={alerts}
              insight={m.insight}
              invert={m.invert}
              onDrillDown={setDrillDate}
              Icon={m.Icon}
            />
          ))}
        </div>
      )}

      {drillDate && (
        <DrillDownSheet date={drillDate} onClose={() => setDrillDate(null)}/>
      )}
    </div>
  )
}

function MetricChart({
  metricId, label, unit, color, range, large, insight, invert, measurementSystem, alerts, onDrillDown, Icon = Activity,
}: {
  metricId: string; label: string; unit: string; color: string
  range: Range; large?: boolean; insight?: string; invert?: boolean; measurementSystem: MeasurementSystem
  alerts: Insight[]; onDrillDown: (date: string) => void
  Icon?: LucideIcon
}) {
  const { data, isLoading } = useQuery<TrendSeries>({
    queryKey: ['trend', metricId, range],
    queryFn: () => api.get(`/trends/${metricId}?range=${range}`),
  })

  const isCumulative = CUMULATIVE_METRICS.has(metricId)
  const series = (data?.series ?? []).map((entry) => {
    if (isCumulative) {
      // The daily total is the meaningful value; mirror it onto the fields the
      // chart/headline/delta read so they all show the day's sum.
      return { ...entry, avg: entry.sum, min: entry.sum, max: entry.sum, last: entry.sum }
    }
    if (metricId !== 'weight_kg') return entry
    return {
      ...entry,
      avg: convertWeight(entry.avg, measurementSystem),
      min: convertWeight(entry.min, measurementSystem),
      max: convertWeight(entry.max, measurementSystem),
      last: convertWeight(entry.last, measurementSystem),
    }
  })
  const displayUnit = metricId === 'weight_kg' ? measurementWeightUnit(measurementSystem) : unit
  const hasData = series.some((s) => s.last != null)

  const lastVal = hasData ? series[series.length - 1].last : null
  const firstVal = hasData ? series[0].last : null
  const delta = lastVal != null && firstVal != null ? lastVal - firstVal : null
  const good = delta != null ? (invert ? delta < 0 : delta > 0) : null

  // Format value dynamically based on biometric type
  const formatValue = (val: number) => {
    if (metricId === 'sleep_duration_min') return (val / 60).toFixed(1)
    if (metricId === 'walking_asymmetry_pct') return val.toFixed(2)
    if (unit === 'm/s') return val.toFixed(2)
    return val.toFixed(1)
  }

  // Alert pins: filter to date range
  const seriesDates = new Set(series.map((s) => s.date.slice(0, 10)))
  const alertPins = alerts.filter((a) => seriesDates.has(a.ts.slice(0, 10)))

  const severityColor = (sev: string) => {
    if (sev === 'positive') return 'var(--good)'
    if (sev === 'warning') return 'var(--bad)'
    return 'var(--fg-tertiary)'
  }

  return (
    <div className="glass" style={{ padding: large ? 28 : 22, position: 'relative', overflow: 'hidden' }}>
      {large && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 60% 80% at 80% 20%, rgba(56,189,248,0.12), transparent 60%)',
          pointerEvents: 'none',
        }}/>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: large ? 6 : 10 }}>
        <div>
          {large ? (
            <>
              <div className="eyebrow">{label}</div>
              {lastVal != null && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
                  <span className="num" style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--fg-primary)' }}>
                    {formatValue(lastVal)}
                  </span>
                  <span style={{ fontSize: 18, color: 'var(--fg-tertiary)' }}>{displayUnit}</span>
                  {delta != null && (
                    <span style={{
                      fontSize: 13, color: good ? 'var(--good)' : 'var(--bad)',
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 10px',
                      background: good ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
                      border: good ? '1px solid rgba(52,211,153,0.25)' : '1px solid rgba(251,113,133,0.25)',
                      borderRadius: 999, marginLeft: 8,
                    }}>
                      {delta > 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
                      <span className="num">
                        {delta > 0 ? '+' : ''}{formatValue(delta)}
                      </span>
                      {' '}in {range}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9,
                background: `${color}1f`, border: `1px solid ${color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color,
              }}>
                <Icon size={14}/>
              </div>
              <span style={{ fontSize: 14, color: 'var(--fg-secondary)' }}>{label}</span>
            </div>
          )}
        </div>

        {!large && delta != null && (
          <span className="num" style={{
            fontSize: 11, color: good ? 'var(--good)' : 'var(--bad)',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 8px',
            background: good ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)',
            borderRadius: 999,
          }}>
            {delta > 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
            {delta > 0 ? '+' : ''}{formatValue(delta)}
          </span>
        )}
      </div>

      {!large && lastVal != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <span className="num" style={{ fontSize: 32, fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            {formatValue(lastVal)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{displayUnit}</span>
        </div>
      )}

      <div style={{ marginTop: large ? 14 : 0 }}>
        {isLoading ? (
          <div style={{ height: large ? 280 : 56, borderRadius: 12, background: 'var(--glass-1)', animation: 'pulse 1.5s ease-in-out infinite' }}/>
        ) : !hasData ? (
          <div style={{ height: large ? 280 : 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-faint)', fontSize: 13 }}>No data yet</div>
        ) : large ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={series}
              margin={{ top: 4, right: 4, bottom: 4, left: -10 }}
              onClick={(e) => {
                if (e?.activePayload?.[0]?.payload?.date) {
                  onDrillDown(e.activePayload[0].payload.date.slice(0, 10))
                }
              }}
            >
              <defs>
                <linearGradient id={`fill-${metricId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.45"/>
                  <stop offset="60%" stopColor={color} stopOpacity="0.10"/>
                  <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)"/>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}
                tickFormatter={(v: string) => {
                  if (!v) return ''
                  const datePart = v.split(' ')[0]
                  const parts = datePart.split('-')
                  if (parts.length < 3) return v
                  return `${parts[1]}/${parts[2]}`
                }}
                minTickGap={28}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}
                domain={['auto', 'auto']}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                labelFormatter={(label: string) => {
                  if (!label) return ''
                  const datePart = label.split(' ')[0]
                  const parts = datePart.split('-')
                  if (parts.length < 3) return label
                  const [year, month, day] = parts
                  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                  const mIdx = parseInt(month, 10) - 1
                  const mName = months[mIdx] || month
                  return `${mName} ${parseInt(day, 10)}, ${year}`
                }}
                contentStyle={{
                  background: 'rgba(8,13,26,0.95)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12, backdropFilter: 'blur(12px)',
                }}
                labelStyle={{ color: 'rgba(246,249,255,0.56)', fontSize: 11 }}
                itemStyle={{ color, fontSize: 13 }}
              />
              {alertPins.map((pin) => (
                <ReferenceLine
                  key={pin.id}
                  x={pin.ts.slice(0, 10)}
                  stroke={severityColor(pin.severity)}
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: '●',
                    fill: severityColor(pin.severity),
                    fontSize: 10,
                    position: 'insideTop',
                  }}
                />
              ))}
              <Area
                type="monotone" dataKey="last"
                stroke={color} strokeWidth={2.5}
                fill={`url(#fill-${metricId})`}
                dot={false} activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
                style={{ cursor: 'pointer' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Spark data={series.filter(s => s.last != null) as { last: number }[]} w={420} h={56} color={color}/>
        )}
      </div>

      {insight && (
        <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
          {insight}
        </p>
      )}
    </div>
  )
}

function DrillDownSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ meals: MealSummary[] }>({
    queryKey: ['meals-by-date', date],
    queryFn: async () => {
      const all = await api.get<{ meals: Array<{ id: string; ts: string; slot: string; nutrition: Record<string, number>; items: Array<{ name: string }> }> }>('/log/meals?limit=100')
      const meals = (all.meals ?? [])
        .filter((m) => m.ts.slice(0, 10) === date)
        .map((m) => ({
          id: m.id,
          ts: m.ts,
          slot: m.slot,
          calories: m.nutrition?.calories ?? 0,
          headline: m.items?.[0]?.name ?? 'Logged meal',
        }))
      return { meals }
    },
  })

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        className="glass"
        style={{ width: '100%', maxWidth: 600, margin: '0 auto', borderRadius: '20px 20px 0 0', padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div className="eyebrow">Meals logged</div>
            <h3 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)' }}>
              {(() => {
                const parts = date.split('-')
                if (parts.length < 3) return date
                const [year, month, day] = parts
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                const mIdx = parseInt(month, 10) - 1
                const mName = months[mIdx] || month
                return `${mName} ${parseInt(day, 10)}, ${year}`
              })()}
            </h3>
          </div>
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={onClose}><X size={16}/></button>
        </div>

        {isLoading ? (
          <div style={{ height: 80, borderRadius: 12, background: 'var(--glass-1)', animation: 'pulse 1.5s infinite' }}/>
        ) : !data?.meals.length ? (
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14 }}>No meals logged on this day.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.meals.map((m) => (
              <div key={m.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderRadius: 12, background: 'var(--glass-1)',
              }}>
                <div>
                  <div style={{ fontSize: 14, color: 'var(--fg-primary)' }}>{m.headline}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>
                    {m.slot} · {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span className="num" style={{ fontSize: 14, color: 'var(--fg-secondary)' }}>
                  {Math.round(m.calories)} kcal
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
