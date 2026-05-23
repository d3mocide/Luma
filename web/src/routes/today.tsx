import { useQuery } from '@tanstack/react-query'
import { api, TodayData } from '../lib/api'
import { fmtWeight, fmtSlope, fmtMinutes, fmt } from '../lib/format'

export default function TodayRoute() {
  const { data, isLoading, error } = useQuery<TodayData>({
    queryKey: ['today'],
    queryFn: () => api.get('/today'),
  })

  if (isLoading) return <PageShell><LoadingSkeleton /></PageShell>
  if (error || !data) return <PageShell><ErrorCard message={error?.message} /></PageShell>

  return (
    <PageShell>
      {/* Weight hero */}
      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Weight</p>
            <p className="text-4xl font-semibold tabular-nums mt-1">{fmtWeight(data.weight.latest_kg)}</p>
          </div>
          <div className="text-right text-sm">
            <Slope label="7d" value={data.weight.trend_7d} />
            <Slope label="28d" value={data.weight.trend_28d} />
          </div>
        </div>
        {data.weight.target_kg && (
          <p className="text-xs text-slate-500 mt-2">Target: {fmtWeight(data.weight.target_kg)}</p>
        )}
      </Card>

      {/* Adherence ring */}
      <Card title="Yesterday's Adherence">
        <div className="grid grid-cols-3 gap-3 mt-2">
          <AdherencePill label="Calories" pct={data.adherence_yesterday.calories.pct} />
          <AdherencePill label="Sat Fat" pct={data.adherence_yesterday.sat_fat_g.pct} invert />
          <AdherencePill label="Fiber" pct={data.adherence_yesterday.soluble_fiber_g.pct} />
        </div>
      </Card>

      {/* Today's plan */}
      <Card title="Today's Plan">
        {data.plan_today.length === 0 ? (
          <p className="text-sm text-slate-500 mt-1">No plan yet — generate one in the Plan tab.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.plan_today.map((m) => (
              <li key={m.slot} className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 capitalize">{m.slot}</span>
                  <p className="text-sm">{m.name}</p>
                </div>
                {m.logged && <span className="text-xs text-emerald-400">Logged</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Active insight */}
      {data.active_insight && (
        <Card className="border-l-2 border-amber-400">
          <p className="text-xs text-amber-400 uppercase tracking-wide">{data.active_insight.severity}</p>
          <p className="text-sm mt-1">{data.active_insight.headline}</p>
          <button className="text-xs text-brand-500 mt-2">{data.active_insight.cta} →</button>
        </Card>
      )}

      {/* Biometrics strip */}
      <Card title="Biometrics">
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Metric label="HRV" value={fmt(data.biometrics_latest.hrv_ms, 0, ' ms')} />
          <Metric label="RHR" value={fmt(data.biometrics_latest.rhr_bpm, 0, ' bpm')} />
          <Metric label="Sleep" value={fmtMinutes(data.biometrics_latest.sleep_duration_min)} />
          <Metric label="Score" value={fmt(data.biometrics_latest.sleep_score, 0)} />
        </div>
      </Card>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <h1 className="text-lg font-semibold text-slate-300">
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </h1>
      {children}
    </div>
  )
}

function Card({ children, title, className }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <div className={`bg-slate-900 rounded-2xl p-4 border border-slate-800 ${className ?? ''}`}>
      {title && <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{title}</p>}
      {children}
    </div>
  )
}

function Slope({ label, value }: { label: string; value: number | null }) {
  const color = value == null ? 'text-slate-500' : value < 0 ? 'text-emerald-400' : value > 0 ? 'text-rose-400' : 'text-slate-400'
  return (
    <p className={`text-xs ${color}`}>
      <span className="text-slate-500 mr-1">{label}</span>
      {fmtSlope(value)}
    </p>
  )
}

function AdherencePill({ label, pct, invert }: { label: string; pct: number | null; invert?: boolean }) {
  const good = pct == null ? null : invert ? pct <= 100 : pct >= 90
  const color = pct == null ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-amber-400'
  return (
    <div className="flex flex-col items-center bg-slate-800 rounded-xl p-3">
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{pct != null ? `${pct}%` : '—'}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-base font-medium tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return <div className="animate-pulse space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-800 rounded-2xl" />)}</div>
}

function ErrorCard({ message }: { message?: string }) {
  return <div className="bg-rose-900/30 rounded-2xl p-4 text-rose-300 text-sm">{message ?? 'Failed to load today data'}</div>
}
