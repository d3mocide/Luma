import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { api, type Dri, type NutritionHistory, type NutritionHistoryDay, type User } from '../lib/api'
import { fmt } from '../lib/format'
import ActivityRings from '../components/ui/ActivityRings'
import { MacroBar } from '../components/today/MacroBar'
import { RecentMealsCard, type RecentMeal } from '../components/today/RecentMealsCard'
import { NutrientBreakdownList } from '../components/today/NutrientBreakdownList'
import { RingLegend } from '../components/today/RingLegend'
import { computeCoverage, computeFlags, buildCoachSeed } from '../lib/nutrient-coverage'
import Spark from '../components/ui/Spark'

type Nutrition = Record<string, number>
type Targets = NutritionHistory['targets']
type Direction = 'min' | 'max' | 'band'

const RING_COLORS = [
  { from: '#fde68a', to: '#fbbf24', glow: 'rgba(251,191,36,0.5)' }, // Sat fat (yellow)
  { from: '#86efac', to: '#34d399', glow: 'rgba(52,211,153,0.5)' }, // Sol. fiber (green)
  { from: '#c084fc', to: '#a78bfa', glow: 'rgba(167,139,250,0.5)' }, // Protein (purple)
]

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] // Mon → Sun

interface MetricDef {
  key: keyof Targets
  label: string
  unit: string
  digits: number
  dir: Direction
}

const METRICS: MetricDef[] = [
  { key: 'calories',        label: 'Calories',   unit: 'kcal', digits: 0, dir: 'band' },
  { key: 'sodium_mg',       label: 'Sodium',     unit: 'mg',   digits: 0, dir: 'max' },
  { key: 'saturated_fat_g', label: 'Sat fat',    unit: 'g',    digits: 1, dir: 'max' },
  { key: 'soluble_fiber_g', label: 'Sol. fiber', unit: 'g',    digits: 1, dir: 'min' },
  { key: 'protein_g',       label: 'Protein',    unit: 'g',    digits: 0, dir: 'min' },
]

// ── date helpers (server-day strings, YYYY-MM-DD) ───────────────────────────────
const isoToDate = (iso: string) => new Date(`${iso}T12:00:00`) // noon avoids DST edges
const dateToIso = (d: Date) => d.toLocaleDateString('en-CA')
function isoAddDays(iso: string, n: number): string {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + n)
  return dateToIso(d)
}
const clampIso = (iso: string, lo: string, hi: string) => (iso < lo ? lo : iso > hi ? hi : iso)

function weekOf(iso: string): string[] {
  const dow = isoToDate(iso).getDay() // 0 Sun … 6 Sat
  const offsetToMon = (dow + 6) % 7
  const monday = isoAddDays(iso, -offsetToMon)
  return Array.from({ length: 7 }, (_, i) => isoAddDays(monday, i))
}

function ringValues(nutrition: Nutrition, t: Targets): number[] {
  return [
    t.saturated_fat_g ? (nutrition.saturated_fat_g ?? 0) / t.saturated_fat_g : 0,
    t.soluble_fiber_g ? Math.min((nutrition.soluble_fiber_g ?? 0) / t.soluble_fiber_g, 1) : 0,
    t.protein_g ? Math.min((nutrition.protein_g ?? 0) / t.protein_g, 1) : 0,
  ]
}

function metricVisual(pct: number | null, _dir: Direction, key?: string) {
  if (pct == null) {
    return { numColor: 'var(--fg-quiet)', barColor: 'rgba(255,255,255,0.18)', glow: 'none' }
  }
  
  const overLimit = key === 'sodium_mg' || key === 'saturated_fat_g' ? 100 : 110
  const isOver = pct > overLimit

  if (isOver) {
    return { numColor: 'var(--bad)', barColor: 'linear-gradient(90deg, var(--bad), #f87171)', glow: '0 0 8px rgba(239,68,68,0.45)' }
  }

  if (key === 'calories') {
    if (pct >= 90 && pct <= 110) {
      return { numColor: 'var(--good)', barColor: 'linear-gradient(90deg, var(--good), #34d399)', glow: '0 0 8px rgba(52,211,153,0.45)' }
    }
    return { numColor: '#38bdf8', barColor: 'linear-gradient(90deg, #7dd3fc, #38bdf8)', glow: '0 0 8px rgba(56,189,248,0.4)' }
  }

  if (key === 'protein_g') {
    return { numColor: '#a78bfa', barColor: 'linear-gradient(90deg, #c084fc, #a78bfa)', glow: '0 0 8px rgba(167,139,250,0.4)' }
  }

  if (key === 'sodium_mg') {
    return { numColor: '#fb923c', barColor: 'linear-gradient(90deg, #fdba74, #fb923c)', glow: '0 0 8px rgba(251,146,60,0.4)' }
  }

  if (key === 'saturated_fat_g') {
    return { numColor: '#fbbf24', barColor: 'linear-gradient(90deg, #fde68a, #fbbf24)', glow: '0 0 8px rgba(251,191,36,0.4)' }
  }

  if (key === 'soluble_fiber_g') {
    return { numColor: 'var(--good)', barColor: 'linear-gradient(90deg, var(--good), #34d399)', glow: '0 0 8px rgba(52,211,153,0.45)' }
  }

  const status: 'under' | 'good' | 'over' = pct >= 90 ? 'good' : 'under'
  if (status === 'good')
    return { numColor: 'var(--good)', barColor: 'linear-gradient(90deg, var(--good), #34d399)', glow: '0 0 8px rgba(52,211,153,0.45)' }
  return { numColor: 'var(--warn)', barColor: 'linear-gradient(90deg, #fdba74, #fb923c)', glow: '0 0 8px rgba(251,146,60,0.4)' }
}

function MetricCard({ def, logged, target, history }: { def: MetricDef; logged: number; target: number | null; history?: NutritionHistoryDay[] }) {
  const pct = target && target > 0 ? (logged / target) * 100 : null
  const v = metricVisual(pct, def.dir, def.key)
  const series = history?.map(d => d.nutrition[def.key] ?? 0) ?? []
  const showSpark = series.length > 0 && series.some(val => val > 0)

  return (
    <div className="glass-inset" style={{ padding: '12px 14px', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {def.label}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 3 }}>
          <span className="num" style={{ fontSize: 22, fontWeight: 300, color: v.numColor, letterSpacing: '-0.02em', lineHeight: 1, transition: 'color 400ms' }}>
            {fmt(logged, def.digits)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
            / {target != null ? fmt(target, def.digits) : '—'} {def.unit}
          </span>
        </div>
        <MacroBar pct={pct ?? 0} color={v.barColor} glow={v.glow} height={3} marginTop={8} />
      </div>
      {showSpark && (
        <div style={{ marginTop: 4, height: 28, opacity: 0.85 }}>
          <Spark data={series} color={v.numColor === 'var(--fg-quiet)' ? '#38bdf8' : v.numColor} h={28} />
        </div>
      )}
    </div>
  )
}

function MiniDay({
  iso, dayLabel, dateNum, values, selected, disabled, onSelect,
}: {
  iso: string
  dayLabel: string
  dateNum: number
  values: number[]
  selected: boolean
  disabled: boolean
  onSelect: (iso: string) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(iso)}
      aria-label={iso}
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        background: 'transparent', border: 'none', padding: '4px 0',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <span style={{ fontSize: 9, color: selected ? 'var(--fg-primary)' : 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>
        {dayLabel}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%', padding: 2,
        border: selected ? '1px solid var(--glass-edge-strong)' : '1px solid transparent',
        background: selected ? 'rgba(255,255,255,0.06)' : 'transparent',
      }}>
        <ActivityRings size={32} values={values} colors={RING_COLORS} thickness={3.5} gap={1.5} animate={false} />
      </span>
      <span className="num" style={{ fontSize: 10, color: selected ? 'var(--fg-secondary)' : 'var(--fg-quiet)' }}>
        {dateNum}
      </span>
    </button>
  )
}

export default function NutritionRoute() {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [tab, setTab] = useState<'summary' | 'nutrients'>('summary')
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const { data: me } = useQuery<User>({ queryKey: ['me'], queryFn: () => api.get('/auth/me') })
  const dri: Dri | null = me?.dri ?? null

  const { data: history, isLoading } = useQuery<NutritionHistory>({
    queryKey: ['nutrition-history', 90],
    queryFn: () => api.get('/today/nutrition-history?days=90'),
    staleTime: 5 * 60 * 1000,
  })

  const days = useMemo(() => history?.days ?? [], [history])
  const todayIso = days.length ? days[days.length - 1].date : dateToIso(new Date())
  const earliestIso = days.length ? days[0].date : todayIso
  const activeDate = selectedDate ?? todayIso

  const byDate = useMemo(() => {
    const map = new Map<string, NutritionHistoryDay>()
    for (const d of days) map.set(d.date, d)
    return map
  }, [days])

  const targets: Targets = history?.targets ?? {
    calories: null, saturated_fat_g: null, soluble_fiber_g: null, sodium_mg: null, protein_g: null,
  }
  const nutrition: Nutrition = byDate.get(activeDate)?.nutrition ?? {}

  const { data: dayDetail } = useQuery<{ date: string; meals: RecentMeal[] }>({
    queryKey: ['day-meals', activeDate],
    queryFn: () => api.get(`/today/day/${activeDate}`),
    enabled: !!history,
    staleTime: 60 * 1000,
  })

  const canPrev = activeDate > earliestIso
  const canNext = activeDate < todayIso
  const goPrev = () => { if (canPrev) setSelectedDate(isoAddDays(activeDate, -1)) }
  const goNext = () => { if (canNext) setSelectedDate(isoAddDays(activeDate, 1)) }
  const goPrevWeek = () => setSelectedDate(clampIso(isoAddDays(activeDate, -7), earliestIso, todayIso))
  const goNextWeek = () => setSelectedDate(clampIso(isoAddDays(activeDate, 7), earliestIso, todayIso))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, canPrev, canNext])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0)
    touchStartX.current = null
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) goPrev()   // drag right → older day
    else goNext()          // drag left → newer day
  }

  const d = isoToDate(activeDate)
  const isToday = activeDate === todayIso
  const titleMain = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long' })
  const dateFull = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const week = weekOf(activeDate)
  const rings = ringValues(nutrition, targets)

  const calPct = targets.calories && targets.calories > 0 ? ((nutrition.calories ?? 0) / targets.calories) * 100 : null
  const calVis = metricVisual(calPct, 'band', 'calories')
  const sodiumPct = targets.sodium_mg && targets.sodium_mg > 0 ? ((nutrition.sodium_mg ?? 0) / targets.sodium_mg) * 100 : null
  const sodiumVis = metricVisual(sodiumPct, 'max', 'sodium_mg')

  const coverage = computeCoverage(nutrition, dri)
  const flags = computeFlags(nutrition, dri, 3)
  const trendWindow = days.slice(-30)

  function handleCoach() {
    navigate('/coach', { state: { thread_seed: buildCoachSeed(dateFull, flags) } })
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 18px 100px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="btn"
          style={{ padding: 8, borderRadius: 10, lineHeight: 0 }}
        >
          <ChevronLeft size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--fg-primary)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            {titleMain}
          </div>
          <div className="num" style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>{dateFull}</div>
        </div>
      </div>

      {isLoading && !history ? (
        <div className="glass" style={{ height: 320, borderRadius: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <>
          {/* Week strip */}
          <div className="glass" style={{ padding: '12px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button type="button" onClick={goPrevWeek} disabled={!canPrev} aria-label="Previous week"
              style={{ background: 'none', border: 'none', cursor: canPrev ? 'pointer' : 'default', color: 'var(--fg-quiet)', opacity: canPrev ? 1 : 0.3, padding: 4, lineHeight: 0 }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start' }}>
              {week.map((iso, i) => {
                const dayData = byDate.get(iso)
                const vals = dayData ? ringValues(dayData.nutrition, targets) : [0, 0, 0]
                return (
                  <MiniDay
                    key={iso}
                    iso={iso}
                    dayLabel={WEEKDAY_LABELS[i]}
                    dateNum={isoToDate(iso).getDate()}
                    values={vals}
                    selected={iso === activeDate}
                    disabled={iso > todayIso || iso < earliestIso}
                    onSelect={setSelectedDate}
                  />
                )
              })}
            </div>
            <button type="button" onClick={goNextWeek} disabled={!canNext} aria-label="Next week"
              style={{ background: 'none', border: 'none', cursor: canNext ? 'pointer' : 'default', color: 'var(--fg-quiet)', opacity: canNext ? 1 : 0.3, padding: 4, lineHeight: 0 }}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Hero rings */}
          <div
            className="glass"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', position: 'relative' }}
          >
            {/* Calories + Sodium header */}
            <div style={{ display: 'grid', gridTemplateColumns: targets.sodium_mg ? '1fr 1fr' : '1fr', gap: 0, marginBottom: 16 }}>
              <div style={{ paddingRight: targets.sodium_mg ? 20 : 0 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calories</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
                  <span className="num" style={{ fontSize: 30, fontWeight: 300, color: calVis.numColor, letterSpacing: '-0.03em', lineHeight: 1, transition: 'color 400ms' }}>
                    {fmt(nutrition.calories ?? 0, 0)}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>/ {targets.calories != null ? fmt(targets.calories, 0) : '—'} kcal</span>
                </div>
                <MacroBar pct={calPct ?? 0} color={calVis.barColor} glow={calVis.glow} height={3} marginTop={8} />
              </div>
              {targets.sodium_mg && (
                <div style={{ paddingLeft: 20, borderLeft: '1px solid var(--glass-edge)' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sodium</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
                    <span className="num" style={{ fontSize: 22, fontWeight: 300, color: sodiumVis.numColor, letterSpacing: '-0.02em', lineHeight: 1, transition: 'color 400ms' }}>
                      {fmt(nutrition.sodium_mg ?? 0, 0)}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>/ {fmt(targets.sodium_mg, 0)} mg</span>
                  </div>
                  <MacroBar pct={sodiumPct ?? 0} color={sodiumVis.barColor} glow={sodiumVis.glow} height={3} marginTop={8} />
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--glass-edge)', margin: '0 0 20px 0' }} />

            <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', minWidth: 0 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ width: 140, height: 140 }}>
                  <ActivityRings key={activeDate} size={140} values={rings} colors={RING_COLORS} thickness={12} gap={5} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <RingLegend
                  color="var(--sun-400)"
                  label="Sat fat"
                  value={`${fmt(nutrition.saturated_fat_g ?? 0, 1, 'g')} / ${fmt(targets.saturated_fat_g, 1, 'g')}`}
                  pct={targets.saturated_fat_g ? Math.round(((nutrition.saturated_fat_g ?? 0) / targets.saturated_fat_g) * 100) : 0}
                  invert
                />
                <RingLegend
                  color="var(--good)"
                  label="Sol. fiber"
                  value={`${fmt(nutrition.soluble_fiber_g ?? 0, 1, 'g')} / ${fmt(targets.soluble_fiber_g, 1, 'g')}`}
                  pct={targets.soluble_fiber_g ? Math.round(((nutrition.soluble_fiber_g ?? 0) / targets.soluble_fiber_g) * 100) : 0}
                />
                <RingLegend
                  color="var(--aurora-violet)"
                  label="Protein"
                  value={`${fmt(nutrition.protein_g ?? 0, 0, 'g')} / ${fmt(targets.protein_g, 0, 'g')}`}
                  pct={targets.protein_g ? Math.round(((nutrition.protein_g ?? 0) / targets.protein_g) * 100) : 0}
                />
              </div>
            </div>
          </div>

          {/* Segmented tabs */}
          <div className="glass-inset" style={{ display: 'flex', padding: 4, borderRadius: 12, gap: 4 }}>
            {(['summary', 'nutrients'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, textTransform: 'capitalize',
                  background: tab === t ? 'var(--glass-3)' : 'transparent',
                  color: tab === t ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
                  transition: 'background 200ms, color 200ms',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'summary' ? (
            <>
              <div className="glass" style={{ padding: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Targets</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {METRICS.map(m => (
                    <MetricCard key={m.key} def={m} logged={nutrition[m.key as string] ?? 0} target={targets[m.key]} history={trendWindow} />
                  ))}
                </div>
              </div>
              <RecentMealsCard
                meals={dayDetail?.meals ?? []}
                compact
                title="Meals logged"
                subtitle={isToday ? "Latest meal logs from today. Tap a meal to see full nutrient breakdown." : "Meal logs from this day. Tap a meal to see full nutrient breakdown."}
                emptyText={isToday ? "No meals logged yet today." : "No meals logged on this day."}
                showTimeSinceLast={isToday}
              />
            </>
          ) : (
            <>
              {/* Coverage meter */}
              <div className="glass" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <span className="eyebrow">Nutrient coverage</span>
                  <span className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
                    {coverage.total > 0 ? `${coverage.hit} / ${coverage.total} met` : '—'}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--glass-edge)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${coverage.total > 0 ? (coverage.hit / coverage.total) * 100 : 0}%`,
                    background: 'linear-gradient(90deg, var(--good), #34d399)',
                    borderRadius: 999, transition: 'width 0.5s var(--ease-ring)',
                  }} />
                </div>
                {coverage.total === 0 && (
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--fg-quiet)', lineHeight: 1.5 }}>
                    Log foods via search or barcode to track vitamins and minerals.
                  </p>
                )}

                {flags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                    {flags.map(f => (
                      <span
                        key={f.key}
                        style={{
                          fontSize: 12, padding: '5px 10px', borderRadius: 999,
                          background: f.kind === 'low' ? 'rgba(251,191,36,0.10)' : 'rgba(251,113,133,0.10)',
                          border: `1px solid ${f.kind === 'low' ? 'rgba(251,191,36,0.25)' : 'rgba(251,113,133,0.25)'}`,
                          color: f.kind === 'low' ? 'var(--warn)' : 'var(--bad)',
                        }}
                      >
                        {f.kind === 'low' ? 'Low' : 'Over'} {f.label}
                        <span className="num" style={{ color: 'var(--fg-quiet)', marginLeft: 6 }}>{Math.round(f.pct)}%</span>
                      </span>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="btn"
                  onClick={handleCoach}
                  style={{ marginTop: 14, fontSize: 13, padding: '8px 14px' }}
                >
                  <Sparkles size={13} /> Ask Luma about my nutrients
                </button>
              </div>

              {/* Full breakdown with per-nutrient trends */}
              <div className="glass" style={{ padding: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>Breakdown</div>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginBottom: 14 }}>
                  Tap any nutrient with data to see its trend. %DV based on{dri ? ' your personalised DRI' : ' a 2,000 kcal reference'}.
                </div>
                <NutrientBreakdownList nutrition={nutrition} dri={dri} history={trendWindow} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
