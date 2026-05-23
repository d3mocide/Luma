import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api, TrendSeries } from '../lib/api'

const METRICS = [
  { id: 'weight_kg',          label: 'Weight (kg)' },
  { id: 'hrv_ms',             label: 'HRV (ms)' },
  { id: 'rhr_bpm',            label: 'Resting HR (bpm)' },
  { id: 'sleep_duration_min', label: 'Sleep (min)' },
  { id: 'active_kcal',        label: 'Active Calories' },
]

const RANGES = ['7d', '30d', '90d', '1y'] as const
type Range = typeof RANGES[number]

export default function TrendsRoute() {
  const [range, setRange] = useState<Range>('30d')

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-300">Trends</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                range === r ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {METRICS.map((m) => (
        <MetricChart key={m.id} metricId={m.id} label={m.label} range={range} />
      ))}
    </div>
  )
}

function MetricChart({ metricId, label, range }: { metricId: string; label: string; range: Range }) {
  const { data, isLoading } = useQuery<TrendSeries>({
    queryKey: ['trend', metricId, range],
    queryFn: () => api.get(`/trends/${metricId}?range=${range}`),
  })

  const series = data?.series ?? []
  const hasData = series.some((s) => s.last != null)

  return (
    <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
      <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-3">{label}</p>
      {isLoading ? (
        <div className="h-32 animate-pulse bg-slate-800 rounded-xl" />
      ) : !hasData ? (
        <div className="h-32 flex items-center justify-center text-slate-600 text-sm">No data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={128}>
          <LineChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#64748b' }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ color: '#38bdf8', fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="last"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
