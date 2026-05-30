import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { Heart, Activity, Moon, Flame, TrendingUp, TrendingDown, X } from 'lucide-react'
import { api, TrendSeries } from '../lib/api'
import { convertWeight, measurementWeightUnit, type MeasurementSystem, useMeasurementSystem } from '../lib/measurements'
import Spark from '../components/ui/Spark'

const RANGES = ['7d', '30d', '90d', '1y'] as const
type Range = typeof RANGES[number]

const METRICS = [
  { id: 'weight_kg',          label: 'Weight',          unit: 'kg',  color: 'var(--sky-400)', Icon: Activity,
    insight: 'Keep tracking daily — the trend line is what matters, not single readings.' },
  { id: 'hrv_ms',             label: 'HRV',             unit: 'ms',  color: 'var(--bad)', Icon: Heart,
    insight: 'HRV responds to sleep and recovery. Trending up means adaptation.' },
  { id: 'rhr_bpm',            label: 'Resting HR',      unit: 'bpm', color: 'var(--sky-400)', Icon: Activity, invert: true,
    insight: 'Lower resting HR over time signals improving aerobic fitness.' },
  { id: 'sleep_duration_min', label: 'Sleep',           unit: 'h',   color: 'var(--aurora-violet)', Icon: Moon,
    insight: 'More 7+ hour nights than not. Hold steady.' },
  { id: 'active_kcal',        label: 'Active Calories', unit: 'kcal', color: 'var(--sun-400)', Icon: Flame,
    insight: 'Consistency over intensity builds lasting metabolic health.' },
]

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

export default function TrendsRoute() {
  const [range, setRange] = useState<Range>('90d')
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

      <div className="trends-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 20 }}>
        {METRICS.slice(1).map((m) => (
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
          />
        ))}
      </div>

      {drillDate && (
        <DrillDownSheet date={drillDate} onClose={() => setDrillDate(null)}/>
      )}
    </div>
  )
}

function MetricChart({
  metricId, label, unit, color, range, large, insight, invert, measurementSystem, alerts, onDrillDown,
}: {
  metricId: string; label: string; unit: string; color: string
  range: Range; large?: boolean; insight?: string; invert?: boolean; measurementSystem: MeasurementSystem
  alerts: Insight[]; onDrillDown: (date: string) => void
}) {
  const { data, isLoading } = useQuery<TrendSeries>({
    queryKey: ['trend', metricId, range],
    queryFn: () => api.get(`/trends/${metricId}?range=${range}`),
  })

  const series = (data?.series ?? []).map((entry) => {
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
                    {metricId === 'sleep_duration_min' ? (lastVal / 60).toFixed(1) : lastVal.toFixed(1)}
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
                      {good ? <TrendingDown size={12}/> : <TrendingUp size={12}/>}
                      <span className="num">
                        {delta > 0 ? '+' : ''}{metricId === 'sleep_duration_min' ? (delta / 60).toFixed(1) : delta.toFixed(1)}
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
                <Activity size={14}/>
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
            {good ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
          </span>
        )}
      </div>

      {!large && lastVal != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
          <span className="num" style={{ fontSize: 32, fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            {metricId === 'sleep_duration_min' ? (lastVal / 60).toFixed(1) : lastVal.toFixed(1)}
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
              margin={{ top: 4, right: 4, bottom: 4, left: -20 }}
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
                tickFormatter={(v: string) => v.slice(5)}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}
                domain={['auto', 'auto']}
                axisLine={false} tickLine={false}
              />
              <Tooltip
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
            <h3 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 400, color: 'var(--fg-primary)' }}>{date}</h3>
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
