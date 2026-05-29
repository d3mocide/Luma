import { TodayData } from './api'

type WeightPoint = {
  date: string
  last: number
}

export function createMockTodayData(): TodayData {
  const now = new Date()
  const isoDate = now.toISOString().slice(0, 10)

  return {
    date: isoDate,
    weight: {
      latest_kg: 84.3,
      trend_7d: -0.4,
      trend_28d: -1.8,
      target_kg: 79.5,
    },
    adherence_today: {
      calories: { logged: 1980, target: 2100, pct: 94 },
      sat_fat_g: { logged: 14, target: 18, pct: 78 },
      soluble_fiber_g: { logged: 11.8, target: 10, pct: 118 },
    },
    biometrics_latest: {
      hrv_ms: 49,
      rhr_bpm: 58,
      heart_rate_avg_bpm: 72,
      sleep_score: 84,
      sleep_duration_min: 438,
      steps: 8241,
      active_kcal: 487,
      bmr_kcal: 1820,
      exercise_min: 34,
      respiratory_rate_bpm: 16,
    },
    plan_today: [
      { id: 'mock-plan-breakfast', plan_id: 'mock-plan-id', slot: 'breakfast', custom_name: 'Greek yogurt + berries + flax', notes: null, recipe_id: null, logged: true },
      { id: 'mock-plan-lunch', plan_id: 'mock-plan-id', slot: 'lunch', custom_name: 'Lentil bowl with salmon', notes: null, recipe_id: null, logged: false },
      { id: 'mock-plan-snack', plan_id: 'mock-plan-id', slot: 'snack', custom_name: 'Apple + walnuts', notes: null, recipe_id: null, logged: false },
      { id: 'mock-plan-dinner', plan_id: 'mock-plan-id', slot: 'dinner', custom_name: 'Chickpea pasta + greens', notes: null, recipe_id: null, logged: false },
    ],
    recent_meals: [
      {
        id: 'mock-meal-1',
        ts: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
        slot: 'breakfast',
        source: 'voice',
        item_count: 3,
        calories: 438,
        headline: 'Steel cut oats with blueberries',
      },
    ],
    active_insight: {
      id: 'mock-insight-1',
      severity: 'gentle nudge',
      headline: 'Great fiber momentum this week. Keep saturated fat under 18g today to reinforce LDL progress.',
      cta: 'Ask Luma',
      thread_seed: 'Help me keep sat fat lower at dinner tonight.',
    },
  }
}

export function isTodaySparseData(data: TodayData): boolean {
  const noWeight = data.weight.latest_kg == null
  const noBio = Object.values(data.biometrics_latest).every((v) => v == null)
  const noPlan = data.plan_today.length === 0
  const noAdherence = [
    data.adherence_today.calories,
    data.adherence_today.sat_fat_g,
    data.adherence_today.soluble_fiber_g,
  ].every((m) => m.logged == null && m.target == null)

  return noWeight && noBio && noPlan && noAdherence
}

export function createMockWeightSeries(latest: number | null, points = 30): WeightPoint[] {
  if (latest == null) return []

  const base = latest + 1.4
  const start = new Date()
  start.setDate(start.getDate() - (points - 1))

  return Array.from({ length: points }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)

    const progress = i / Math.max(1, points - 1)
    const trend = base - progress * 1.4
    const microNoise = Math.sin(i * 0.7) * 0.18 + Math.cos(i * 0.34) * 0.08

    return {
      date: d.toISOString().slice(0, 10),
      last: Number((trend + microNoise).toFixed(1)),
    }
  })
}
