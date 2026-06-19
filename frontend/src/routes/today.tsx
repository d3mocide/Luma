import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Flame, Heart, Activity, Moon, Timer, Wind, X, Leaf, Thermometer, SlidersHorizontal } from 'lucide-react'
import { api, TodayData, TrendSeries, User } from '../lib/api'
import { createMockTodayData, createMockWeightSeries } from '../lib/mock-data'
import { fmtMinutes, fmt } from '../lib/format'
import { convertWeight, convertWeightSlope, measurementSlopeUnit, measurementWeightUnit, useMeasurementSystem } from '../lib/measurements'
import ActivityRings from '../components/ui/ActivityRings'
import WeightChart from '../components/ui/WeightChart'
import SlopeChip from '../components/ui/SlopeChip'
import StreakStrip from '../components/ui/StreakStrip'
import { TodayShell, LoadingSkeleton, ErrorCard } from '../components/today/TodayShell'
import { RingLegend } from '../components/today/RingLegend'
import { MacroBar } from '../components/today/MacroBar'
import { BioTile } from '../components/today/BioTile'
import { PlanRow } from '../components/today/PlanRow'
import { RecentMealsCard, RecentMeal } from '../components/today/RecentMealsCard'
import { StreakHistorySheet } from '../components/today/StreakHistorySheet'
import { NutritionCalculatorCard } from '../components/today/NutritionCalculatorCard'
import { WaterCard } from '../components/today/WaterCard'
import { TodayCustomizePanel } from '../components/today/TodayCustomizePanel'
import { useHiddenMetrics } from '../lib/hidden-metrics'
import { useTodayLayout } from '../lib/today-layout'
import { desktopGroupOrder, type DesktopGroup } from '../lib/today-sections'
import { useUIStore } from '../stores'

export default function TodayRoute() {
  const forceMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === '1'
  const measurementSystem = useMeasurementSystem()
  const { hidden: hiddenMetrics } = useHiddenMetrics()
  const { order: sectionOrder, hidden: hiddenSections, setOrder, toggleVisible } = useTodayLayout()
  const [customizing, setCustomizing] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null)
  const [deletingMealId, setDeletingMealId] = useState<string | null>(null)
  const [showStreakHistory, setShowStreakHistory] = useState(false)
  const [dismissedNudgeIds, setDismissedNudgeIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('luma_dismissed_nudges')
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
    retry: false,
  })

  const { data: todayApiData, isLoading, error } = useQuery<TodayData>({
    queryKey: ['today'],
    queryFn: () => api.get('/today'),
    enabled: !forceMockData,
  })

  const { data: weightTrendData } = useQuery<TrendSeries>({
    queryKey: ['trends', 'weight_kg', '30d'],
    queryFn: () => api.get('/trends/weight_kg?range=30d'),
    enabled: !forceMockData,
  })

  const { data: pendingData } = useQuery<{ pending: Array<{ meal_event_id: string; meal_name: string; logged_at: string; slot: string }> }>({
    queryKey: ['journal-pending'],
    queryFn: () => api.get('/journal/pending'),
    staleTime: 60_000,
    enabled: !forceMockData,
  })
  const pendingMeal = pendingData?.pending?.[0] ?? null
  const nudgeDismissed = pendingMeal ? dismissedNudgeIds.includes(pendingMeal.meal_event_id) : true

  const handleDismissNudge = () => {
    if (!pendingMeal) return
    const newIds = [...dismissedNudgeIds, pendingMeal.meal_event_id]
    setDismissedNudgeIds(newIds)
    try { localStorage.setItem('luma_dismissed_nudges', JSON.stringify(newIds)) } catch { /* ignore */ }
  }

  const logPlannedMealMutation = useMutation({
    mutationFn: async (meal: TodayData['plan_today'][number]) => {
      setLoggingMealId(meal.id)
      return api.post(`/plan/${meal.plan_id}/log-as-eaten/${meal.id}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to log planned meal.')
    },
    onSettled: () => {
      setLoggingMealId(null)
    },
  })

  const deleteMealMutation = useMutation({
    mutationFn: async (mealId: string) => {
      setDeletingMealId(mealId)
      return api.delete(`/log/meal/${mealId}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to delete meal.')
    },
    onSettled: () => {
      setDeletingMealId(null)
    },
  })

  const startEditingMeal = useUIStore((s) => s.startEditingMeal)

  const handleEditMeal = (meal: RecentMeal) => {
    startEditingMeal(
      meal.id,
      meal.items || [],
      meal.slot as 'breakfast' | 'lunch' | 'dinner' | 'snack',
      meal.raw_input || meal.headline || ''
    )
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (isLoading && !forceMockData) return <TodayShell><LoadingSkeleton/></TodayShell>
  if ((error || !todayApiData) && !forceMockData) return <TodayShell><ErrorCard/></TodayShell>

  const useMockData = forceMockData || user?.role === 'demo'
  const data = useMockData ? createMockTodayData() : (todayApiData as TodayData)

  const adherence = data.adherence_today
  const bio = data.biometrics_latest

  const rings = [
    (adherence?.sat_fat_g?.pct ?? 0) / 100,
    // Fiber: cap at 1.0 — exceeding the fiber target is good, not an overage to flag
    Math.min((adherence?.soluble_fiber_g?.pct ?? 0) / 100, 1.0),
    // Protein: cap at 1.0 — exceeding protein target is fine, keeps ring visual clean
    Math.min((adherence?.protein_g?.pct ?? 0) / 100, 1.0),
  ]
  const ringColors = [
    { from: '#fde68a', to: '#fbbf24', glow: 'rgba(251,191,36,0.5)' }, // Yellow (Sat fat)
    { from: '#86efac', to: '#34d399', glow: 'rgba(52,211,153,0.5)' }, // Green (Sol. Fiber)
    { from: '#c084fc', to: '#a78bfa', glow: 'rgba(167,139,250,0.5)' }, // Purple (Protein)
  ]

  const calPct = adherence?.calories?.pct ?? 0
  const sodiumPct = adherence?.sodium_mg?.pct ?? 0
  // Calories is a max target; Sodium is a max target
  const calStatus: 'under' | 'good' | 'over' = calPct > 100 ? 'over' : calPct >= 90 ? 'good' : 'under'
  const sodiumStatus: 'under' | 'good' | 'over' = sodiumPct > 100 ? 'over' : sodiumPct >= 90 ? 'good' : 'under'

  const calBarColor = calStatus === 'over'
    ? 'linear-gradient(90deg, var(--bad), #f87171)'
    : calStatus === 'good'
      ? 'linear-gradient(90deg, var(--good), #34d399)'
      : 'linear-gradient(90deg, var(--sky-400), var(--sky-500))'
  const calBarGlow = calStatus === 'over'
    ? '0 0 8px rgba(239,68,68,0.45)'
    : calStatus === 'good'
      ? '0 0 8px rgba(52,211,153,0.45)'
      : '0 0 8px rgba(56,189,248,0.4)'
  const calNumColor = calStatus === 'over' ? 'var(--bad)' : calStatus === 'good' ? 'var(--good)' : 'var(--fg-primary)'

  const sodiumBarColor = sodiumStatus === 'over'
    ? 'linear-gradient(90deg, var(--bad), #f87171)'
    : 'linear-gradient(90deg, #fdba74, #fb923c)'
  const sodiumBarGlow = sodiumStatus === 'over'
    ? '0 0 8px rgba(239,68,68,0.45)'
    : '0 0 8px rgba(251,146,60,0.4)'
  const sodiumNumColor = sodiumStatus === 'over' ? 'var(--bad)' : '#fb923c'
  const weightUnit = measurementWeightUnit(measurementSystem)
  const slopeUnit = measurementSlopeUnit(measurementSystem)
  const latestWeight = convertWeight(data.weight.latest_kg, measurementSystem)
  const targetWeight = convertWeight(data.weight.target_kg, measurementSystem)
  const trend7d = convertWeightSlope(data.weight.trend_7d, measurementSystem)
  const trend28d = convertWeightSlope(data.weight.trend_28d, measurementSystem)
  // Only synthesize a weight series for mock/demo accounts. Real users with an
  // empty trend series get an empty-state message instead of a fabricated
  // weight-loss line that never happened.
  const rawWeightSeries = useMockData
    ? createMockWeightSeries(data.weight.latest_kg)
    : (weightTrendData?.series ?? [])

  const weightSeries = rawWeightSeries
    .map((point) => ({
      date: point.date,
      last: convertWeight(point.last, measurementSystem) ?? point.last,
    }))
    .filter((point): point is { date: string; last: number } => point.last != null)
  const hasWeightSeries = weightSeries.length > 0

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const userDisplayName = (user?.display_name ?? '').trim()
  const greetingName = userDisplayName || 'there'

  function handleJournalNudge() {
    if (!pendingMeal) return
    const params = new URLSearchParams({
      tab: 'journal',
      mealId: pendingMeal.meal_event_id,
      mealName: pendingMeal.meal_name,
      loggedAt: pendingMeal.logged_at,
      slot: pendingMeal.slot,
    })
    navigate(`/meals?${params.toString()}`)
  }

  return (
    <TodayShell>

      {/* Journal nudge banner */}
      {pendingMeal && !nudgeDismissed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 20px',
          background: 'linear-gradient(90deg, rgba(56,189,248,0.08), rgba(167,139,250,0.08))',
          borderBottom: '1px solid var(--glass-edge)',
        }}>
          <Leaf size={18} style={{ flexShrink: 0, color: 'var(--fg-secondary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--fg-primary)' }}>
              How did you feel after <strong>{pendingMeal.meal_name}</strong>?
            </span>
            <span style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginLeft: 6 }}>
              Logged {Math.round((Date.now() - new Date(pendingMeal.logged_at).getTime()) / 60000)}m ago
            </span>
          </div>
          <button
            className="btn"
            style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }}
            onClick={handleJournalNudge}
          >
            Log it →
          </button>
          <button
            onClick={handleDismissNudge}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--fg-quiet)', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Desktop layout */}
      <div className="hidden md:flex md:flex-col" style={{ padding: '32px 40px 40px', gap: 20 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div className="eyebrow">{dateLabel}</div>
            <h1 style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
              {greeting},{' '}
              <span className="serif-italic gradient-accent-text" style={{ background: 'var(--accent-gradient-hero)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{greetingName}</span>.
            </h1>
          </div>
        </header>

        {/* Desktop sections rendered in user-defined group order */}
        {desktopGroupOrder(sectionOrder).map((group: DesktopGroup) => {
          if (group === 'top') {
            const showWeight = !hiddenSections.has('weight')
            const showNutrition = !hiddenSections.has('nutrition')
            const showStreak = !hiddenSections.has('streak')
            if (!showWeight && !showNutrition && !showStreak) return null
            return (
              <div key="top" style={{ display: 'grid', gridTemplateColumns: showWeight && (showNutrition || showStreak) ? '1.4fr 1fr' : '1fr', gap: 20, alignItems: 'stretch' }}>
                {showWeight && (
                  <div className="glass" style={{ padding: 28, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ position: 'absolute', top: -150, right: -180, width: 560, height: 460, background: 'radial-gradient(ellipse 60% 56% at 68% 34%, rgba(56,189,248,0.28), transparent 70%), radial-gradient(ellipse 56% 60% at 86% 78%, rgba(56,189,248,0.12), transparent 72%)', filter: 'blur(18px)', opacity: 0.92, pointerEvents: 'none' }}/>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div>
                        <div className="eyebrow">Weight · 30d</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
                          <span className="num" style={{ fontSize: 64, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--fg-primary)' }}>{latestWeight?.toFixed(1) ?? '—'}</span>
                          <span style={{ fontSize: 18, color: 'var(--fg-tertiary)' }}>{weightUnit}</span>
                          {targetWeight != null && (
                            <span style={{ fontSize: 13, color: 'var(--fg-quiet)', marginLeft: 8 }}>
                              target <span className="num" style={{ color: 'var(--fg-tertiary)' }}>{targetWeight.toFixed(1)} {weightUnit}</span>
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                          <SlopeChip label="7d" value={trend7d} unit={slopeUnit}/>
                          <SlopeChip label="28d" value={trend28d} unit={slopeUnit}/>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 18, marginLeft: -8, marginRight: -8 }}>
                      {hasWeightSeries ? (
                        <WeightChart data={weightSeries} width={620} height={200}/>
                      ) : (
                        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--fg-quiet)' }}>
                          Not enough weight data yet
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {(showNutrition || showStreak) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {showNutrition && (
                      <div
                        className="glass"
                        onClick={() => navigate('/nutrition')}
                        style={{ padding: 24, display: 'flex', flexDirection: 'column', cursor: 'pointer', userSelect: 'none', flex: 1 }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: adherence?.sodium_mg?.target != null ? '1fr 1fr' : '1fr', gap: 0 }}>
                          <div style={{ paddingRight: adherence?.sodium_mg?.target != null ? 20 : 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calories</span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
                              <span className="num" style={{ fontSize: 30, fontWeight: 300, color: calNumColor, letterSpacing: '-0.03em', lineHeight: 1, transition: 'color 400ms' }}>{fmt(adherence?.calories?.logged, 0)}</span>
                              <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>/ {fmt(adherence?.calories?.target, 0)} kcal</span>
                            </div>
                            <MacroBar pct={calPct} color={calBarColor} glow={calBarGlow} />
                          </div>
                          {adherence?.sodium_mg?.target != null && (
                            <div style={{ paddingLeft: 20, borderLeft: '1px solid var(--glass-edge)' }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sodium</span>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
                                <span className="num" style={{ fontSize: 22, fontWeight: 300, color: sodiumNumColor, letterSpacing: '-0.02em', lineHeight: 1, transition: 'color 400ms' }}>{fmt(adherence.sodium_mg.logged, 0)}</span>
                                <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>/ {fmt(adherence.sodium_mg.target, 0)} mg</span>
                              </div>
                              <MacroBar pct={sodiumPct} color={sodiumBarColor} glow={sodiumBarGlow} />
                            </div>
                          )}
                        </div>
                        <hr style={{ border: 'none', borderTop: '1px solid var(--glass-edge)', margin: '16px 0' }} />
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                          <div style={{ flexShrink: 0 }}>
                            <div style={{ width: 160, height: 160 }}>
                              <ActivityRings size={160} values={rings} colors={ringColors} thickness={13} gap={5}/>
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <RingLegend color="var(--sun-400)" label="Sat fat" value={`${fmt(adherence?.sat_fat_g?.logged, 1, 'g')} / ${fmt(adherence?.sat_fat_g?.target, 1, 'g')}`} pct={adherence?.sat_fat_g?.pct ?? 0} invert/>
                            <RingLegend color="var(--good)" label="Sol. Fiber" value={`${fmt(adherence?.soluble_fiber_g?.logged, 1, 'g')} / ${fmt(adherence?.soluble_fiber_g?.target, 1, 'g')}`} pct={adherence?.soluble_fiber_g?.pct ?? 0}/>
                            <RingLegend color="var(--aurora-violet)" label="Protein" value={`${fmt(adherence?.protein_g?.logged, 0, 'g')} / ${fmt(adherence?.protein_g?.target, 0, 'g')}`} pct={adherence?.protein_g?.pct ?? 0}/>
                          </div>
                        </div>
                      </div>
                    )}
                    {showStreak && (
                      <div className="glass" style={{ padding: 0, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: -125, right: -110, width: 320, height: 280, background: 'radial-gradient(ellipse 58% 56% at 62% 38%, rgba(251,191,36,0.17), transparent 70%), radial-gradient(ellipse 52% 52% at 88% 82%, rgba(251,191,36,0.08), transparent 74%)', filter: 'blur(14px)', opacity: 0.88, pointerEvents: 'none' }}/>
                        <StreakStrip days={data.streak_days ?? 0} adherence={adherence} onShowHistory={() => setShowStreakHistory(true)}/>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          if (group === 'biometrics') {
            if (hiddenSections.has('biometrics')) return null
            const tiles = [
              !hiddenMetrics.has('hrv_ms') && <BioTile key="hrv_ms" icon={<Heart size={13} strokeWidth={1.5}/>} label="HRV" value={fmt(bio?.hrv_ms, 0)} unit="ms" color="var(--bad)"/>,
              !hiddenMetrics.has('rhr_bpm') && <BioTile key="rhr_bpm" icon={<Activity size={13} strokeWidth={1.5}/>} label="Resting HR" value={fmt(bio?.rhr_bpm, 0)} unit="bpm" color="var(--sky-400)"/>,
              !hiddenMetrics.has('sleep_duration_min') && <BioTile key="sleep_duration_min" icon={<Moon size={13} strokeWidth={1.5}/>} label="Sleep" value={fmtMinutes(bio?.sleep_duration_min)} color="var(--aurora-violet)"/>,
              !hiddenMetrics.has('sleep_score') && <BioTile key="sleep_score" icon={<Sparkles size={13} strokeWidth={1.5}/>} label="Sleep score" value={fmt(bio?.sleep_score, 0)} color="var(--sun-400)"/>,
              !hiddenMetrics.has('spo2_pct') && <BioTile key="spo2_pct" icon={<Wind size={13} strokeWidth={1.5}/>} label="Blood O₂" value={fmt(bio?.spo2_pct, 1)} unit="%" color="var(--sky-400)"/>,
              !hiddenMetrics.has('steps') && <BioTile key="steps" icon={<Activity size={13} strokeWidth={1.5}/>} label="Steps" value={bio?.steps != null ? Math.round(bio.steps).toLocaleString() : '—'} color="var(--sky-400)"/>,
              !hiddenMetrics.has('active_kcal') && <BioTile key="active_kcal" icon={<Flame size={13} strokeWidth={1.5}/>} label="Active cal" value={fmt(bio?.active_kcal, 0)} unit="kcal" color="var(--sun-400)"/>,
              !hiddenMetrics.has('exercise_min') && <BioTile key="exercise_min" icon={<Timer size={13} strokeWidth={1.5}/>} label="Exercise" value={fmt(bio?.exercise_min, 0)} unit="min" color="var(--good)"/>,
              !hiddenMetrics.has('respiratory_rate_bpm') && <BioTile key="respiratory_rate_bpm" icon={<Wind size={13} strokeWidth={1.5}/>} label="Respir. rate" value={fmt(bio?.respiratory_rate_bpm, 1)} unit="bpm" color="var(--sky-300)"/>,
              !hiddenMetrics.has('body_temp_c') && <BioTile key="body_temp_c" icon={<Thermometer size={13} strokeWidth={1.5}/>} label="Body temp" value={fmt(bio?.body_temp_c, 1)} unit="°C" color="var(--good)"/>,
            ].filter(Boolean)
            if (tiles.length === 0) return null
            return (
              <div key="biometrics" className="glass" style={{ padding: 24 }}>
                <div className="eyebrow" style={{ marginBottom: 16 }}>Biometrics · latest</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>{tiles}</div>
              </div>
            )
          }

          if (group === 'insight_row') {
            const showInsight = !hiddenSections.has('insight')
            const showPlan = !hiddenSections.has('plan')
            const showWater = !hiddenSections.has('water')
            if (!showInsight && !showPlan && !showWater) return null
            const cols = [showInsight && '1.15fr', showPlan && '1fr', showWater && '0.75fr'].filter(Boolean).join(' ')
            return (
              <div key="insight_row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 20, alignItems: 'stretch' }}>
                {showInsight && (data.active_insight ? (
                  <div className="glass" style={{ display: 'flex', flexDirection: 'column', padding: 24, position: 'relative', overflow: 'hidden', background: 'var(--insight-card-bg)' }}>
                    <div style={{ position: 'absolute', top: -80, right: -70, width: 300, height: 240, background: 'radial-gradient(ellipse 56% 52% at 76% 30%, rgba(251,191,36,0.30), transparent 68%), radial-gradient(ellipse 48% 52% at 90% 80%, rgba(251,191,36,0.10), transparent 72%)', filter: 'blur(14px)', opacity: 0.9, pointerEvents: 'none' }}/>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 10, background: 'var(--insight-icon-bg)', border: '1px solid var(--insight-icon-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--insight-icon-fg)' }}>
                        <Sparkles size={15}/>
                      </div>
                      <span className="eyebrow" style={{ color: 'var(--insight-icon-fg)' }}>{data.active_insight.severity}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 18, lineHeight: 1.45, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>
                      {data.active_insight.headline}
                    </p>
                    {data.active_insight.cta && (
                      <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-secondary)' }}>{data.active_insight.cta}</p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 24 }}>
                      <button className="btn today-insight-cta" style={{ padding: '8px 14px', fontSize: 13, background: 'var(--insight-cta-bg)', borderColor: 'var(--insight-cta-border)', color: 'var(--insight-cta-fg)' }} onClick={() => navigate('/coach', { state: { thread_seed: data.active_insight?.thread_seed } })}>
                        <Sparkles size={13}/> Ask Luma
                      </button>
                      <button onClick={() => navigate('/coach?tab=insights')} style={{ fontSize: 12, color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>See all →</button>
                    </div>
                  </div>
                ) : (
                  <div className="glass" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'var(--fg-quiet)', fontSize: 14 }}>No insights yet.</p>
                  </div>
                ))}
                {showPlan && (
                  <div className="glass" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ marginBottom: 16 }}>
                      <div className="eyebrow">Today's plan</div>
                      <div style={{ fontSize: 14, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                        <span className="num" style={{ color: 'var(--fg-primary)' }}>{data.plan_today.filter((m: TodayData['plan_today'][number]) => m.logged).length}</span>{' '}of{' '}
                        <span className="num">{data.plan_today.length}</span> logged
                      </div>
                    </div>
                    {data.plan_today.length === 0 ? (
                      <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>No plan yet — generate one in the Plan tab.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {data.plan_today.map((m: TodayData['plan_today'][number]) => (
                          <PlanRow key={m.id} meal={m} onLog={() => logPlannedMealMutation.mutate(m)} isLogging={loggingMealId === m.id && logPlannedMealMutation.isPending}/>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {showWater && <WaterCard/>}
              </div>
            )
          }

          if (group === 'nutrition_calc') {
            if (hiddenSections.has('nutrition_calc')) return null
            return <NutritionCalculatorCard key="nutrition_calc" adherence={data.adherence_today} compact={false}/>
          }

          if (group === 'meals') {
            if (hiddenSections.has('meals')) return null
            return <RecentMealsCard key="meals" meals={data.recent_meals ?? []} compact={false} onDelete={(id) => deleteMealMutation.mutate(id)} deletingId={deletingMealId} onEdit={handleEditMeal}/>
          }

          return null
        })}

      </div>


      {/* Mobile layout */}
      <div className="md:hidden thin-scroll today-mobile-scroll">
        <div className="mobile-hero">
          <div className="mobile-hero-content">
            <div className="eyebrow">{dateLabel}</div>
            <h1 className="mobile-hero-title">
              {greeting},{' '}
              <span className="serif-italic gradient-accent-text" style={{ background: 'var(--accent-gradient-hero)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{greetingName}</span>.
            </h1>
          </div>
        </div>

        {/* Mobile sections rendered in user-defined order */}
        {sectionOrder.map(sectionId => {
          if (hiddenSections.has(sectionId)) return null

          if (sectionId === 'nutrition') return (
            <div
              key="nutrition"
              className="glass"
              onClick={() => navigate('/nutrition')}
              style={{ padding: 18, display: 'flex', flexDirection: 'column', marginBottom: 14, cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: adherence?.sodium_mg?.target != null ? '1fr 1fr' : '1fr', gap: 0 }}>
                <div style={{ paddingRight: adherence?.sodium_mg?.target != null ? 16 : 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Calories</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                    <span className="num" style={{ fontSize: 26, fontWeight: 300, color: calNumColor, letterSpacing: '-0.03em', lineHeight: 1, transition: 'color 400ms' }}>{fmt(adherence?.calories?.logged, 0)}</span>
                    <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>/ {fmt(adherence?.calories?.target, 0)} kcal</span>
                  </div>
                  <MacroBar pct={calPct} color={calBarColor} glow={calBarGlow} height={3} marginTop={7} />
                </div>
                {adherence?.sodium_mg?.target != null && (
                  <div style={{ paddingLeft: 16, borderLeft: '1px solid var(--glass-edge)' }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Sodium</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                      <span className="num" style={{ fontSize: 20, fontWeight: 300, color: sodiumNumColor, letterSpacing: '-0.02em', lineHeight: 1, transition: 'color 400ms' }}>{fmt(adherence.sodium_mg.logged, 0)}</span>
                      <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>/ {fmt(adherence.sodium_mg.target, 0)} mg</span>
                    </div>
                    <MacroBar pct={sodiumPct} color={sodiumBarColor} glow={sodiumBarGlow} height={3} marginTop={7} />
                  </div>
                )}
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--glass-edge)', margin: '14px 0' }} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ width: 140, height: 140 }}>
                    <ActivityRings size={140} values={rings} colors={ringColors} thickness={12} gap={5}/>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <RingLegend color="var(--sun-400)" label="Sat fat" value={`${fmt(adherence?.sat_fat_g?.logged, 1, 'g')} / ${fmt(adherence?.sat_fat_g?.target, 1, 'g')}`} pct={adherence?.sat_fat_g?.pct ?? 0} invert/>
                  <RingLegend color="var(--good)" label="Sol. Fiber" value={`${fmt(adherence?.soluble_fiber_g?.logged, 1, 'g')} / ${fmt(adherence?.soluble_fiber_g?.target, 1, 'g')}`} pct={adherence?.soluble_fiber_g?.pct ?? 0}/>
                  <RingLegend color="var(--aurora-violet)" label="Protein" value={`${fmt(adherence?.protein_g?.logged, 0, 'g')} / ${fmt(adherence?.protein_g?.target, 0, 'g')}`} pct={adherence?.protein_g?.pct ?? 0}/>
                </div>
              </div>
            </div>
          )

          if (sectionId === 'streak') return (
            <div key="streak" className="glass" style={{ padding: 0, marginBottom: 14, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'absolute', top: -100, right: -90, width: 260, height: 220, background: 'radial-gradient(ellipse 58% 56% at 62% 38%, rgba(251,191,36,0.17), transparent 70%), radial-gradient(ellipse 52% 52% at 88% 82%, rgba(251,191,36,0.08), transparent 74%)', filter: 'blur(12px)', opacity: 0.88, pointerEvents: 'none' }}/>
              <StreakStrip days={data.streak_days ?? 0} adherence={adherence} onShowHistory={() => setShowStreakHistory(true)}/>
            </div>
          )

          if (sectionId === 'water') return <WaterCard key="water" compact/>

          if (sectionId === 'weight') return (
            <div key="weight" className="glass" style={{ padding: 18, marginBottom: 14 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Weight</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="num" style={{ fontSize: 36, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--fg-primary)' }}>{latestWeight?.toFixed(1) ?? '—'}</span>
                    <span style={{ fontSize: 14, color: 'var(--fg-tertiary)', fontWeight: 500 }}>{weightUnit}</span>
                  </div>
                  {targetWeight != null && (
                    <div style={{ fontSize: 11, color: 'var(--fg-quiet)', whiteSpace: 'nowrap' }}>
                      target <span className="num" style={{ color: 'var(--fg-tertiary)', fontSize: 12 }}>{targetWeight.toFixed(1)} {weightUnit}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0, marginTop: -4 }}>
                  <SlopeChip label="28d" value={trend28d} unit={slopeUnit}/>
                  <SlopeChip label="7d" value={trend7d} unit={slopeUnit}/>
                </div>
              </div>
              <div style={{ marginTop: 16, marginLeft: -6, marginRight: -6 }}>
                {hasWeightSeries ? (
                  <WeightChart data={weightSeries} width={340} height={70} showAxis={false}/>
                ) : (
                  <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--fg-quiet)' }}>
                    Not enough weight data yet
                  </div>
                )}
              </div>
            </div>
          )

          if (sectionId === 'insight') return data.active_insight ? (
            <div key="insight" className="glass" style={{ display: 'flex', flexDirection: 'column', padding: 18, marginBottom: 14, position: 'relative', overflow: 'hidden', background: 'var(--insight-card-bg)' }}>
              <div style={{ position: 'absolute', top: -80, right: -85, width: 220, height: 190, background: 'radial-gradient(ellipse 56% 52% at 74% 30%, rgba(251,191,36,0.24), transparent 68%), radial-gradient(ellipse 48% 52% at 90% 80%, rgba(251,191,36,0.08), transparent 72%)', filter: 'blur(12px)', opacity: 0.88, pointerEvents: 'none' }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--insight-icon-bg)', border: '1px solid var(--insight-icon-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--insight-icon-fg)', flexShrink: 0 }}>
                  <Sparkles size={12}/>
                </div>
                <span className="eyebrow" style={{ color: 'var(--insight-icon-fg)', fontSize: 10 }}>{data.active_insight.severity || 'Insight'}</span>
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: 'var(--fg-primary)', fontWeight: 500 }}>{data.active_insight.headline}</p>
              {data.active_insight.cta && <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.4, color: 'var(--fg-secondary)' }}>{data.active_insight.cta}</p>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <button className="btn today-insight-cta" style={{ padding: '6px 12px', fontSize: 12, background: 'var(--insight-cta-bg)', borderColor: 'var(--insight-cta-border)', color: 'var(--insight-cta-fg)' }} onClick={() => navigate('/coach', { state: { thread_seed: data.active_insight?.thread_seed } })}>
                  <Sparkles size={11}/> Ask Luma
                </button>
                <button onClick={() => navigate('/coach?tab=insights')} style={{ fontSize: 11, color: 'var(--fg-quiet)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>See all →</button>
              </div>
            </div>
          ) : null

          if (sectionId === 'biometrics') {
            const tiles = [
              !hiddenMetrics.has('hrv_ms') && <BioTile key="hrv_ms" icon={<Heart size={13} strokeWidth={1.5}/>} label="HRV" value={fmt(bio?.hrv_ms, 0)} unit="ms" color="var(--bad)"/>,
              !hiddenMetrics.has('rhr_bpm') && <BioTile key="rhr_bpm" icon={<Activity size={13} strokeWidth={1.5}/>} label="RHR" value={fmt(bio?.rhr_bpm, 0)} unit="bpm" color="var(--sky-400)"/>,
              !hiddenMetrics.has('sleep_duration_min') && <BioTile key="sleep_duration_min" icon={<Moon size={13} strokeWidth={1.5}/>} label="Sleep" value={fmtMinutes(bio?.sleep_duration_min)} color="var(--aurora-violet)"/>,
              !hiddenMetrics.has('sleep_score') && <BioTile key="sleep_score" icon={<Sparkles size={13} strokeWidth={1.5}/>} label="Score" value={fmt(bio?.sleep_score, 0)} color="var(--sun-400)"/>,
              !hiddenMetrics.has('spo2_pct') && <BioTile key="spo2_pct" icon={<Wind size={13} strokeWidth={1.5}/>} label="Blood O₂" value={fmt(bio?.spo2_pct, 1)} unit="%" color="var(--sky-400)"/>,
              !hiddenMetrics.has('body_temp_c') && <BioTile key="body_temp_c" icon={<Thermometer size={13} strokeWidth={1.5}/>} label="Body temp" value={fmt(bio?.body_temp_c, 1)} unit="°C" color="var(--good)"/>,
              !hiddenMetrics.has('steps') && <BioTile key="steps" icon={<Activity size={13} strokeWidth={1.5}/>} label="Steps" value={bio?.steps != null ? Math.round(bio.steps).toLocaleString() : '—'} color="var(--sky-400)"/>,
              !hiddenMetrics.has('active_kcal') && <BioTile key="active_kcal" icon={<Flame size={13} strokeWidth={1.5}/>} label="Active cal" value={fmt(bio?.active_kcal, 0)} unit="kcal" color="var(--sun-400)"/>,
              !hiddenMetrics.has('exercise_min') && <BioTile key="exercise_min" icon={<Timer size={13} strokeWidth={1.5}/>} label="Exercise" value={fmt(bio?.exercise_min, 0)} unit="min" color="var(--good)"/>,
              !hiddenMetrics.has('respiratory_rate_bpm') && <BioTile key="respiratory_rate_bpm" icon={<Wind size={13} strokeWidth={1.5}/>} label="Respir. rate" value={fmt(bio?.respiratory_rate_bpm, 1)} unit="bpm" color="var(--sky-300)"/>,
            ].filter(Boolean)
            if (tiles.length === 0) return null
            return (
              <div key="biometrics" className="glass" style={{ padding: 18, marginBottom: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>Biometrics</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>{tiles}</div>
              </div>
            )
          }

          if (sectionId === 'nutrition_calc') return <NutritionCalculatorCard key="nutrition_calc" adherence={data.adherence_today} compact/>

          if (sectionId === 'plan') return (
            <div key="plan" className="glass" style={{ padding: 18, marginBottom: 14 }}>
              <div style={{ marginBottom: 12 }}>
                <div className="eyebrow">Today's plan</div>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 3 }}>
                  <span className="num" style={{ color: 'var(--fg-primary)' }}>{data.plan_today.filter((m: TodayData['plan_today'][number]) => m.logged).length}</span>/<span className="num">{data.plan_today.length}</span>
                </div>
              </div>
              {data.plan_today.length === 0 ? (
                <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>No plan — generate in Plan tab.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.plan_today.map((m: TodayData['plan_today'][number]) => (
                    <PlanRow key={m.id} meal={m} onLog={() => logPlannedMealMutation.mutate(m)} isLogging={loggingMealId === m.id && logPlannedMealMutation.isPending}/>
                  ))}
                </div>
              )}
            </div>
          )

          if (sectionId === 'meals') return (
            <div key="meals" style={{ marginBottom: 14 }}>
              <RecentMealsCard meals={data.recent_meals ?? []} compact onDelete={(id) => deleteMealMutation.mutate(id)} deletingId={deletingMealId} onEdit={handleEditMeal}/>
            </div>
          )

          return null
        })}

        {/* Mobile Customize button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, marginBottom: 24 }}>
          <button
            className={`customize-btn${customizing ? ' customize-btn--active' : ''}`}
            onClick={() => setCustomizing(c => !c)}
          >
            <SlidersHorizontal size={14}/>
            Customize Today
          </button>
        </div>
      </div>

      <StreakHistorySheet
        isOpen={showStreakHistory}
        onClose={() => setShowStreakHistory(false)}
        days={data.streak_days ?? 0}
        adherence={adherence}
        todayStr={data.date}
      />

      <TodayCustomizePanel
        isOpen={customizing}
        onClose={() => setCustomizing(false)}
        order={sectionOrder}
        hidden={hiddenSections}
        onReorder={setOrder}
        onToggle={toggleVisible}
      />

    </TodayShell>
  )
}
