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
}

type MealSlot = {
  id: string
  slot_date: string
  slot: string
  custom_name: string
  notes: string
  recipe_id: string | null
}

type PlanData = {
  id: string
  week_start: string
  status: string
  slots: MealSlot[]
}

let signedIn = true
let mockPlan = createMockPlan()
let measurementSystem: 'metric' | 'imperial' = 'metric'

const MOCK_SHOPPING_LIST = [
  { food_id: 'f-1', name: 'Rolled oats', aisle: 'Breakfast', quantity: 1, unit: 'bag' },
  { food_id: 'f-2', name: 'Blueberries', aisle: 'Produce', quantity: 2, unit: 'pints' },
  { food_id: 'f-3', name: 'Salmon fillet', aisle: 'Seafood', quantity: 3, unit: 'portions' },
  { food_id: 'f-4', name: 'Spinach', aisle: 'Produce', quantity: 2, unit: 'bags' },
  { food_id: 'f-5', name: 'Lentils', aisle: 'Pantry', quantity: 1, unit: 'kg' },
  { food_id: 'f-6', name: 'Walnuts', aisle: 'Nuts', quantity: 1, unit: 'jar' },
]

const SWAP_OPTIONS: Record<string, string[]> = {
  breakfast: ['Overnight oats + chia + kiwi', 'Egg-white scramble + rye toast'],
  lunch: ['Mediterranean tuna salad bowl', 'Quinoa + tofu + cucumber plate'],
  snack: ['Pear + almonds', 'Skyr + chia + cinnamon'],
  dinner: ['Baked cod + farro + broccoli', 'Turkey chili + mixed greens'],
}

function getWeekStartIso(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

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
  let idx = 0
  for (const date of days) {
    for (const slot of ['breakfast', 'lunch', 'snack', 'dinner']) {
      const options = meals[slot as keyof typeof meals]
      slots.push({
        id: `slot-${idx}`,
        slot_date: date,
        slot,
        custom_name: options[idx % options.length],
        notes: slot === 'dinner' ? 'Prioritize soluble fiber side.' : '',
        recipe_id: null,
      })
      idx += 1
    }
  }

  return {
    id: 'plan-mock-001',
    week_start: weekStart,
    status: 'active',
    slots,
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

function parseBody(init: RequestLike): any {
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

  if (method === 'GET' && pathname === '/auth/me') {
    requireAuth()
    return MOCK_USER
  }

  if (method === 'GET' && pathname === '/settings/measurements') {
    requireAuth()
    return { system: measurementSystem }
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

  if (method === 'POST' && /^\/plan\/slot\/[^/]+\/swap$/.test(pathname)) {
    requireAuth()
    const slotId = pathname.split('/')[3]
    const slot = mockPlan.slots.find((s) => s.id === slotId)
    if (!slot) throw new MockApiError(404, 'Slot not found')
    const options = SWAP_OPTIONS[slot.slot] ?? ['Updated meal']
    const next = options[Math.floor(Math.random() * options.length)]
    slot.custom_name = next
    return slot
  }

  if (method === 'POST' && /^\/plan\/[^/]+\/log-as-eaten\/[^/]+$/.test(pathname)) {
    requireAuth()
    return { detail: 'logged' }
  }

  if (method === 'POST' && /^\/plan\/[^/]+\/shopping-list\/export-reminders$/.test(pathname)) {
    requireAuth()
    return { message: 'Reminders exported to your mock inbox.' }
  }

  throw new MockApiError(404, `Mock route not implemented: ${method} ${path}`)
}
