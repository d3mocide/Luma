import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Search, Camera, Trash2, Heart, Check, Edit2, Star, AlertTriangle, Ban } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { api, TodayData } from '../../lib/api'
import { getCurrentSlot } from '../../lib/format'
import {
  type PortionUnit, type HouseholdMeasure, PORTION_UNITS, PORTION_UNIT_LABELS, PRESETS_BY_UNIT,
  unitToGrams, densityForFood, defaultQtyForUnit,
} from '../../lib/portions'
import type { Favorite } from '../log-sheet/types'


const CALC_SCANNER_ID = 'calc-barcode-scanner'
const FOOD_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
]

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function gramsForUnit(food: FoodResult, unit: string, qty: number): number {
  if (unit.startsWith('hm:')) {
    const m = food.household_measures?.[Number(unit.slice(3))]
    return m ? qty * m.grams : qty
  }
  return unitToGrams(qty, unit as PortionUnit, {
    density: densityForFood(food.name),
    servingSizeG: food.serving_size_g || undefined,
  })
}

type FoodResult = {
  id: string
  name: string
  brand: string | null
  serving_size_g: number | null
  nutrients_per_100g: Record<string, number>
  source?: string
  household_measures?: HouseholdMeasure[]
  flags?: string[]
}

export type FoodAddPayload = {
  name: string
  serving_g: number
  nutrition: Record<string, number>
}

function BudgetStat({
  label,
  unit,
  target,
  logged,
  add,
  showProjected,
  compact,
  style,
  color,
  isMinTarget,
}: {
  label: string
  unit: string
  target: number
  logged: number
  add: number
  showProjected: boolean
  compact?: boolean
  style?: React.CSSProperties
  color: string
  isMinTarget?: boolean
}) {
  const noTarget = target <= 0
  const remaining = round1(target - logged)
  const projected = round1(target - logged - add)
  // The value the user reads: their projected headroom once the in-progress
  // food lands, falling back to the at-rest remaining when nothing is staged.
  const shown = showProjected ? projected : remaining

  const usedNow = noTarget ? 0 : Math.min(Math.max(logged / target, 0), 1)
  const usedNext = noTarget ? 0 : Math.min(Math.max((logged + add) / target, 0), 1)
  const pendingFrom = Math.min(usedNow, usedNext)
  const pendingTo = Math.max(usedNow, usedNext)

  // Floors (protein, fiber) and ceilings (calories, sat fat, sodium) are opposite
  // intents — a floor you fill up, a ceiling you spend down — so they read
  // differently even at rest. A negative ceiling is "over"; a non-positive floor
  // is "goal met".
  const over = !isMinTarget && shown < 0
  const met = isMinTarget && shown <= 0
  const display = noTarget ? 0 : isMinTarget ? Math.max(0, shown) : Math.abs(shown)
  const state = noTarget
    ? (compact ? 'no target' : 'no target set')
    : isMinTarget
      ? (met ? 'goal met' : 'to go')
      : (over ? 'over' : 'left')
  const valueColor = noTarget ? 'var(--fg-quiet)' : over ? 'var(--bad)' : met ? 'var(--good)' : color
  const fillColor = over ? 'var(--bad)' : met ? 'var(--good)' : color
  // The staged-food segment turns rose when it tips a ceiling past its limit.
  const pendingColor = !isMinTarget && logged + add > target ? 'var(--bad)' : color

  return (
    <div className="glass-inset budget-stat" style={{ padding: compact ? '10px 11px' : '11px 12px', textAlign: 'left', display: 'grid', gap: compact ? 7 : 8, minWidth: 0, ...style }}>
      <div className="budget-stat-label" style={{ fontSize: compact ? 10 : 11.5, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2px 8px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span className="num budget-stat-num" style={{ fontSize: compact ? 20 : 22, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em', color: valueColor }}>
            {noTarget ? '—' : display}
          </span>
          {!noTarget && <span style={{ fontSize: compact ? 11 : 12, color: 'var(--fg-quiet)' }}>{unit}</span>}
        </div>
        <span className="budget-stat-state" style={{ fontSize: compact ? 9 : 10.5, color: noTarget ? 'var(--fg-quiet)' : over ? 'var(--bad)' : met ? 'var(--good)' : 'var(--fg-quiet)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {state}
        </span>
      </div>
      {!noTarget && (
        <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${usedNow * 100}%`, background: fillColor, opacity: 0.5 }} />
          {showProjected && pendingTo > pendingFrom && (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pendingFrom * 100}%`, width: `${(pendingTo - pendingFrom) * 100}%`, background: pendingColor, opacity: 0.92 }} />
          )}
        </div>
      )}
    </div>
  )
}

type MealBuilderItem = {
  id: string
  name: string
  brand: string | null
  serving_g: number
  nutrition: Record<string, number>
}

export function NutritionCalculatorCard({
  adherence,
  compact,
}: {
  adherence: TodayData['adherence_today']
  compact?: boolean
}) {
  const queryClient = useQueryClient()
  const { data: favoritesData } = useQuery<{ favorites: Favorite[] }>({
    queryKey: ['favorites', 'frequency'],
    queryFn: () => api.get('/favorites?sort=frequency'),
    staleTime: 30_000,
  })
  const favorites = favoritesData?.favorites ?? []

  const [budgetMode, setBudgetMode] = useState<'search' | 'favorite' | 'scan'>('search')
  const [isFavOpen, setIsFavOpen] = useState(false)
  const favDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (favDropdownRef.current && !favDropdownRef.current.contains(event.target as Node)) {
        setIsFavOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [mealItems, setMealItems] = useState<MealBuilderItem[]>([])
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemGrams, setEditingItemGrams] = useState<string>('')
  const [mealName, setMealName] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>(() => getCurrentSlot())
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingQty, setServingQty] = useState('150')
  const [servingUnit, setServingUnit] = useState<string>('g')
  const autoUnitRef = useRef(true)
  const isScanning = budgetMode === 'scan'
  const [barcodeError, setBarcodeError] = useState('')
  const handleSelectRef = useRef<(food: FoodResult) => void>(() => {})

  const handleSelectFavorite = (favId: string) => {
    const fav = favorites.find((f) => f.id === favId)
    if (!fav) return
    const newItems: MealBuilderItem[] = fav.items.map((item) => ({
      id: Math.random().toString(),
      name: item.food_name,
      brand: item.brand,
      serving_g: item.quantity_g,
      nutrition: item.nutrients,
    }))
    setMealItems((prev) => [...prev, ...newItems])
    setMealName((prev) => (prev.trim() ? prev : fav.name))
    const selectEl = document.getElementById('budget-fav-select') as HTMLSelectElement | null
    if (selectEl) selectEl.value = ''
  }


  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (budgetMode !== 'scan') return
    const scanner = new Html5Qrcode(CALC_SCANNER_ID, { formatsToSupport: FOOD_FORMATS, verbose: false })
    let fired = false
    let startResolved = false
    let stopRequested = false

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 130 } },
        async (code: string) => {
          if (fired) return
          fired = true
          setBarcodeError('')
          try {
            const food = await api.post<Record<string, unknown>>('/log/meal/barcode', { barcode: code })
            handleSelectRef.current({
              id: food.id as string,
              name: food.name as string,
              brand: (food.brand as string | null) ?? null,
              serving_size_g: (food.serving_size_g as number | null) ?? null,
              nutrients_per_100g: food.nutrients_per_100g as Record<string, number>,
              source: food.source as string | undefined,
              household_measures: food.household_measures as HouseholdMeasure[] | undefined,
            })
            setBudgetMode('search')
          } catch {
            setBarcodeError('Product not found')
            setBudgetMode('search')
          }
        },
        () => {},
      )
      .then(() => {
        startResolved = true
        if (stopRequested) scanner.stop().catch(() => {})
      })
      .catch(() => setBudgetMode('search'))

    return () => {
      stopRequested = true
      if (startResolved) scanner.stop().catch(() => {})
    }
  }, [budgetMode])

  const { data: results = [], isFetching } = useQuery<FoodResult[]>({
    queryKey: ['foods', 'search', debouncedQuery],
    queryFn: () => api.get(`/foods/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 2 && !selectedFood,
    staleTime: 60_000,
  })

  const pendingMeasures = selectedFood?.household_measures ?? []
  const pendingPresets = selectedFood
    ? (servingUnit.startsWith('hm:') ? [0.5, 1, 2, 3] : PRESETS_BY_UNIT[servingUnit as PortionUnit])
    : [25, 50, 75, 100, 150]

  const qtyNum = parseFloat(servingQty) || 0
  const grams = selectedFood ? Math.max(1, Math.round(gramsForUnit(selectedFood, servingUnit, qtyNum))) : 150
  const factor = grams / 100
  const n = selectedFood?.nutrients_per_100g ?? {}

  const currentCalories  = selectedFood ? round1((n.calories         ?? 0) * factor) : 0
  const currentSatFat    = selectedFood ? round1((n.saturated_fat_g   ?? 0) * factor) : 0
  const currentSolFiber  = selectedFood ? round1((n.soluble_fiber_g   ?? 0) * factor) : 0
  const currentSodium    = selectedFood ? round1((n.sodium_mg         ?? 0) * factor) : 0
  const currentProtein   = selectedFood ? round1((n.protein_g         ?? 0) * factor) : 0

  const mealCalories = mealItems.reduce((sum, item) => sum + (item.nutrition.calories ?? 0), 0)
  const mealSatFat = mealItems.reduce((sum, item) => sum + (item.nutrition.saturated_fat_g ?? 0), 0)
  const mealSolFiber = mealItems.reduce((sum, item) => sum + (item.nutrition.soluble_fiber_g ?? 0), 0)
  const mealSodium = mealItems.reduce((sum, item) => sum + (item.nutrition.sodium_mg ?? 0), 0)
  const mealProtein = mealItems.reduce((sum, item) => sum + (item.nutrition.protein_g ?? 0), 0)

  const addCalories = round1(mealCalories + currentCalories)
  const addSatFat = round1(mealSatFat + currentSatFat)
  const addSolFiber = round1(mealSolFiber + currentSolFiber)
  const addSodium = round1(mealSodium + currentSodium)
  const addProtein = round1(mealProtein + currentProtein)

  const calTarget  = adherence.calories.target ?? 0
  const calLogged  = adherence.calories.logged ?? 0
  const calProjected = round1(calTarget - calLogged - addCalories)

  const satTarget  = adherence.sat_fat_g.target ?? 0
  const satLogged  = adherence.sat_fat_g.logged ?? 0
  const satProjected = round1(satTarget - satLogged - addSatFat)

  const solTarget  = adherence.soluble_fiber_g.target ?? 0
  const solLogged  = adherence.soluble_fiber_g.logged ?? 0

  const sodiumTarget  = adherence.sodium_mg?.target ?? 0
  const sodiumLogged  = adherence.sodium_mg?.logged ?? 0
  const sodiumProjected = round1(sodiumTarget - sodiumLogged - addSodium)

  const proteinTarget  = adherence.protein_g?.target ?? 0
  const proteinLogged  = adherence.protein_g?.logged ?? 0

  const hasItemsOrFood = selectedFood !== null || mealItems.length > 0
  const showResults = !selectedFood && debouncedQuery.length >= 2
  const favMatches = showResults
    ? favorites.filter((f) => f.name.toLowerCase().includes(debouncedQuery.trim().toLowerCase())).slice(0, 4)
    : []

  const pickFavoriteFromSearch = (favId: string) => {
    handleSelectFavorite(favId)
    setQuery('')
    setDebouncedQuery('')
  }

  type FitSignal = 'fits' | 'tight' | 'over'
  let fitSignal: FitSignal | null = null
  if (hasItemsOrFood && calTarget > 0) {
    if (calProjected < 0 || (satTarget > 0 && satProjected < 0) || (sodiumTarget > 0 && sodiumProjected < 0)) {
      fitSignal = 'over'
    } else if (calProjected < calTarget * 0.08 || (satTarget > 0 && satProjected < satTarget * 0.08) || (sodiumTarget > 0 && sodiumProjected < sodiumTarget * 0.08)) {
      fitSignal = 'tight'
    } else {
      fitSignal = 'fits'
    }
  }

  const fitColor = fitSignal === 'fits' ? 'var(--good)' : fitSignal === 'tight' ? 'var(--sun-400)' : 'var(--bad)'
  const fitBg = fitSignal === 'fits' ? 'rgba(52,211,153,0.10)' : fitSignal === 'tight' ? 'rgba(251,191,36,0.10)' : 'rgba(251,113,133,0.10)'
  const fitBorder = fitSignal === 'fits' ? 'rgba(52,211,153,0.28)' : fitSignal === 'tight' ? 'rgba(251,191,36,0.30)' : 'rgba(251,113,133,0.30)'
  const fitLabel = fitSignal === 'fits' ? 'Fits your budget' : fitSignal === 'tight' ? 'Tight — close to your limit' : 'Exceeds your budget'
  const FitIcon = fitSignal === 'fits' ? Check : fitSignal === 'tight' ? AlertTriangle : Ban

  const handleSelect = (food: FoodResult) => {
    setSelectedFood(food)
    setQuery(food.name)
    autoUnitRef.current = true
    const hasMeasures = (food.household_measures?.length ?? 0) > 0
    setServingUnit(hasMeasures ? 'hm:0' : 'g')
    setServingQty(hasMeasures ? '1' : String(Math.round(food.serving_size_g || 100)))

    if (food.source === 'usda' && !hasMeasures && food.id) {
      api.post<FoodResult>(`/foods/${food.id}/enrich`, {})
        .then((enriched) => {
          setSelectedFood((cur) => {
            if (cur && cur.id === food.id) {
              const enrichedMeasures = (enriched.household_measures as HouseholdMeasure[]) || []
              return { ...cur, household_measures: enrichedMeasures }
            }
            return cur
          })
          if (autoUnitRef.current && (enriched.household_measures?.length ?? 0) > 0) {
            setServingUnit('hm:0')
            setServingQty('1')
          }
        })
        .catch(() => { /* keep generic */ })
    }
  }
  useEffect(() => { handleSelectRef.current = handleSelect })

  const handleClear = () => {
    setSelectedFood(null)
    setQuery('')
    setDebouncedQuery('')
    setServingQty('150')
    setServingUnit('g')
  }

  const changeUnit = (unit: string) => {
    autoUnitRef.current = false
    setServingUnit(unit)
    const qty = unit.startsWith('hm:') ? 1 : defaultQtyForUnit(unit as PortionUnit, selectedFood?.serving_size_g || undefined)
    setServingQty(String(qty))
  }

  const handleAdd = () => {
    if (!selectedFood) return
    const nutrition: Record<string, number> = {}
    for (const [k, v] of Object.entries(selectedFood.nutrients_per_100g)) {
      if (typeof v === 'number') nutrition[k] = round1(v * factor)
    }
    const newItem: MealBuilderItem = {
      id: Math.random().toString(),
      name: selectedFood.name,
      brand: selectedFood.brand,
      serving_g: grams,
      nutrition,
    }
    setMealItems((prev) => [...prev, newItem])
    setSelectedFood(null)
    setQuery('')
    setDebouncedQuery('')
    setServingQty('150')
    setServingUnit('g')
  }

  const handleRemoveMealItem = (index: number) => {
    const itemToRemove = mealItems[index]
    if (itemToRemove && editingItemId === itemToRemove.id) {
      setEditingItemId(null)
    }
    setMealItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleStartEditItem = (item: MealBuilderItem) => {
    setEditingItemId(item.id)
    setEditingItemGrams(String(item.serving_g))
  }

  const handleSaveEditedItem = () => {
    const parsed = Math.round(parseFloat(editingItemGrams)) || 0
    if (parsed <= 0) return

    setMealItems((prev) =>
      prev.map((item) => {
        if (item.id === editingItemId) {
          const ratio = parsed / item.serving_g
          const nutrition: Record<string, number> = {}
          for (const [k, v] of Object.entries(item.nutrition)) {
            nutrition[k] = round1(v * ratio)
          }
          return {
            ...item,
            serving_g: parsed,
            nutrition,
          }
        }
        return item
      })
    )
    setEditingItemId(null)
  }

  const logMealMutation = useMutation({
    mutationFn: (payload: {
      slot: string
      items: Array<{
        name: string
        brand: string | null
        quantity: number
        unit: string
        nutrients: Record<string, number>
      }>
      nutrition: Record<string, number>
      raw_input?: string
    }) =>
      api.post('/log/meal', {
        slot: payload.slot,
        source: 'manual',
        items: payload.items,
        nutrition: payload.nutrition,
        raw_input: payload.raw_input || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['today'] })
      await queryClient.invalidateQueries({ queryKey: ['meals'] })
      setMealItems([])
      setMealName('')
      setErrorMessage('')
      setSuccessMessage('Meal logged successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Failed to log meal.')
      setTimeout(() => setErrorMessage(''), 4000)
    },
  })

  const saveFavoriteMutation = useMutation({
    mutationFn: (payload: { name: string; items: MealBuilderItem[] }) =>
      api.post('/favorites', {
        name: payload.name,
        items: payload.items.map((item) => ({
          food_name: item.name,
          brand: item.brand || null,
          quantity_g: item.serving_g,
          nutrients: item.nutrition,
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setErrorMessage('')
      setSuccessMessage('Saved to favorites')
      setTimeout(() => setSuccessMessage(''), 3000)
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Failed to save favorite.')
      setTimeout(() => setErrorMessage(''), 4000)
    },
  })

  const handleLogMeal = () => {
    if (mealItems.length === 0) return
    const items = mealItems.map((item) => ({
      name: item.name,
      brand: item.brand,
      quantity: item.serving_g,
      unit: 'g',
      nutrients: item.nutrition,
    }))

    const combinedNutrition: Record<string, number> = {}
    mealItems.forEach((item) => {
      for (const [k, v] of Object.entries(item.nutrition)) {
        if (typeof v === 'number') {
          combinedNutrition[k] = round1((combinedNutrition[k] ?? 0) + v)
        }
      }
    })

    const rawInput = mealName.trim() || mealItems.map((item) => item.name).join(', ')

    logMealMutation.mutate({
      slot: selectedSlot,
      items,
      nutrition: combinedNutrition,
      raw_input: rawInput,
    })
  }

  const handleSaveFavorite = () => {
    if (mealItems.length === 0) return
    const name = mealName.trim() || mealItems.map((item) => item.name).join(' & ')
    saveFavoriteMutation.mutate({
      name,
      items: mealItems,
    })
  }

  return (
    <div className="glass" style={{
      padding: compact ? 12 : 24,
      marginTop: compact ? 14 : 0,
      marginBottom: compact ? 14 : 0,
      position: 'relative',
      zIndex: 5,
      width: '100%',
      maxWidth: '100%',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div className="eyebrow">Budget check</div>
      </div>

      <div style={{ display: 'grid', gap: compact ? 8 : 10, marginBottom: 12 }}>
        {/* Primary row — calories + sodium, mirroring the activity rings */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: compact ? 8 : 10 }}>
          <BudgetStat label="Calories" unit="kcal" target={calTarget} logged={calLogged} add={addCalories} showProjected={hasItemsOrFood} compact={compact} color="var(--sky-400)" />
          <BudgetStat label="Sodium" unit="mg" target={sodiumTarget} logged={sodiumLogged} add={addSodium} showProjected={hasItemsOrFood} compact={compact} color="#fb923c" />
        </div>
        {/* Secondary row — sat fat, soluble fiber, protein */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: compact ? 8 : 10 }}>
          <BudgetStat label="Sat fat"   unit="g" target={satTarget} logged={satLogged} add={addSatFat} showProjected={hasItemsOrFood} compact={compact} color="var(--sun-400)" />
          <BudgetStat label="Sol fiber" unit="g" target={solTarget} logged={solLogged} add={addSolFiber} showProjected={hasItemsOrFood} compact={compact} color="var(--good)" isMinTarget />
          <BudgetStat label="Protein"  unit="g"    target={proteinTarget} logged={proteinLogged} add={addProtein} showProjected={hasItemsOrFood} compact={compact} color="var(--aurora-violet)" isMinTarget />
        </div>
      </div>

      {/* Fit verdict — the decision the user opened the calculator to make */}
      {fitSignal && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 10, marginBottom: 12,
          background: fitBg, border: `1px solid ${fitBorder}`, color: fitColor,
          fontSize: 13, fontWeight: 500,
        }}>
          <FitIcon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span>{fitLabel}</span>
        </div>
      )}

      <div className="glass-inset" style={{ padding: compact ? 8 : 12, display: 'grid', gap: 10, minWidth: 0, width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr auto', gap: compact ? 8 : 12, alignItems: 'start', minWidth: 0, width: '100%' }}>

          {/* Food search */}
          <div style={{ display: 'grid', gap: 8, minWidth: 0, width: '100%' }}>
            
            {/* Mode segmented control (Full width) */}
            <div style={{ display: 'flex', padding: 2, background: 'var(--glass-1)', borderRadius: 10, border: '1px solid var(--glass-edge)', width: '100%', boxSizing: 'border-box' }}>
              <button
                type="button"
                onClick={() => setBudgetMode('search')}
                style={{
                  flex: 1,
                  padding: compact ? '7px 0' : '9px 0',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: budgetMode === 'search' ? 'var(--glass-3)' : 'transparent',
                  color: budgetMode === 'search' ? 'var(--sky-300)' : 'var(--fg-quiet)',
                  transition: 'all 150ms',
                }}
              >
                <Search size={13} />
                <span>Search</span>
              </button>
              <button
                type="button"
                onClick={() => setBudgetMode('favorite')}
                style={{
                  flex: 1,
                  padding: compact ? '7px 0' : '9px 0',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: budgetMode === 'favorite' ? 'var(--glass-3)' : 'transparent',
                  color: budgetMode === 'favorite' ? 'var(--sun-300)' : 'var(--fg-quiet)',
                  transition: 'all 150ms',
                }}
              >
                <Star size={13} />
                <span>Favorites</span>
              </button>
              <button
                type="button"
                onClick={() => { setBarcodeError(''); setBudgetMode('scan') }}
                style={{
                  flex: 1,
                  padding: compact ? '7px 0' : '9px 0',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: budgetMode === 'scan' ? 'var(--glass-3)' : 'transparent',
                  color: budgetMode === 'scan' ? 'var(--sky-300)' : 'var(--fg-quiet)',
                  transition: 'all 150ms',
                }}
              >
                <Camera size={13} />
                <span>Scan</span>
              </button>
            </div>

            {/* Input fields based on mode */}
            {budgetMode !== 'scan' && (
              <div style={{ position: 'relative', width: '100%' }}>
                {budgetMode === 'search' ? (
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: compact ? '0 10px' : '0 12px',
                      borderRadius: 10,
                      border: `1px solid ${selectedFood ? 'var(--sky-400)' : 'var(--glass-edge)'}`,
                      background: 'var(--glass-1)',
                      height: compact ? 38 : 40,
                      boxSizing: 'border-box',
                      width: '100%',
                    }}>
                      <input
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value)
                          if (selectedFood) setSelectedFood(null)
                        }}
                        placeholder="Search foods…"
                        style={{
                          flex: 1, background: 'transparent', border: 'none', outline: 'none',
                          color: 'var(--fg-primary)', fontSize: 13, minWidth: 0,
                        }}
                      />
                      {selectedFood && (
                        <button type="button" onClick={handleClear} aria-label="Clear selected food" style={{ background: 'none', border: 'none', padding: 4, margin: -4, cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center' }}>
                          <X size={13} />
                        </button>
                      )}
                      {isFetching && !selectedFood && (
                        <span style={{ fontSize: 10, color: 'var(--fg-quiet)', flexShrink: 0 }}>…</span>
                      )}
                    </div>

                    {/* Results list */}
                    {showResults && (favMatches.length > 0 || results.length > 0) && (
                      <div
                        className="glass-bright"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 20,
                          marginTop: 4,
                          overflow: 'hidden',
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 10,
                          border: '1px solid var(--glass-edge)',
                        }}
                      >
                        {favMatches.map((fav) => {
                          const kcal = Math.round(fav.items.reduce((sum, i) => sum + (i.nutrients.calories ?? 0), 0))
                          return (
                            <button
                              key={fav.id}
                              type="button"
                              onClick={() => pickFavoriteFromSearch(fav.id)}
                              style={{
                                width: '100%', textAlign: 'left', background: 'none', border: 'none',
                                borderBottom: '1px solid var(--glass-edge)', padding: '9px 12px',
                                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                                fontFamily: 'var(--font-sans)',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-1)')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                            >
                              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Star size={13} fill="var(--aurora-pink)" style={{ color: 'var(--aurora-pink)', flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {fav.name}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 1 }}>
                                    Favorite · {fav.items.length} {fav.items.length === 1 ? 'item' : 'items'}
                                  </div>
                                </div>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--aurora-pink)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                                {kcal} kcal
                              </span>
                            </button>
                          )
                        })}
                        {results.slice(0, 6).map((food) => (
                          <button
                            key={food.id}
                            type="button"
                            onClick={() => handleSelect(food)}
                            style={{
                              width: '100%', textAlign: 'left', background: 'none', border: 'none',
                              borderBottom: '1px solid var(--glass-edge)', padding: '9px 12px',
                              cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                              fontFamily: 'var(--font-sans)',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-1)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
                                <span style={{ fontSize: 13, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {food.name}
                                </span>
                                {food.brand === 'USDA Reference' ? (
                                  <span style={{
                                    fontSize: 8, padding: '1px 6px', borderRadius: 20,
                                    background: 'rgba(56,189,248,0.15)', color: 'var(--sky-400)',
                                    border: '1px solid rgba(56,189,248,0.25)', fontWeight: 600,
                                    fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                                  }}>
                                    USDA Reference
                                  </span>
                                ) : food.source === 'user' ? (
                                  <span style={{
                                    fontSize: 8, padding: '1px 6px', borderRadius: 20,
                                    background: 'rgba(167,139,250,0.15)', color: '#c084fc',
                                    border: '1px solid rgba(167,139,250,0.25)', fontWeight: 600,
                                    fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                                  }}>
                                    Custom
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: 8, padding: '1px 6px', borderRadius: 20,
                                    background: 'rgba(255,255,255,0.06)', color: 'var(--fg-tertiary)',
                                    border: '1px solid rgba(255,255,255,0.08)', fontWeight: 500,
                                    fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em'
                                  }}>
                                    {food.source === 'off' ? 'Open Food Facts' : 'USDA API'}
                                  </span>
                                )}
                              </div>
                              {food.brand && food.brand !== 'USDA Reference' && (
                                <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 1 }}>{food.brand}</div>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                              {Math.round(food.nutrients_per_100g.calories ?? 0)} kcal
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showResults && results.length === 0 && favMatches.length === 0 && !isFetching && (
                      <div
                        className="glass-bright"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 20,
                          marginTop: 4,
                          padding: '8px 12px',
                          fontSize: 12,
                          color: 'var(--fg-quiet)',
                          borderRadius: 10,
                          border: '1px solid var(--glass-edge)',
                        }}
                      >
                        No results found.
                      </div>
                    )}
                  </>
                ) : (
                  <div ref={favDropdownRef} style={{ position: 'relative', width: '100%' }}>
                    <button
                      type="button"
                      onClick={() => setIsFavOpen(!isFavOpen)}
                      style={{
                        width: '100%',
                        borderRadius: 10,
                        padding: compact ? '0 12px' : '0 12px',
                        fontSize: 13,
                        border: '1px solid var(--glass-edge)',
                        background: 'var(--glass-1)',
                        color: 'var(--fg-secondary)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        height: compact ? 38 : 40,
                        minHeight: compact ? 38 : 40,
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Select a favorite...
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>

                    {isFavOpen && (
                      <div
                        className="glass-bright"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 20,
                          marginTop: 4,
                          overflow: 'hidden',
                          maxHeight: 200,
                          overflowY: 'auto',
                          borderRadius: 10,
                          border: '1px solid var(--glass-edge)',
                        }}
                      >
                        {favorites.length === 0 ? (
                          <div style={{ padding: '9px 12px', fontSize: 13, color: 'var(--fg-quiet)' }}>
                            No favorites saved yet.
                          </div>
                        ) : (
                          favorites.map((fav) => {
                            const calories = Math.round(fav.items.reduce((s, i) => s + (i.nutrients.calories ?? 0), 0))
                            return (
                              <button
                                key={fav.id}
                                type="button"
                                onClick={() => {
                                  handleSelectFavorite(fav.id)
                                  setIsFavOpen(false)
                                }}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  background: 'none',
                                  border: 'none',
                                  borderBottom: '1px solid var(--glass-edge)',
                                  padding: '9px 12px',
                                  cursor: 'pointer',
                                  fontSize: 13,
                                  color: 'var(--fg-primary)',
                                  display: 'block',
                                  fontFamily: 'var(--font-sans)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-1)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                              >
                                {fav.name} <span style={{ fontSize: 11, color: 'var(--fg-quiet)', marginLeft: 4 }}>({calories} kcal)</span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isScanning && (
              <div style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div
                  id={CALC_SCANNER_ID}
                  className="w-full bg-black"
                  style={{ minHeight: 220, borderRadius: 12, overflow: 'hidden' }}
                />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--fg-quiet)', textAlign: 'center' }}>
                  Hold steady over the barcode
                </p>
              </div>
            )}
            {barcodeError && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--bad)', textAlign: 'center' }}>{barcodeError}</p>
            )}

          </div>



          {/* Serving */}
          <div style={{ display: 'grid', gap: 6, width: '100%', minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Serving
            </span>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: compact ? 6 : 8, width: '100%' }}>
              <input
                type="number"
                inputMode="decimal"
                aria-label="Serving quantity"
                min={0}
                step="any"
                value={servingQty}
                onChange={(e) => { autoUnitRef.current = false; setServingQty(e.target.value) }}
                style={{
                  flex: '1 1 0px', minWidth: 50, width: '100%', textAlign: 'center', borderRadius: 10, padding: compact ? '10px 4px' : '10px 6px',
                  border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                  color: 'var(--fg-primary)', fontSize: 13, outline: 'none',
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                }}
              />
              <select
                value={servingUnit}
                onChange={(e) => changeUnit(e.target.value)}
                aria-label="Serving unit"
                style={{
                  borderRadius: 10, padding: compact ? '8px 6px' : '10px 8px', fontSize: 12,
                  width: compact ? 90 : 130,
                  border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                  color: 'var(--fg-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  outline: 'none',
                }}
              >
                {pendingMeasures.map((m, i) => {
                  const label = m.label
                  const gramsText = `${Math.round(m.grams)}g`
                  const displayName = label.toLowerCase().includes(gramsText) ? label : `${label} (${gramsText})`
                  return (
                    <option key={`hm:${i}`} value={`hm:${i}`} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>
                      {displayName}
                    </option>
                  )
                })}
                {PORTION_UNITS.map((u) => (
                  <option key={u} value={u} style={{ background: 'var(--bg-2)', color: 'var(--fg-primary)' }}>
                    {PORTION_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                onClick={handleAdd}
                disabled={!selectedFood || !servingQty || grams <= 0}
                style={{
                  padding: compact ? '0 10px' : '0 12px',
                  fontSize: 12,
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  borderRadius: 10,
                }}
              >
                <Plus size={12} strokeWidth={2} /> Add
              </button>
            </div>
            {/* Preset Chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
              {pendingPresets.map((p) => {
                const active = qtyNum === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { autoUnitRef.current = false; setServingQty(String(p)) }}
                    className={`serving-chip ${active ? 'active' : ''}`}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                      border: active ? '1px solid rgba(56,189,248,0.45)' : '1px solid var(--glass-edge)',
                      color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                      fontSize: 10,
                      fontWeight: active ? 600 : 400,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      transition: 'all 120ms ease-out',
                      outline: 'none',
                    }}
                  >
                    {p}{servingUnit === 'g' ? 'g' : servingUnit === 'ml' ? 'ml' : ''}
                  </button>
                )
              })}
              {selectedFood && servingUnit !== 'g' && (
                <div style={{ fontSize: 11, color: 'var(--fg-quiet)', display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 4, fontFamily: 'var(--font-mono)' }}>
                  = <span className="num" style={{ color: 'var(--fg-secondary)', fontWeight: 600 }}>{Math.round(grams)}</span>g
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Success message banner */}
        {successMessage && (
          <div style={{
            marginTop: 6,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.3)',
            color: 'var(--good)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Check size={14} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error message banner */}
        {errorMessage && (
          <div style={{
            marginTop: 6,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(251,113,133,0.12)',
            border: '1px solid rgba(251,113,133,0.3)',
            color: 'var(--bad)',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <AlertTriangle size={14} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Meal items list and actions */}
        {mealItems.length > 0 && (
          <div style={{ marginTop: 6, borderTop: '1px solid var(--glass-edge)', paddingTop: 12, display: 'grid', gap: 12, minWidth: 0, width: '100%' }}>
            <div style={{ minWidth: 0, width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div className="eyebrow" style={{ fontSize: 9.5, margin: 0 }}>Current meal items</div>
                <button
                  type="button"
                  onClick={() => setMealItems([])}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--fg-quiet)',
                    fontSize: 10,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '2px 6px',
                    margin: '-2px -6px',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'color 150ms',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bad)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--fg-quiet)'}
                >
                  <Trash2 size={10} /> Clear
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, width: '100%' }}>
                {mealItems.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: 'var(--glass-1)',
                      border: '1px solid var(--glass-edge)',
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                        {item.name}
                      </span>
                      {item.brand && (
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--fg-quiet)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                          {item.brand}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {editingItemId === item.id ? (
                        <>
                          <input
                            type="number"
                            inputMode="decimal"
                            aria-label="Edit quantity in grams"
                            min={1}
                            value={editingItemGrams}
                            onChange={(e) => setEditingItemGrams(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditedItem()
                              if (e.key === 'Escape') setEditingItemId(null)
                            }}
                            style={{
                              width: 54,
                              textAlign: 'center',
                              borderRadius: 6,
                              padding: '2px 4px',
                              border: '1px solid var(--sky-400)',
                              background: 'rgba(0,0,0,0.2)',
                              color: 'var(--fg-primary)',
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 'bold',
                              outline: 'none',
                            }}
                            autoFocus
                          />
                          <span style={{ fontSize: 11, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)' }}>g</span>
                          <button
                            type="button"
                            onClick={handleSaveEditedItem}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 5,
                              color: 'var(--good)',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            aria-label="Save changes"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 5,
                              color: 'var(--fg-quiet)',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            aria-label="Cancel editing"
                          >
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="num" style={{ fontSize: 11, color: 'var(--sky-300)', fontFamily: 'var(--font-mono)' }}>
                            {item.serving_g}g
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStartEditItem(item)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 5,
                              color: 'var(--fg-quiet)',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--fg-secondary)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--fg-quiet)'}
                            aria-label={`Edit quantity of ${item.name}`}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveMealItem(index)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 5,
                              color: 'var(--fg-quiet)',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'color 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bad)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--fg-quiet)'}
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Meal details & actions */}
            <div style={{ display: 'grid', gap: 10, minWidth: 0, width: '100%' }}>
              {/* Slot selector */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                  Slot
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((slot) => {
                    const active = selectedSlot === slot
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`serving-chip ${active ? 'active' : ''}`}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: active ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                          border: active ? '1px solid rgba(56,189,248,0.45)' : '1px solid var(--glass-edge)',
                          color: active ? 'var(--sky-300)' : 'var(--fg-secondary)',
                          fontSize: 10,
                          fontWeight: active ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 120ms ease-out',
                          outline: 'none',
                        }}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Meal name input */}
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
                  Meal Name
                </span>
                <input
                  type="text"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder={`e.g. ${mealItems.map((i) => i.name).slice(0, 2).join(' & ')}`}
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--glass-edge)',
                    background: 'var(--glass-1)',
                    color: 'var(--fg-primary)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleLogMeal}
                  disabled={logMealMutation.isPending}
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '8px 16px',
                    fontSize: 13,
                    borderRadius: 10,
                  }}
                >
                  <Plus size={13} strokeWidth={2} />
                  {logMealMutation.isPending ? 'Logging…' : 'Log meal'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveFavorite}
                  disabled={saveFavoriteMutation.isPending}
                  className="btn"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '8px 16px',
                    fontSize: 13,
                    borderRadius: 10,
                    gap: 6,
                  }}
                >
                  <Heart size={13} style={{ color: 'var(--fg-secondary)' }} />
                  {saveFavoriteMutation.isPending ? 'Saving…' : 'Favorite'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {(hasItemsOrFood || !compact) && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--glass-edge)', paddingTop: 10 }}>
            {hasItemsOrFood ? (
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', marginRight: 2 }}>
                  Adds
                </span>
                {([
                  [addCalories, 'kcal'],
                  [addProtein, 'g protein'],
                  [addSatFat, 'g sat fat'],
                  [addSolFiber, 'g fiber'],
                  [addSodium, 'mg sodium'],
                ] as const).map(([val, suffix]) => (
                  <span
                    key={suffix}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                      color: 'var(--fg-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                    }}
                  >
                    <span className="num">{val}</span>{suffix}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>
                Search for a food to check your budget.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
