import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Sparkles, Flame, Heart, Activity, Moon, Check, Plus, Sunrise, Fish, Apple, Leaf } from 'lucide-react'
import { api, TodayData, User } from '../lib/api'
import { createMockTodayData, createMockWeightSeries, isTodaySparseData } from '../lib/mock-data'
import { fmtMinutes, fmt } from '../lib/format'
import { convertWeight, convertWeightSlope, measurementSlopeUnit, measurementWeightUnit, useMeasurementSystem } from '../lib/measurements'
import ActivityRings from '../components/ui/ActivityRings'
import WeightChart from '../components/ui/WeightChart'
import SlopeChip from '../components/ui/SlopeChip'
import StreakStrip from '../components/ui/StreakStrip'

type QuickFood = {
  id: string
  name: string
  caloriesPer100g: number
  satFatPer100g: number
  solubleFiberPer100g: number
}

const QUICK_FOODS: QuickFood[] = [
  { id: 'oats', name: 'Steel cut oats', caloriesPer100g: 71, satFatPer100g: 0.2, solubleFiberPer100g: 1.1 },
  { id: 'beans', name: 'Black beans', caloriesPer100g: 132, satFatPer100g: 0.1, solubleFiberPer100g: 1.8 },
  { id: 'salmon', name: 'Salmon', caloriesPer100g: 206, satFatPer100g: 3.1, solubleFiberPer100g: 0 },
  { id: 'avocado', name: 'Avocado', caloriesPer100g: 160, satFatPer100g: 2.1, solubleFiberPer100g: 1.7 },
  { id: 'lentils', name: 'Cooked lentils', caloriesPer100g: 116, satFatPer100g: 0.1, solubleFiberPer100g: 1.4 },
]

export default function TodayRoute() {
  const forceMockData = import.meta.env.DEV && import.meta.env.VITE_USE_MOCK_DATA === '1'
  const measurementSystem = useMeasurementSystem()
  const queryClient = useQueryClient()
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null)
  const [selectedFoodId, setSelectedFoodId] = useState<string>(QUICK_FOODS[0].id)
  const [servingG, setServingG] = useState<string>('150')

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

  const quickAddMutation = useMutation({
    mutationFn: async () => {
      const food = QUICK_FOODS.find((f) => f.id === selectedFoodId) ?? QUICK_FOODS[0]
      const grams = Math.max(1, Number(servingG) || 0)
      const factor = grams / 100
      const nutrition = {
        calories: round1(food.caloriesPer100g * factor),
        saturated_fat_g: round1(food.satFatPer100g * factor),
        soluble_fiber_g: round1(food.solubleFiberPer100g * factor),
      }

      return api.post('/log/meal', {
        slot: 'snack',
        source: 'manual',
        items: [
          {
            name: food.name,
            quantity: grams,
            unit: 'g',
            nutrients: nutrition,
          },
        ],
        nutrition,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['today'] })
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to add meal.')
    },
  })

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  if (isLoading && !forceMockData) return <TodayShell><LoadingSkeleton/></TodayShell>
  if ((error || !todayApiData) && !forceMockData) return <TodayShell><ErrorCard/></TodayShell>

  const useMockData = forceMockData || isTodaySparseData(todayApiData as TodayData)
  const data = useMockData ? createMockTodayData() : (todayApiData as TodayData)

  const adherence = data.adherence_yesterday
  const bio = data.biometrics_latest
  const rings: [number, number, number] = [
    (adherence?.calories?.pct ?? 0) / 100,
    (adherence?.sat_fat_g?.pct ?? 0) / 100,
    (adherence?.soluble_fiber_g?.pct ?? 0) / 100,
  ]
  const weightUnit = measurementWeightUnit(measurementSystem)
  const slopeUnit = measurementSlopeUnit(measurementSystem)
  const latestWeight = convertWeight(data.weight.latest_kg, measurementSystem)
  const targetWeight = convertWeight(data.weight.target_kg, measurementSystem)
  const trend7d = convertWeightSlope(data.weight.trend_7d, measurementSystem)
  const trend28d = convertWeightSlope(data.weight.trend_28d, measurementSystem)
  const weightSeries = (useMockData ? createMockWeightSeries(data.weight.latest_kg) : []).map((point) => ({
    ...point,
    last: convertWeight(point.last, measurementSystem) ?? point.last,
  }))

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const userDisplayName = (user?.display_name ?? '').trim()
  const greetingName = userDisplayName || 'there'
  return (
    <TodayShell>

      {/* Desktop layout */}

      <div className="hidden md:flex md:flex-col" style={{ padding: '32px 40px 40px', gap: 20 }}>
        {/* Top bar */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div className="eyebrow">{dateLabel}</div>
            <h1 style={{
              margin: '6px 0 0',
              fontSize: 32, fontWeight: 400,
              letterSpacing: '-0.02em',
              color: 'var(--fg-primary)',
            }}>
              {greeting},{' '}
              <span className="serif-italic gradient-accent-text" style={{
                background: 'var(--accent-gradient-hero)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>{greetingName}</span>.
            </h1>
          </div>
        </header>

        {/* Row 1 & 2: Weight | Rings & Streak */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: '1fr 1fr', gap: 20 }}>
          {/* Weight card */}
          <div className="glass" style={{ gridRow: 'span 2', padding: 28, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{
              position: 'absolute', top: -150, right: -180, width: 560, height: 460,
              background: 'radial-gradient(ellipse 60% 56% at 68% 34%, rgba(56,189,248,0.28), transparent 70%), radial-gradient(ellipse 56% 60% at 86% 78%, rgba(56,189,248,0.12), transparent 72%)',
              filter: 'blur(18px)',
              opacity: 0.92,
              pointerEvents: 'none',
            }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div className="eyebrow">Weight · 30d</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 10 }}>
                  <span className="num" style={{
                    fontSize: 64, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1,
                    color: 'var(--fg-primary)',
                  }}>{latestWeight?.toFixed(1) ?? '—'}</span>
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
              <WeightChart data={weightSeries} width={620} height={200}/>
            </div>
          </div>

          {/* Rings */}
          <div className="glass" style={{ padding: 24, display: 'flex', gap: 22, alignItems: 'center' }}>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 150, height: 150, position: 'relative' }}>
                <ActivityRings size={150} values={rings} thickness={11} gap={5}/>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div className="num" style={{ fontSize: 20, lineHeight: 1, fontWeight: 500, color: 'var(--fg-primary)' }}>
                    {rings.filter(r => r >= 0.9).length} / 3
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>on target</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow">Yesterday</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <RingLegend color="var(--sky-400)" label="Calories"
                  value={`${adherence?.calories?.logged ?? '—'} / ${adherence?.calories?.target ?? '—'}`}
                  pct={adherence?.calories?.pct ?? 0}/>
                <RingLegend color="var(--sun-400)" label="Sat fat"
                  value={`${adherence?.sat_fat_g?.logged ?? '—'}g / ${adherence?.sat_fat_g?.target ?? '—'}g`}
                  pct={adherence?.sat_fat_g?.pct ?? 0} invert/>
                <RingLegend color="var(--good)" label="Fiber"
                  value={`${adherence?.soluble_fiber_g?.logged ?? '—'}g / ${adherence?.soluble_fiber_g?.target ?? '—'}g`}
                  pct={adherence?.soluble_fiber_g?.pct ?? 0}/>
              </div>
            </div>
          </div>

          {/* Streak */}
          <div className="glass" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: -125, right: -110, width: 320, height: 280,
              background: 'radial-gradient(ellipse 58% 56% at 62% 38%, rgba(251,191,36,0.17), transparent 70%), radial-gradient(ellipse 52% 52% at 88% 82%, rgba(251,191,36,0.08), transparent 74%)',
              filter: 'blur(14px)',
              opacity: 0.88,
              pointerEvents: 'none',
            }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div className="eyebrow">Streak</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                  <Flame size={22} color="var(--sun-300)"/>
                  <span className="num" style={{ fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
                    {0}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>days on track</span>
                </div>
              </div>
            </div>
            <StreakStrip days={0} ofMax={14}/>
          </div>
        </div>


        {/* Row 3: Biometrics full width */}
        <div className="glass" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="eyebrow">Biometrics · last night</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <BioTile icon={<Heart size={13} strokeWidth={1.5}/>} label="HRV" value={fmt(bio?.hrv_ms, 0)} unit="ms" color="var(--bad)"/>
            <BioTile icon={<Activity size={13} strokeWidth={1.5}/>} label="Resting HR" value={fmt(bio?.rhr_bpm, 0)} unit="bpm" color="var(--sky-400)"/>
            <BioTile icon={<Moon size={13} strokeWidth={1.5}/>} label="Sleep" value={fmtMinutes(bio?.sleep_duration_min)} color="var(--aurora-violet)"/>
            <BioTile icon={<Sparkles size={13} strokeWidth={1.5}/>} label="Sleep score" value={fmt(bio?.sleep_score, 0)} color="var(--sun-400)"/>
            <BioTile icon={<Activity size={13} strokeWidth={1.5}/>} label="Steps" value={bio?.steps != null ? Math.round(bio.steps).toLocaleString() : '—'} color="var(--sky-400)"/>
            <BioTile icon={<Flame size={13} strokeWidth={1.5}/>} label="Active cal" value={fmt(bio?.active_kcal, 0)} unit="kcal" color="var(--sun-400)"/>
          </div>
        </div>

        {/* Row 4: Remaining Today full width */}
        <div>
          <NutritionCalculatorCard
            adherence={data.adherence_yesterday}
            selectedFoodId={selectedFoodId}
            servingG={servingG}
            onFoodChange={setSelectedFoodId}
            onServingChange={setServingG}
            onAdd={() => quickAddMutation.mutate()}
            isAdding={quickAddMutation.isPending}
            compact={false}
          />
        </div>

        {/* Second row: insight + plan */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20 }}>
          {/* Insight */}
          {data.active_insight ? (
            <div className="glass" style={{
              padding: 24, position: 'relative', overflow: 'hidden',
              background: 'var(--insight-card-bg)',
              borderLeft: '2px solid var(--sun-400)',
            }}>
              <div style={{
                position: 'absolute', top: -80, right: -70, width: 300, height: 240,
                background: 'radial-gradient(ellipse 56% 52% at 76% 30%, rgba(251,191,36,0.30), transparent 68%), radial-gradient(ellipse 48% 52% at 90% 80%, rgba(251,191,36,0.10), transparent 72%)',
                filter: 'blur(14px)',
                opacity: 0.9,
                pointerEvents: 'none',
              }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 10,
                  background: 'var(--insight-icon-bg)',
                  border: '1px solid var(--insight-icon-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--insight-icon-fg)',
                }}>
                  <Sparkles size={15}/>
                </div>
                <span className="eyebrow" style={{ color: 'var(--insight-icon-fg)' }}>
                  {data.active_insight.severity}
                </span>
              </div>
              <p style={{
                margin: 0, fontSize: 18, lineHeight: 1.45,
                fontFamily: 'var(--font-sans)', fontWeight: 400,
                letterSpacing: '-0.01em', color: 'var(--fg-primary)',
              }}>
                {data.active_insight.headline}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button className="btn today-insight-cta" style={{
                  padding: '8px 14px', fontSize: 13,
                  background: 'var(--insight-cta-bg)',
                  borderColor: 'var(--insight-cta-border)',
                  color: 'var(--insight-cta-fg)',
                }}>
                  <Sparkles size={13}/> Ask Luma
                </button>
              </div>
            </div>
          ) : (
            <div className="glass" style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--fg-quiet)', fontSize: 14 }}>No insights yet.</p>
            </div>
          )}

          {/* Today's plan */}
          <div className="glass" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="eyebrow">Today's plan</div>
                <div style={{ fontSize: 14, color: 'var(--fg-tertiary)', marginTop: 4 }}>
                  <span className="num" style={{ color: 'var(--fg-primary)' }}>
                    {data.plan_today.filter((m: any) => m.logged).length}
                  </span>{' '}of{' '}
                  <span className="num">{data.plan_today.length}</span> logged
                </div>
              </div>
            </div>
            {data.plan_today.length === 0 ? (
              <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>No plan yet — generate one in the Plan tab.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.plan_today.map((m: TodayData['plan_today'][number]) => (
                  <PlanRow
                    key={m.id}
                    meal={m}
                    onLog={() => logPlannedMealMutation.mutate(m)}
                    isLogging={loggingMealId === m.id && logPlannedMealMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <RecentMealsCard meals={data.recent_meals ?? []} compact={false} />
      </div>

      {/* Mobile layout */}
      <div
        className="md:hidden thin-scroll today-mobile-scroll"
      >
        {/* Greeting */}
        <div className="mobile-hero">
          <div className="mobile-hero-content">
            <div className="eyebrow">{dateLabel}</div>
            <h1 className="mobile-hero-title">
              {greeting},{' '}
              <span className="serif-italic gradient-accent-text" style={{
                background: 'var(--accent-gradient-hero)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>{greetingName}</span>.
            </h1>
          </div>
        </div>

        {/* Rings */}
        <div className="glass" style={{ padding: 20, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: -115, right: -130, width: 320, height: 280,
            background: 'radial-gradient(ellipse 60% 56% at 68% 34%, rgba(56,189,248,0.24), transparent 70%), radial-gradient(ellipse 54% 56% at 88% 78%, rgba(56,189,248,0.10), transparent 72%)',
            filter: 'blur(14px)',
            opacity: 0.88,
            pointerEvents: 'none',
          }}/>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div className="eyebrow">Yesterday</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 130, height: 130, position: 'relative' }}>
                <ActivityRings size={130} values={rings} thickness={10} gap={4}/>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div className="num" style={{ fontSize: 18, lineHeight: 1, fontWeight: 500, color: 'var(--fg-primary)' }}>
                    {rings.filter(r => r >= 0.9).length} / 3
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 7, fontSize: 9, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>on target</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <RingLegend color="var(--sky-400)" label="Calories" value={`${adherence?.calories?.logged ?? '—'}`} pct={adherence?.calories?.pct ?? 0}/>
              <RingLegend color="var(--sun-400)" label="Sat fat" value={`${adherence?.sat_fat_g?.logged ?? '—'}g`} pct={adherence?.sat_fat_g?.pct ?? 0} invert/>
              <RingLegend color="var(--good)" label="Fiber" value={`${adherence?.soluble_fiber_g?.logged ?? '—'}g`} pct={adherence?.soluble_fiber_g?.pct ?? 0}/>
            </div>
          </div>
        </div>

        {/* Weight */}
        <div className="glass" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="eyebrow">Weight</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <span className="num" style={{ fontSize: 38, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--fg-primary)' }}>
                  {latestWeight?.toFixed(1) ?? '—'}
                </span>
                <span style={{ fontSize: 14, color: 'var(--fg-tertiary)' }}>{weightUnit}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <SlopeChip label="7d" value={trend7d} unit={slopeUnit}/>
              <SlopeChip label="28d" value={trend28d} unit={slopeUnit}/>
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="glass" style={{ padding: 18, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: -100, right: -90, width: 260, height: 220,
            background: 'radial-gradient(ellipse 58% 56% at 62% 38%, rgba(251,191,36,0.17), transparent 70%), radial-gradient(ellipse 52% 52% at 88% 82%, rgba(251,191,36,0.08), transparent 74%)',
            filter: 'blur(12px)',
            opacity: 0.88,
            pointerEvents: 'none',
          }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Streak</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <Flame size={18} color="var(--sun-300)"/>
                <span className="num" style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
                  {0}
                </span>
                <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>days on track</span>
              </div>
            </div>
          </div>
          <StreakStrip days={0} ofMax={14}/>
        </div>

        {/* Biometrics */}
        <div className="glass" style={{ padding: 18, marginBottom: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Biometrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <BioTile icon={<Heart size={13} strokeWidth={1.5}/>} label="HRV" value={fmt(bio?.hrv_ms, 0)} unit="ms" color="var(--bad)"/>
            <BioTile icon={<Activity size={13} strokeWidth={1.5}/>} label="RHR" value={fmt(bio?.rhr_bpm, 0)} unit="bpm" color="var(--sky-400)"/>
            <BioTile icon={<Moon size={13} strokeWidth={1.5}/>} label="Sleep" value={fmtMinutes(bio?.sleep_duration_min)} color="var(--aurora-violet)"/>
            <BioTile icon={<Sparkles size={13} strokeWidth={1.5}/>} label="Score" value={fmt(bio?.sleep_score, 0)} color="var(--sun-400)"/>
            <BioTile icon={<Activity size={13} strokeWidth={1.5}/>} label="Steps" value={bio?.steps != null ? Math.round(bio.steps).toLocaleString() : '—'} color="var(--sky-400)"/>
            <BioTile icon={<Flame size={13} strokeWidth={1.5}/>} label="Active cal" value={fmt(bio?.active_kcal, 0)} unit="kcal" color="var(--sun-400)"/>
          </div>
        </div>

        {/* Remaining (Nutrition Calculator Card) */}
        <div style={{ marginBottom: 14 }}>
          <NutritionCalculatorCard
            adherence={data.adherence_yesterday}
            selectedFoodId={selectedFoodId}
            servingG={servingG}
            onFoodChange={setSelectedFoodId}
            onServingChange={setServingG}
            onAdd={() => quickAddMutation.mutate()}
            isAdding={quickAddMutation.isPending}
            compact
          />
        </div>

        {/* Insight */}
        {data.active_insight ? (
          <div className="glass" style={{
            padding: 18, marginBottom: 14, position: 'relative', overflow: 'hidden',
            background: 'var(--insight-card-bg)',
            borderLeft: '2px solid var(--sun-400)',
          }}>
            <div style={{
              position: 'absolute', top: -80, right: -85, width: 220, height: 190,
              background: 'radial-gradient(ellipse 56% 52% at 74% 30%, rgba(251,191,36,0.24), transparent 68%), radial-gradient(ellipse 48% 52% at 90% 80%, rgba(251,191,36,0.08), transparent 72%)',
              filter: 'blur(12px)',
              opacity: 0.88,
              pointerEvents: 'none',
            }}/>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9,
                background: 'var(--insight-icon-bg)',
                border: '1px solid var(--insight-icon-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--insight-icon-fg)', flexShrink: 0,
              }}>
                <Sparkles size={13}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: 'var(--fg-primary)' }}>
                  {data.active_insight.headline}
                </p>
                <button className="btn today-insight-cta" style={{
                  marginTop: 12, padding: '6px 12px', fontSize: 12,
                  background: 'var(--insight-cta-bg)',
                  borderColor: 'var(--insight-cta-border)',
                  color: 'var(--insight-cta-fg)',
                }}>
                  <Sparkles size={11}/> Ask Luma
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass" style={{ padding: 18, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>No insights yet.</p>
          </div>
        )}

        {/* Plan */}
        <div className="glass" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div className="eyebrow">Today's plan</div>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 3 }}>
                <span className="num" style={{ color: 'var(--fg-primary)' }}>
                  {data.plan_today.filter((m: any) => m.logged).length}
                </span>/<span className="num">{data.plan_today.length}</span>
              </div>
            </div>
          </div>
          {data.plan_today.length === 0 ? (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 13, margin: 0 }}>No plan — generate in Plan tab.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.plan_today.map((m: TodayData['plan_today'][number]) => (
                <PlanRow
                  key={m.id}
                  meal={m}
                  onLog={() => logPlannedMealMutation.mutate(m)}
                  isLogging={loggingMealId === m.id && logPlannedMealMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>

        <RecentMealsCard meals={data.recent_meals ?? []} compact />
      </div>

    </TodayShell>
  )
}

function TodayShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}

function RingLegend({ color, label, value, pct, invert }: {
  color: string; label: string; value: string; pct: number; invert?: boolean
}) {
  const good = invert ? pct <= 110 : pct >= 90 && pct <= 120
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, boxShadow: '0 0 8px rgba(255,255,255,0.14)', flexShrink: 0,
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{label}</div>
        <div className="num" style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{value}</div>
      </div>
      <span className="num" style={{
        fontSize: 13, fontWeight: 500,
        color: good ? 'var(--good)' : 'var(--warn)',
      }}>{pct}%</span>
    </div>
  )
}

const SLOT_COLORS: Record<string, string> = {
  breakfast: 'var(--sun-400)',
  lunch: 'var(--sky-400)',
  snack: 'var(--good)',
  dinner: 'var(--aurora-violet)',
}

function SlotIcon({ slot }: { slot: string }) {
  if (slot === 'breakfast') return <Sunrise size={16} strokeWidth={1.5} />
  if (slot === 'lunch') return <Fish size={16} strokeWidth={1.5} />
  if (slot === 'snack') return <Apple size={16} strokeWidth={1.5} />
  return <Leaf size={16} strokeWidth={1.5} />
}

function PlanRow({
  meal,
  onLog,
  isLogging,
}: {
  meal: TodayData['plan_today'][number]
  onLog: () => void
  isLogging?: boolean
}) {
  const color = SLOT_COLORS[meal.slot] || 'var(--fg-quiet)'
  return (
    <div className="glass-inset" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 36, height: 36, borderRadius: 11,
        background: 'var(--glass-1)',
        border: `1px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color, flexShrink: 0,
      }}>
        <SlotIcon slot={meal.slot} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--fg-quiet)',
          fontFamily: 'var(--font-mono)',
        }}>{meal.slot}</div>
        <div style={{ fontSize: 14, color: 'var(--fg-primary)', marginTop: 2 }}>
          {meal.custom_name || meal.notes || 'Planned meal'}
        </div>
      </div>
      {meal.logged ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, color: 'var(--good)',
          padding: '4px 10px',
          background: 'rgba(52,211,153,0.12)',
          border: '1px solid rgba(52,211,153,0.25)',
          borderRadius: 999,
        }}>
          <Check size={11} strokeWidth={2.5}/> Logged
        </span>
      ) : (
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 10px', fontSize: 11 }}
          onClick={onLog}
          disabled={!!isLogging}
        >
          <Plus size={11} strokeWidth={2}/> {isLogging ? 'Logging…' : 'Log'}
        </button>
      )}
    </div>
  )
}

function BioTile({ icon, label, value, unit, color }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; color: string
}) {
  return (
    <div className="glass-inset" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function RecentMealsCard({
  meals,
  compact,
}: {
  meals?: Array<{
    id: string
    ts: string
    slot: string
    source: string
    item_count: number
    calories: number
    headline: string
  }>
  compact?: boolean
}) {
  const safeMeals = Array.isArray(meals) ? meals : []

  return (
    <div className="glass" style={{ padding: compact ? 18 : 24, marginTop: compact ? 14 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Recent meals</div>
          <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
            Latest meal logs from today.
          </div>
        </div>
      </div>

      {safeMeals.length === 0 ? (
        <p style={{ color: 'var(--fg-quiet)', fontSize: compact ? 12 : 13, margin: 0 }}>
          No meals logged yet today.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {safeMeals.map((meal) => (
            <div key={meal.id} className="glass-inset" style={{ padding: compact ? '10px 12px' : '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: compact ? 13 : 14, color: 'var(--fg-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {meal.headline}
                </div>
                <div style={{ marginTop: 3, fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                  {meal.slot} · {meal.source} · {meal.item_count} items
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>
                  {Math.round(meal.calories)} kcal
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--fg-quiet)' }}>
                  {formatMealTime(meal.ts)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatMealTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function NutritionCalculatorCard({
  adherence,
  selectedFoodId,
  servingG,
  onFoodChange,
  onServingChange,
  onAdd,
  isAdding,
  compact,
}: {
  adherence: TodayData['adherence_yesterday']
  selectedFoodId: string
  servingG: string
  onFoodChange: (foodId: string) => void
  onServingChange: (grams: string) => void
  onAdd: () => void
  isAdding?: boolean
  compact?: boolean
}) {
  const food = QUICK_FOODS.find((f) => f.id === selectedFoodId) ?? QUICK_FOODS[0]
  const grams = Math.max(1, Number(servingG) || 0)
  const factor = grams / 100

  const addCalories = round1(food.caloriesPer100g * factor)
  const addSatFat = round1(food.satFatPer100g * factor)
  const addSolFiber = round1(food.solubleFiberPer100g * factor)

  const calTarget = adherence.calories.target ?? 0
  const satTarget = adherence.sat_fat_g.target ?? 0
  const solTarget = adherence.soluble_fiber_g.target ?? 0

  const calLogged = adherence.calories.logged ?? 0
  const satLogged = adherence.sat_fat_g.logged ?? 0
  const solLogged = adherence.soluble_fiber_g.logged ?? 0

  const calRemain = round1(calTarget - calLogged)
  const satRemain = round1(satTarget - satLogged)
  const solRemain = round1(solTarget - solLogged)

  const calProjected = round1(calRemain - addCalories)
  const satProjected = round1(satRemain - addSatFat)
  const solProjected = round1(solRemain - addSolFiber)

  return (
    <div className="glass" style={{ padding: compact ? 18 : 24, marginTop: compact ? 14 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="eyebrow">Remaining today</div>
          <div style={{ fontSize: compact ? 12 : 13, color: 'var(--fg-tertiary)', marginTop: 4 }}>
            Quick estimate before you log.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
        <BudgetStat label="Calories" remaining={calRemain} projected={calProjected} unit="kcal" lowerIsBetter={false} />
        <BudgetStat label="Sat fat" remaining={satRemain} projected={satProjected} unit="g" lowerIsBetter />
        <BudgetStat label="Sol fiber" remaining={solRemain} projected={solProjected} unit="g" lowerIsBetter={false} />
      </div>

      <div className="glass-inset" style={{ padding: compact ? 10 : 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1.3fr 0.7fr', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Food
            </span>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: '8px',
                borderRadius: 10,
                border: '1px solid var(--glass-edge)',
                background: 'var(--glass-1)',
              }}
            >
              {QUICK_FOODS.map((item) => {
                const active = item.id === selectedFoodId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFoodChange(item.id)}
                    className="btn"
                    style={{
                      padding: '6px 10px',
                      fontSize: 12,
                      borderRadius: 999,
                      border: active ? '1px solid var(--sky-400)' : '1px solid var(--glass-edge)',
                      background: active ? 'rgba(56,189,248,0.16)' : 'var(--glass-2)',
                      color: active ? 'var(--fg-primary)' : 'var(--fg-secondary)',
                    }}
                  >
                    {item.name}
                  </button>
                )
              })}
            </div>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Serving (g)
            </span>
            <input
              type="number"
              min={1}
              value={servingG}
              onChange={(e) => onServingChange(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--glass-edge)',
                background: 'var(--glass-1)',
                color: 'var(--fg-primary)',
                fontSize: 13,
              }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
            Adds <span className="num">{addCalories}</span> kcal · <span className="num">{addSatFat}</span>g sat fat · <span className="num">{addSolFiber}</span>g soluble fiber
          </div>
          <button className="btn" onClick={onAdd} disabled={!!isAdding} style={{ padding: '8px 12px', fontSize: 12 }}>
            <Plus size={12} strokeWidth={2} /> {isAdding ? 'Adding…' : 'Add to log'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BudgetStat({
  label,
  remaining,
  projected,
  unit,
  lowerIsBetter,
}: {
  label: string
  remaining: number
  projected: number
  unit: string
  lowerIsBetter: boolean
}) {
  const bad = lowerIsBetter ? projected < 0 : projected < 0
  return (
    <div className="glass-inset" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="num" style={{ fontSize: 20, color: bad ? 'var(--bad)' : 'var(--fg-primary)' }}>
          {remaining}
        </span>
        <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>{unit}</span>
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: bad ? 'var(--bad)' : 'var(--fg-quiet)' }}>
        after add: <span className="num">{projected}</span> {unit}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {[200, 120, 120].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 20,
          background: 'var(--glass-1)',
          border: '1px solid var(--glass-edge)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}/>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }`}</style>
    </div>
  )
}

function ErrorCard() {
  return (
    <div style={{ padding: 24 }}>
      <div className="glass" style={{
        padding: 20,
        background: 'rgba(251,113,133,0.08)',
        borderColor: 'rgba(251,113,133,0.2)',
      }}>
        <p style={{ color: 'var(--bad)', fontSize: 14, margin: 0 }}>Failed to load today's data.</p>
      </div>
    </div>
  )
}
