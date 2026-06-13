import { createMockTodayData } from './mock-data'

type RequestLike = RequestInit | undefined

export class MockApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const MOCK_USER = {
  id: 'a3c9f8a4-52f9-4dbf-a9ec-4c73713ca44e',
  email: 'operator@luma.local',
  display_name: 'Jules',
  role: 'operator',
  is_password_temp: false,
}

type MealSlot = {
  id: string
  slot_date: string
  slot: string
  custom_name: string
  notes: string
  recipe_id: string | null
  food_id: string | null
  nutrition: Record<string, number>
}

type PlanData = {
  id: string
  week_start: string
  status: string
  slots: MealSlot[]
  day_totals: Record<string, Record<string, number>>
}

let signedIn = true
let measurementSystem: 'metric' | 'imperial' = 'metric'
let aiPricingOverrides: Record<string, { input: number; output: number }> = {}

interface MockPref { kind: string; value: string }
const mockPreferences: MockPref[] = []

const waterLogs: number[] = [250, 250, 250]
let waterGoalMl = 2000
let waterGlassMl = 250
let waterBuddy = 'frog'

function waterSummary() {
  const total = waterLogs.reduce((sum, ml) => sum + ml, 0)
  return {
    total_ml: total,
    entries: waterLogs.length,
    goal_ml: waterGoalMl,
    glass_ml: waterGlassMl,
    goal_met: total >= waterGoalMl,
    buddy: waterBuddy,
  }
}

interface FavoriteItem {
  food_name: string
  brand: string | null
  quantity_g: number
  nutrients: Record<string, number>
}

interface Favorite {
  id: string
  name: string
  created_at: string
  updated_at: string
  items: (FavoriteItem & { id: string; sort_order: number })[]
}

const favorites: Favorite[] = []

const MOCK_SHOPPING_LIST = [
  { food_id: 'f-1', name: 'Rolled oats', brand: null, aisle: 'Breakfast', quantity: 1, unit: 'bag', purchased: false },
  { food_id: 'f-2', name: 'Blueberries', brand: null, aisle: 'Produce', quantity: 2, unit: 'pints', purchased: false },
  { food_id: 'f-3', name: 'Salmon fillet', brand: null, aisle: 'Seafood', quantity: 3, unit: 'portions', purchased: false },
  { food_id: 'f-4', name: 'Spinach', brand: null, aisle: 'Produce', quantity: 2, unit: 'bags', purchased: false },
  { food_id: 'f-5', name: 'Lentils', brand: null, aisle: 'Pantry', quantity: 1, unit: 'kg', purchased: false },
  { food_id: 'f-6', name: 'Walnuts', brand: null, aisle: 'Nuts', quantity: 1, unit: 'jar', purchased: false },
]

const MOCK_FOODS = [
  { id: 'fd-1', name: 'Steel-cut oats', brand: null, serving_size_g: 40, nutrients_per_100g: { calories: 375, protein_g: 13, fat_g: 7, saturated_fat_g: 1.2, carbohydrates_g: 67, fiber_g: 10, soluble_fiber_g: 4, sodium_mg: 2 } },
  { id: 'fd-2', name: 'Salmon fillet (cooked)', brand: null, serving_size_g: 150, nutrients_per_100g: { calories: 208, protein_g: 20, fat_g: 13, saturated_fat_g: 3.1, carbohydrates_g: 0, fiber_g: 0, soluble_fiber_g: 0, sodium_mg: 59 } },
  { id: 'fd-3', name: 'Green lentils (cooked)', brand: null, serving_size_g: 200, nutrients_per_100g: { calories: 116, protein_g: 9, fat_g: 0.4, saturated_fat_g: 0.1, carbohydrates_g: 20, fiber_g: 8, soluble_fiber_g: 3, sodium_mg: 2 } },
  { id: 'fd-4', name: 'Walnuts', brand: null, serving_size_g: 30, nutrients_per_100g: { calories: 654, protein_g: 15, fat_g: 65, saturated_fat_g: 6.1, carbohydrates_g: 14, fiber_g: 6.7, soluble_fiber_g: 2.5, sodium_mg: 2 } },
  { id: 'fd-5', name: 'Greek yogurt (non-fat)', brand: 'Fage', serving_size_g: 170, nutrients_per_100g: { calories: 59, protein_g: 10, fat_g: 0.4, saturated_fat_g: 0.1, carbohydrates_g: 3.6, fiber_g: 0, soluble_fiber_g: 0, sodium_mg: 36 } },
  { id: 'fd-6', name: 'Avocado', brand: null, serving_size_g: 100, nutrients_per_100g: { calories: 160, protein_g: 2, fat_g: 15, saturated_fat_g: 2.1, carbohydrates_g: 9, fiber_g: 6.7, soluble_fiber_g: 2, sodium_mg: 7 } },
  { id: 'fd-7', name: 'Chickpeas (cooked)', brand: null, serving_size_g: 150, nutrients_per_100g: { calories: 164, protein_g: 9, fat_g: 2.6, saturated_fat_g: 0.3, carbohydrates_g: 27, fiber_g: 7.6, soluble_fiber_g: 2.8, sodium_mg: 7 } },
  { id: 'fd-8', name: 'Blueberries', brand: null, serving_size_g: 100, nutrients_per_100g: { calories: 57, protein_g: 0.7, fat_g: 0.3, saturated_fat_g: 0, carbohydrates_g: 14, fiber_g: 2.4, soluble_fiber_g: 0.8, sodium_mg: 1 } },
  { id: 'fd-9', name: 'Whole-grain bread', brand: 'Dave\'s Killer Bread', serving_size_g: 45, nutrients_per_100g: { calories: 247, protein_g: 9, fat_g: 3.3, saturated_fat_g: 0.5, carbohydrates_g: 48, fiber_g: 5, soluble_fiber_g: 1.5, sodium_mg: 330 } },
  { id: 'fd-10', name: 'Spinach (raw)', brand: null, serving_size_g: 85, nutrients_per_100g: { calories: 23, protein_g: 2.9, fat_g: 0.4, saturated_fat_g: 0.1, carbohydrates_g: 3.6, fiber_g: 2.2, soluble_fiber_g: 0.9, sodium_mg: 79 } },
]


function getWeekStartIso(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

const MOCK_SLOT_NUTRITION: Record<string, Record<string, number>> = {
  breakfast: { calories: 380, protein_g: 18, fat_g: 9,  saturated_fat_g: 1.8, carbohydrates_g: 52, fiber_g: 7,   soluble_fiber_g: 4.5, sodium_mg: 120 },
  lunch:     { calories: 520, protein_g: 32, fat_g: 18, saturated_fat_g: 2.8, carbohydrates_g: 55, fiber_g: 10,  soluble_fiber_g: 4.0, sodium_mg: 380 },
  snack:     { calories: 210, protein_g: 6,  fat_g: 12, saturated_fat_g: 1.2, carbohydrates_g: 22, fiber_g: 3.5, soluble_fiber_g: 1.5, sodium_mg: 60  },
  dinner:    { calories: 580, protein_g: 38, fat_g: 20, saturated_fat_g: 3.5, carbohydrates_g: 60, fiber_g: 9,   soluble_fiber_g: 3.5, sodium_mg: 520 },
}

let mockPlan = createMockPlan()

function createMockPlan(): PlanData {
  const weekStart = getWeekStartIso(new Date())
  const start = new Date(weekStart)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const meals = {
    breakfast: ['Greek yogurt + berries + flax', 'Steel-cut oats + walnuts'],
    lunch: ['Lentil bowl + salmon', 'Chickpea salad + avocado'],
    snack: ['Apple + walnuts', 'Carrots + hummus'],
    dinner: ['Trout + quinoa + greens', 'Bean chili + arugula salad'],
  }

  const slots: MealSlot[] = []
  const day_totals: Record<string, Record<string, number>> = {}
  let idx = 0
  for (const date of days) {
    const dayNutr = { calories: 0, protein_g: 0, fat_g: 0, saturated_fat_g: 0, carbohydrates_g: 0, fiber_g: 0, soluble_fiber_g: 0, sodium_mg: 0 }
    for (const slotName of ['breakfast', 'lunch', 'snack', 'dinner']) {
      const options = meals[slotName as keyof typeof meals]
      const nutrition = MOCK_SLOT_NUTRITION[slotName]
      slots.push({
        id: `slot-${idx}`,
        slot_date: date,
        slot: slotName,
        custom_name: options[idx % options.length],
        notes: slotName === 'dinner' ? 'Prioritize soluble fiber side.' : '',
        recipe_id: null,
        food_id: null,
        nutrition,
      })
      for (const k of Object.keys(dayNutr) as (keyof typeof dayNutr)[]) {
        dayNutr[k] += nutrition[k] ?? 0
      }
      idx += 1
    }
    day_totals[date] = { ...dayNutr }
  }

  return {
    id: 'plan-mock-001',
    week_start: weekStart,
    status: 'active',
    slots,
    day_totals,
  }
}

function buildTrendSeries(metric: string, range: string) {
  const pointsByRange: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 52,
  }

  const points = pointsByRange[range] ?? 30
  const now = new Date()
  const stepDays = range === '1y' ? 7 : 1

  const config: Record<string, { base: number; slope: number; wobble: number }> = {
    weight_kg: { base: 86.2, slope: -0.03, wobble: 0.18 },
    hrv_ms: { base: 41, slope: 0.08, wobble: 2.5 },
    rhr_bpm: { base: 64, slope: -0.05, wobble: 1.8 },
    sleep_duration_min: { base: 410, slope: 0.6, wobble: 18 },
    active_kcal: { base: 450, slope: 0.9, wobble: 45 },
  }

  const c = config[metric] ?? { base: 100, slope: 0, wobble: 4 }

  return Array.from({ length: points }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - (points - 1 - i) * stepDays)
    const wave = Math.sin(i * 0.5) * c.wobble + Math.cos(i * 0.21) * c.wobble * 0.3
    const last = Number((c.base + i * c.slope + wave).toFixed(1))

    return {
      date: d.toISOString().slice(0, 10),
      avg: last,
      min: Number((last - Math.abs(wave) * 0.35).toFixed(1)),
      max: Number((last + Math.abs(wave) * 0.35).toFixed(1)),
      sum: last,
      last,
      sample_count: 1,
    }
  })
}

function getPathWithoutQuery(path: string): string {
  const [pathname] = path.split('?')
  return pathname
}

function getQueryParam(path: string, key: string): string | null {
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
  const params = new URLSearchParams(query)
  return params.get(key)
}

function parseBody(init: RequestLike): Record<string, unknown> {
  if (!init?.body || typeof init.body !== 'string') return {}
  try {
    return JSON.parse(init.body)
  } catch {
    return {}
  }
}

function requireAuth() {
  if (!signedIn) throw new MockApiError(401, 'Unauthorized')
}

export function isMockApiEnabled(): boolean {
  return import.meta.env.VITE_USE_MOCK_DATA === '1'
}

export async function handleMockApiRequest(path: string, init?: RequestInit): Promise<unknown> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const pathname = getPathWithoutQuery(path)

  if (method === 'GET' && pathname === '/auth/setup-status') return { setup_required: false }

  if (method === 'POST' && (pathname === '/auth/login' || pathname === '/auth/setup')) {
    const body = parseBody(init)
    signedIn = true
    if (body?.display_name && typeof body.display_name === 'string') {
      MOCK_USER.display_name = body.display_name
    }
    return MOCK_USER
  }

  if (method === 'POST' && pathname === '/auth/logout') {
    signedIn = false
    return { detail: 'logged out' }
  }

  if (method === 'POST' && pathname === '/auth/change-password') {
    requireAuth()
    const body = parseBody(init)
    if (!body?.new_password || (body.new_password as string).length < 8) {
      throw new MockApiError(422, 'New password must be at least 8 characters long.')
    }
    MOCK_USER.is_password_temp = false
    return { detail: 'Password changed successfully.' }
  }

  if (method === 'GET' && pathname === '/auth/me') {
    requireAuth()
    return MOCK_USER
  }

  if (method === 'PATCH' && pathname === '/auth/me') {
    requireAuth()
    const body = parseBody(init)
    const name = typeof body?.display_name === 'string' ? body.display_name.trim() : ''
    if (!name) {
      throw new MockApiError(422, 'Display name cannot be empty.')
    }
    if (name.length > 100) {
      throw new MockApiError(422, 'Display name must be 100 characters or fewer.')
    }
    MOCK_USER.display_name = name
    return MOCK_USER
  }

  if (method === 'GET' && pathname === '/settings/measurements') {
    requireAuth()
    return { system: measurementSystem }
  }

  if (method === 'GET' && pathname === '/settings/llm-metrics') {
    requireAuth()
    return {
      scope: 'redis',
      resets_on_restart: false,
      source: 'redis',
      totals: {
        attempts: 14,
        successes: 14,
        failures: 0,
        fallback_retries: 0,
      },
      last_success_at: new Date(Date.now() - 1000 * 60).toISOString(),
      last_failure_at: null,
      recent_events: [
        { ts: new Date(Date.now() - 1000 * 60 * 1).toISOString(), event: 'success', model: 'gemini-3.5-flash', provider: 'gemini', attempt: 'native - primary', elapsed_ms: 1944.9, total_tokens: 342 },
        { ts: new Date(Date.now() - 1000 * 60 * 3).toISOString(), event: 'success', model: 'gemini-3.1-flash-lite', provider: 'gemini', attempt: 'native - primary', elapsed_ms: 2751.1, total_tokens: 559 },
        { ts: new Date(Date.now() - 1000 * 60 * 5).toISOString(), event: 'success', model: 'claude-sonnet-4-5', provider: 'anthropic', attempt: 'native - primary', elapsed_ms: 3569.2, total_tokens: 266 },
        { ts: new Date(Date.now() - 1000 * 60 * 8).toISOString(), event: 'success', model: 'gemini-3.5-flash', provider: 'gemini', attempt: 'native - primary', elapsed_ms: 1811.6, total_tokens: 1542 },
        { ts: new Date(Date.now() - 1000 * 60 * 12).toISOString(), event: 'success', model: 'claude-sonnet-4-5', provider: 'anthropic', attempt: 'native - primary', elapsed_ms: 4316.7, total_tokens: 1795 },
        { ts: new Date(Date.now() - 1000 * 60 * 16).toISOString(), event: 'success', model: 'llama-3.1-8b-instruct', provider: 'local', attempt: 'native - primary', elapsed_ms: 950.4, total_tokens: 180 },
        { ts: new Date(Date.now() - 1000 * 60 * 20).toISOString(), event: 'success', model: 'llama-3.1-8b-instruct', provider: 'local', attempt: 'native - primary', elapsed_ms: 1102.1, total_tokens: 220 }
      ],
    }
  }

  if (method === 'GET' && pathname === '/settings/ai-config') {
    requireAuth()
    return {
      models: {
        meal_planner: { primary: 'anthropic/claude-sonnet-4-5', fallback: null },
        coach_agent: { primary: 'gemini/gemini-3.5-flash', fallback: null },
        food_extractor: { primary: 'gemini/gemini-3.5-flash', fallback: 'local/llama-3.1-8b-instruct' },
        vision_classifier: { primary: 'gemini/gemini-3.5-flash', fallback: null },
        insight_narrator: { primary: 'gemini/gemini-3.5-flash', fallback: null },
      },
      endpoints: {
        local_ai_api_base: 'http://localhost:11434/v1',
        whisper_url: 'http://whisper:9000',
      }
    }
  }

  if (method === 'PUT' && pathname === '/settings/measurements') {
    requireAuth()
    const body = parseBody(init)
    const requested = body?.system
    if (requested !== 'metric' && requested !== 'imperial') {
      throw new MockApiError(400, 'Invalid measurement system')
    }
    measurementSystem = requested
    return { system: measurementSystem }
  }

  if (method === 'GET' && pathname === '/settings/ai-pricing-overrides') {
    requireAuth()
    return aiPricingOverrides
  }

  if (method === 'PUT' && pathname === '/settings/ai-pricing-overrides') {
    requireAuth()
    const body = parseBody(init)
    aiPricingOverrides = (body as Record<string, { input: number; output: number }>) ?? {}
    return aiPricingOverrides
  }

  if (method === 'GET' && pathname === '/today') {
    requireAuth()
    return createMockTodayData()
  }

  if (method === 'GET' && pathname.startsWith('/trends/')) {
    requireAuth()
    const metric = pathname.replace('/trends/', '')
    const range = getQueryParam(path, 'range') ?? '30d'
    return {
      metric,
      range,
      series: buildTrendSeries(metric, range),
    }
  }

  if (method === 'GET' && pathname === '/plan/current') {
    requireAuth()
    return mockPlan
  }

  if (method === 'POST' && pathname === '/plan/generate') {
    requireAuth()
    mockPlan = createMockPlan()
    return mockPlan
  }

  if (method === 'GET' && /^\/plan\/[^/]+\/shopping-list$/.test(pathname)) {
    requireAuth()
    return { shopping_list: MOCK_SHOPPING_LIST }
  }

  if (method === 'GET' && pathname === '/foods/search') {
    requireAuth()
    const q = getQueryParam(path, 'q') ?? ''
    if (!q.trim()) return MOCK_FOODS.slice(0, 8)
    const lq = q.toLowerCase()
    return MOCK_FOODS.filter((f) => f.name.toLowerCase().includes(lq) || (f.brand ?? '').toLowerCase().includes(lq))
  }

  if (method === 'POST' && /^\/plan\/slot\/[^/]+\/replace$/.test(pathname)) {
    requireAuth()
    const slotId = pathname.split('/')[3]
    const slot = mockPlan.slots.find((s) => s.id === slotId)
    if (!slot) throw new MockApiError(404, 'Slot not found')
    const body = parseBody(init)
    const food = MOCK_FOODS.find((f) => f.id === body?.food_id)
    if (!food) throw new MockApiError(404, 'Food not found')
    const servingG = Number(body?.serving_g ?? 100)
    const factor = servingG / 100
    const nutrition: Record<string, number> = {}
    for (const [key, value] of Object.entries(food.nutrients_per_100g)) {
      nutrition[key] = Math.round((value ?? 0) * factor * 10) / 10
    }
    slot.food_id = food.id
    slot.custom_name = food.name
    slot.nutrition = nutrition
    slot.notes = `${servingG}g serving`
    // Recompute day totals
    const dateSlots = mockPlan.slots.filter((s) => s.slot_date === slot.slot_date)
    const newTotals = { calories: 0, protein_g: 0, fat_g: 0, saturated_fat_g: 0, carbohydrates_g: 0, fiber_g: 0, soluble_fiber_g: 0, sodium_mg: 0 }
    for (const ds of dateSlots) {
      for (const k of Object.keys(newTotals) as (keyof typeof newTotals)[]) {
        newTotals[k] += (ds.nutrition[k] ?? 0)
      }
    }
    mockPlan.day_totals[slot.slot_date] = { ...newTotals }
    return slot
  }

  if (method === 'PATCH' && /^\/plan\/[^/]+\/shopping-list\/[^/]+$/.test(pathname)) {
    requireAuth()
    const parts = pathname.split('/')
    const foodId = parts[4]
    const body = parseBody(init)
    const item = MOCK_SHOPPING_LIST.find((i) => i.food_id === foodId)
    const purchased = typeof body.purchased === 'boolean' ? body.purchased : item?.purchased ?? false
    if (item) item.purchased = purchased
    return { food_id: foodId, purchased }
  }

  if (method === 'POST' && /^\/plan\/[^/]+\/log-as-eaten\/[^/]+$/.test(pathname)) {
    requireAuth()
    return { detail: 'logged' }
  }

  if (method === 'POST' && /^\/plan\/[^/]+\/shopping-list\/export-reminders$/.test(pathname)) {
    requireAuth()
    return { message: 'Reminders exported to your mock inbox.' }
  }

  if (method === 'POST' && pathname === '/log/meal') {
    requireAuth()
    return { status: 'ok', meal_event_id: 'mock-meal-' + Math.random().toString(36).substr(2, 9) }
  }

  if (method === 'PATCH' && pathname.startsWith('/log/meal/')) {
    requireAuth()
    return { status: 'ok', message: 'Meal log updated successfully' }
  }

  if (method === 'POST' && pathname === '/log/meal/barcode') {
    requireAuth()
    const body = parseBody(init)
    const barcode = body?.barcode ?? '028400070566'
    const mockProducts: Record<string, object> = {
      '028400070566': { id: 'mock-barcode-1', name: 'Quaker Old Fashioned Oats', brand: 'Quaker', serving_size_g: 40, nutrients_per_100g: { calories: 375, protein_g: 12.5, fat_g: 7.5, saturated_fat_g: 1.5, carbohydrates_g: 67.5, fiber_g: 10.0, soluble_fiber_g: 5.0, sodium_mg: 0 } },
      '5411188110825': { id: 'mock-barcode-2', name: 'Alpro Soy Drink Original', brand: 'Alpro', serving_size_g: 250, nutrients_per_100g: { calories: 33, protein_g: 3.3, fat_g: 1.8, saturated_fat_g: 0.3, carbohydrates_g: 0.5, fiber_g: 0.5, soluble_fiber_g: 0.0, sodium_mg: 120 } },
    }
    const product = mockProducts[barcode as string]
    if (!product) throw new MockApiError(404, `Barcode ${barcode} not found`)
    return product
  }

  if (method === 'POST' && pathname === '/log/meal/text') {
    requireAuth()
    const body = parseBody(init)
    const text = (body?.text as string) ?? ''
    const isOats = text.toLowerCase().includes('oat') || text.toLowerCase().includes('flax')
    return {
      raw_input: text,
      confidence: 0.90,
      items: isOats ? [
        { name: 'Steel cut oats', quantity: 1, unit: 'cup cooked', estimated_weight_g: 234, nutrients: { calories: 166, protein_g: 5.9, carbohydrates_g: 28, fat_g: 3.6, fiber_g: 4, saturated_fat_g: 0.7, soluble_fiber_g: 2, sodium_mg: 9 } },
        { name: 'Blueberries', quantity: 0.5, unit: 'cup', estimated_weight_g: 74, nutrients: { calories: 42, protein_g: 0.5, carbohydrates_g: 11, fat_g: 0.2, fiber_g: 1.8, saturated_fat_g: 0, soluble_fiber_g: 0.8, sodium_mg: 1 } },
        { name: 'Ground flaxseeds', quantity: 1, unit: 'tbsp', estimated_weight_g: 10, nutrients: { calories: 55, protein_g: 1.9, carbohydrates_g: 3, fat_g: 4.3, fiber_g: 2.8, saturated_fat_g: 0.4, soluble_fiber_g: 1.1, sodium_mg: 3 } },
      ] : [
        { name: 'Grilled salmon fillet', quantity: 1, unit: 'fillet', estimated_weight_g: 150, nutrients: { calories: 280, protein_g: 30, carbohydrates_g: 0, fat_g: 15, fiber_g: 0, saturated_fat_g: 2.5, soluble_fiber_g: 0, sodium_mg: 85 } },
        { name: 'Olive oil', quantity: 2, unit: 'tbsp', estimated_weight_g: 27, nutrients: { calories: 239, protein_g: 0, carbohydrates_g: 0, fat_g: 27, fiber_g: 0, saturated_fat_g: 3.7, soluble_fiber_g: 0, sodium_mg: 0 } },
        { name: 'Steamed broccoli', quantity: 1, unit: 'cup', estimated_weight_g: 156, nutrients: { calories: 54, protein_g: 3.7, carbohydrates_g: 11, fat_g: 0.6, fiber_g: 5.1, saturated_fat_g: 0.1, soluble_fiber_g: 1.5, sodium_mg: 64 } },
      ],
      nutrition: isOats
        ? { calories: 263, protein_g: 8.3, carbohydrates_g: 42, fat_g: 8.1, fiber_g: 8.6, saturated_fat_g: 1.1, soluble_fiber_g: 3.9, sodium_mg: 13 }
        : { calories: 573, protein_g: 33.7, carbohydrates_g: 11, fat_g: 42.6, fiber_g: 5.1, saturated_fat_g: 6.3, soluble_fiber_g: 1.5, sodium_mg: 149 },
    }
  }

  if (method === 'POST' && pathname === '/log/meal/voice') {
    requireAuth()
    return {
      raw_input: 'a bowl of steel cut oats with blueberries and a black coffee',
      confidence: 0.92,
      items: [
        {
          name: 'Steel cut oats',
          quantity: 1,
          unit: 'cup cooked',
          estimated_weight_g: 234,
          nutrients: { calories: 166, protein_g: 5.9, carbohydrates_g: 28, fat_g: 3.6, fiber_g: 4, saturated_fat_g: 0.7, soluble_fiber_g: 2, sodium_mg: 9 },
        },
        {
          name: 'Blueberries',
          quantity: 0.5,
          unit: 'cup',
          estimated_weight_g: 74,
          nutrients: { calories: 42, protein_g: 0.5, carbohydrates_g: 11, fat_g: 0.2, fiber_g: 1.8, saturated_fat_g: 0, soluble_fiber_g: 0.8, sodium_mg: 1 },
        },
        {
          name: 'Black coffee',
          quantity: 1,
          unit: 'cup',
          estimated_weight_g: 240,
          nutrients: { calories: 2, protein_g: 0.3, carbohydrates_g: 0, fat_g: 0, fiber_g: 0, saturated_fat_g: 0, soluble_fiber_g: 0, sodium_mg: 5 },
        },
      ],
      nutrition: { calories: 210, protein_g: 6.7, carbohydrates_g: 39, fat_g: 3.8, fiber_g: 5.8, saturated_fat_g: 0.7, soluble_fiber_g: 2.8, sodium_mg: 15 },
    }
  }

  if (method === 'GET' && pathname === '/favorites') {
    requireAuth()
    return { favorites }
  }

  if (method === 'POST' && pathname === '/favorites') {
    requireAuth()
    const body = parseBody(init)
    const id = Math.random().toString(36).substr(2, 9)
    const now = new Date().toISOString()
    const name = typeof body.name === 'string' ? body.name : 'My favorite'
    const items = Array.isArray(body.items) ? body.items : []
    const newFavorite: Favorite = {
      id,
      name,
      created_at: now,
      updated_at: now,
      items: items.map((item: FavoriteItem, idx: number) => ({
        id: Math.random().toString(36).substr(2, 9),
        sort_order: idx,
        ...item,
      })),
    }
    favorites.push(newFavorite)
    return newFavorite
  }

  if (method === 'PATCH' && /^\/favorites\/[^/]+$/.test(pathname)) {
    requireAuth()
    const parts = pathname.split('/')
    const id = parts[2]
    const body = parseBody(init)
    const favorite = favorites.find((f) => f.id === id)
    if (!favorite) throw new MockApiError(404, 'Favorite not found')

    if (typeof body.name === 'string') favorite.name = body.name
    if (Array.isArray(body.items)) {
      favorite.items = body.items.map((item: FavoriteItem, idx: number) => ({
        id: Math.random().toString(36).substr(2, 9),
        sort_order: idx,
        ...item,
      }))
    }
    favorite.updated_at = new Date().toISOString()
    return favorite
  }

  if (method === 'DELETE' && /^\/favorites\/[^/]+$/.test(pathname)) {
    requireAuth()
    const parts = pathname.split('/')
    const id = parts[2]
    const index = favorites.findIndex((f) => f.id === id)
    if (index === -1) throw new MockApiError(404, 'Favorite not found')
    favorites.splice(index, 1)
    return { status: 'ok' }
  }

  if (method === 'GET' && pathname === '/water/today') {
    requireAuth()
    return waterSummary()
  }

  if (method === 'POST' && pathname === '/water/log') {
    requireAuth()
    const body = parseBody(init)
    const amount = typeof body?.amount_ml === 'number' ? body.amount_ml : waterGlassMl
    if (amount <= 0 || amount > 2000) throw new MockApiError(422, 'amount_ml must be between 1 and 2000')
    waterLogs.push(amount)
    return waterSummary()
  }

  if (method === 'GET' && pathname === '/water/settings') {
    requireAuth()
    return { buddy: waterBuddy, goal_ml: waterGoalMl, glass_ml: waterGlassMl }
  }

  if (method === 'DELETE' && pathname === '/water/last') {
    requireAuth()
    waterLogs.pop()
    return waterSummary()
  }

  if (method === 'PUT' && pathname === '/water/settings') {
    requireAuth()
    const body = parseBody(init)
    if (typeof body?.buddy === 'string') {
      if (!['frog', 'cat', 'dog', 'axolotl'].includes(body.buddy)) {
        throw new MockApiError(422, 'Unknown buddy')
      }
      waterBuddy = body.buddy
    }
    if (typeof body?.goal_ml === 'number') {
      if (body.goal_ml < 250 || body.goal_ml > 10000) throw new MockApiError(422, 'goal_ml out of range')
      waterGoalMl = body.goal_ml
    }
    if (typeof body?.glass_ml === 'number') {
      if (body.glass_ml < 50 || body.glass_ml > 1000) throw new MockApiError(422, 'glass_ml out of range')
      waterGlassMl = body.glass_ml
    }
    return { buddy: waterBuddy, goal_ml: waterGoalMl, glass_ml: waterGlassMl }
  }

  if (method === 'GET' && pathname === '/preferences') {
    requireAuth()
    return [...mockPreferences]
  }

  if (method === 'POST' && pathname === '/preferences') {
    requireAuth()
    const body = parseBody(init)
    if (typeof body?.kind !== 'string' || typeof body?.value !== 'string') {
      throw new MockApiError(422, 'kind and value required')
    }
    const exists = mockPreferences.some(p => p.kind === body.kind && p.value === body.value)
    if (!exists) mockPreferences.push({ kind: body.kind, value: body.value })
    return { kind: body.kind, value: body.value }
  }

  if (method === 'DELETE' && /^\/preferences\/[^/]+\/.+$/.test(pathname)) {
    requireAuth()
    const parts = pathname.split('/')
    const kind = parts[2]
    const value = parts.slice(3).join('/')
    const idx = mockPreferences.findIndex(p => p.kind === kind && p.value === value)
    if (idx !== -1) mockPreferences.splice(idx, 1)
    return { detail: 'deleted' }
  }

  throw new MockApiError(404, `Mock route not implemented: ${method} ${path}`)
}
