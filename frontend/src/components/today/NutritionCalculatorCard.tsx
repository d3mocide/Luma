import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Search, Camera, Trash2, Heart, Check, Edit2, Star } from 'lucide-react'
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
  remaining,
  projected,
  unit,
  showProjected,
  noTarget,
  compact,
  style,
  color,
  isMinTarget,
}: {
  label: string
  remaining: number
  projected: number
  unit: string
  showProjected: boolean
  noTarget: boolean
  compact?: boolean
  style?: React.CSSProperties
  color: string
  isMinTarget?: boolean
}) {
  const over = !isMinTarget && showProjected && projected < 0
  const valueColor = noTarget ? 'var(--fg-quiet)' : over ? 'var(--bad)' : color

  return (
    <div className="glass-inset" style={{ padding: compact ? '8px 6px' : '10px 12px', textAlign: compact ? 'center' : 'left', ...style }}>
      <div style={{ fontSize: compact ? 9.5 : 11.5, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ marginTop: compact ? 3 : 6, display: 'flex', alignItems: 'baseline', gap: compact ? 3 : 6, justifyContent: compact ? 'center' : 'flex-start' }}>
        <span className="num" style={{ fontSize: compact ? 16 : 20, color: valueColor }}>
          {noTarget ? '—' : (showProjected ? projected : remaining)}
        </span>
        {!noTarget && <span style={{ fontSize: compact ? 10 : 13, color: 'var(--fg-quiet)' }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 2, fontSize: compact ? 9.5 : 11.5, color: over ? 'var(--bad)' : 'var(--fg-quiet)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {noTarget
          ? compact ? 'no target' : 'no target set'
          : showProjected
            ? compact
              ? <>curr: <span className="num">{remaining}</span></>
              : <>current: <span className="num">{remaining}</span> {unit}</>
            : 'remaining'}
      </div>
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

  const [budgetMode, setBudgetMode] = useState<'search' | 'favorite'>('search')
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

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null)
  const [servingQty, setServingQty] = useState('150')
  const [servingUnit, setServingUnit] = useState<string>('g')
  const autoUnitRef = useRef(true)
  const [isScanning, setIsScanning] = useState(false)
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
    const selectEl = document.getElementById('budget-fav-select') as HTMLSelectElement | null
    if (selectEl) selectEl.value = ''
  }


  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (!isScanning) return
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
          setIsScanning(false)
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
          } catch {
            setBarcodeError('Product not found')
          }
        },
        () => {},
      )
      .then(() => {
        startResolved = true
        if (stopRequested) scanner.stop().catch(() => {})
      })
      .catch(() => setIsScanning(false))

    return () => {
      stopRequested = true
      if (startResolved) scanner.stop().catch(() => {})
    }
  }, [isScanning])

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
  const currentSugars    = selectedFood ? round1((n.sugars_g          ?? 0) * factor) : 0
  const currentProtein   = selectedFood ? round1((n.protein_g         ?? 0) * factor) : 0

  const mealCalories = mealItems.reduce((sum, item) => sum + (item.nutrition.calories ?? 0), 0)
  const mealSatFat = mealItems.reduce((sum, item) => sum + (item.nutrition.saturated_fat_g ?? 0), 0)
  const mealSolFiber = mealItems.reduce((sum, item) => sum + (item.nutrition.soluble_fiber_g ?? 0), 0)
  const mealSugars = mealItems.reduce((sum, item) => sum + (item.nutrition.sugars_g ?? 0), 0)
  const mealProtein = mealItems.reduce((sum, item) => sum + (item.nutrition.protein_g ?? 0), 0)

  const addCalories = round1(mealCalories + currentCalories)
  const addSatFat = round1(mealSatFat + currentSatFat)
  const addSolFiber = round1(mealSolFiber + currentSolFiber)
  const addSugars = round1(mealSugars + currentSugars)
  const addProtein = round1(mealProtein + currentProtein)

  const calTarget  = adherence.calories.target ?? 0
  const calLogged  = adherence.calories.logged ?? 0
  const calRemain  = round1(calTarget - calLogged)
  const calProjected = round1(calRemain - addCalories)

  const satTarget  = adherence.sat_fat_g.target ?? 0
  const satLogged  = adherence.sat_fat_g.logged ?? 0
  const satRemain  = round1(satTarget - satLogged)
  const satProjected = round1(satRemain - addSatFat)

  const solTarget  = adherence.soluble_fiber_g.target ?? 0
  const solLogged  = adherence.soluble_fiber_g.logged ?? 0
  const solRemain  = round1(solTarget - solLogged)
  const solProjected = round1(solRemain - addSolFiber)

  const sugarsTarget  = adherence.sugars_g?.target ?? 0
  const sugarsLogged  = adherence.sugars_g?.logged ?? 0
  const sugarsRemain  = round1(sugarsTarget - sugarsLogged)
  const sugarsProjected = round1(sugarsRemain - addSugars)

  const proteinTarget  = adherence.protein_g?.target ?? 0
  const proteinLogged  = adherence.protein_g?.logged ?? 0
  const proteinRemain  = round1(proteinTarget - proteinLogged)
  const proteinProjected = round1(proteinRemain - addProtein)

  const hasItemsOrFood = selectedFood !== null || mealItems.length > 0
  const showResults = !selectedFood && debouncedQuery.length >= 2

  type FitSignal = 'fits' | 'tight' | 'over'
  let fitSignal: FitSignal | null = null
  if (hasItemsOrFood && calTarget > 0) {
    if (calProjected < 0 || (satTarget > 0 && satProjected < 0) || (sugarsTarget > 0 && sugarsProjected < 0)) {
      fitSignal = 'over'
    } else if (calProjected < calTarget * 0.08 || (satTarget > 0 && satProjected < satTarget * 0.08) || (sugarsTarget > 0 && sugarsProjected < sugarsTarget * 0.08)) {
      fitSignal = 'tight'
    } else {
      fitSignal = 'fits'
    }
  }

  const fitColor = fitSignal === 'fits' ? 'var(--aurora-mint)' : fitSignal === 'tight' ? 'var(--sun-400)' : 'var(--bad)'
  const fitLabel = fitSignal === 'fits' ? '✓ Fits your budget' : fitSignal === 'tight' ? '⚠ Tight — close to limit' : '✗ Exceeds budget'

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
  handleSelectRef.current = handleSelect

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
      setSuccessMessage('Meal logged successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to log meal.')
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
      setSuccessMessage('Saved to favorites')
      setTimeout(() => setSuccessMessage(''), 3000)
    },
    onError: (err: Error) => {
      alert(err.message || 'Failed to save favorite.')
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

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
        gap: compact ? 6 : 10,
        marginBottom: 12
      }}>
        <BudgetStat
          label="Calories"
          remaining={calRemain}
          projected={calProjected}
          unit="kcal"
          showProjected={hasItemsOrFood}
          noTarget={calTarget === 0}
          compact={compact}
          style={compact ? { gridColumn: 'span 2' } : undefined}
          color="var(--sky-400)"
        />
        <BudgetStat label="Sat fat"  remaining={satRemain} projected={satProjected} unit="g"    showProjected={hasItemsOrFood} noTarget={satTarget === 0} compact={compact} color="var(--sun-400)" />
        <BudgetStat label="Sol fiber" remaining={solRemain} projected={solProjected} unit="g"   showProjected={hasItemsOrFood} noTarget={solTarget === 0} compact={compact} color="var(--good)" isMinTarget />
        <BudgetStat label="Sugar"     remaining={sugarsRemain} projected={sugarsProjected} unit="g" showProjected={hasItemsOrFood} noTarget={sugarsTarget === 0} compact={compact} color="var(--aurora-pink)" />
        <BudgetStat label="Protein"   remaining={proteinRemain} projected={proteinProjected} unit="g" showProjected={hasItemsOrFood} noTarget={proteinTarget === 0} compact={compact} color="var(--aurora-violet)" isMinTarget />
      </div>

      <div className="glass-inset" style={{ padding: compact ? 8 : 12, display: 'grid', gap: 10, minWidth: 0, width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr auto', gap: compact ? 8 : 12, alignItems: 'start', minWidth: 0, width: '100%' }}>

          {/* Food search */}
          <label style={{ display: 'grid', gap: 6, minWidth: 0, width: '100%' }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              {budgetMode === 'search' ? 'Food search' : 'Favorite'}
            </span>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: compact ? 6 : 8, alignItems: 'stretch' }}>
                <button
                  type="button"
                  onClick={() => setBudgetMode((prev) => (prev === 'search' ? 'favorite' : 'search'))}
                  title={budgetMode === 'search' ? 'Switch to Favorites' : 'Switch to Search'}
                  style={{
                    padding: compact ? '0 10px' : '0 12px',
                    borderRadius: 10,
                    flexShrink: 0,
                    background: 'var(--glass-1)',
                    border: `1px solid ${budgetMode === 'favorite' ? 'rgba(251,191,36,0.3)' : 'var(--glass-edge)'}`,
                    color: budgetMode === 'favorite' ? 'var(--sun-400)' : 'var(--fg-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = budgetMode === 'favorite' ? 'var(--sun-400)' : 'var(--sky-400)'
                    e.currentTarget.style.color = budgetMode === 'favorite' ? 'var(--sun-300)' : 'var(--sky-300)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = budgetMode === 'favorite' ? 'rgba(251,191,36,0.3)' : 'var(--glass-edge)'
                    e.currentTarget.style.color = budgetMode === 'favorite' ? 'var(--fg-secondary)' : 'var(--fg-secondary)'
                  }}
                >
                  {budgetMode === 'search' ? <Search size={14} /> : <Star size={14} />}
                </button>

                {budgetMode === 'search' ? (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
                    padding: compact ? '8px 10px' : '10px 12px', borderRadius: 10,
                    border: `1px solid ${selectedFood ? 'var(--sky-400)' : 'var(--glass-edge)'}`,
                    background: 'var(--glass-1)',
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
                      <button type="button" onClick={handleClear} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', alignItems: 'center' }}>
                        <X size={13} />
                      </button>
                    )}
                    {isFetching && !selectedFood && (
                      <span style={{ fontSize: 10, color: 'var(--fg-quiet)', flexShrink: 0 }}>…</span>
                    )}
                  </div>
                ) : (
                  <div ref={favDropdownRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => setIsFavOpen(!isFavOpen)}
                      style={{
                        width: '100%',
                        borderRadius: 10,
                        padding: compact ? '8px 10px' : '10px 12px',
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
                        height: '100%',
                        minHeight: compact ? 34 : 40,
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

                <button
                  type="button"
                  onClick={() => { setBarcodeError(''); setIsScanning((v) => !v) }}
                  style={{
                    padding: compact ? '0 10px' : '0 14px', borderRadius: 10, flexShrink: 0,
                    background: isScanning ? 'rgba(56,189,248,0.15)' : 'var(--glass-1)',
                    border: isScanning ? '1px solid rgba(56,189,248,0.4)' : '1px solid var(--glass-edge)',
                    color: isScanning ? 'var(--sky-300)' : 'var(--fg-secondary)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: compact ? 0 : 6,
                    justifyContent: 'center',
                    fontSize: 13, transition: 'all 150ms',
                  }}
                  title={isScanning ? 'Stop Scanning' : 'Scan Barcode'}
                >
                  <Camera size={14} />
                  {!compact && 'Scan'}
                </button>
              </div>
              {isScanning && (
                <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden' }}>
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
              {barcodeError && !isScanning && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--bad)' }}>{barcodeError}</p>
              )}

              {/* Results list */}
              {budgetMode === 'search' && showResults && results.length > 0 && (
                <div
                  className="glass-bright"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    marginTop: 4,
                    overflow: 'hidden',
                  }}
                >
                  {results.slice(0, 6).map((food) => (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => handleSelect(food)}
                      style={{
                        width: '100%', textAlign: 'left', background: 'none', border: 'none',
                        borderBottom: '1px solid var(--glass-edge)', padding: '9px 12px',
                        cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
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
              {budgetMode === 'search' && showResults && results.length === 0 && !isFetching && (
                <div
                  className="glass-bright"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    marginTop: 4,
                    padding: '8px 12px',
                    fontSize: 12,
                    color: 'var(--fg-quiet)',
                  }}
                >
                  No results found.
                </div>
              )}
            </div>
          </label>



          {/* Serving */}
          <div style={{ display: 'grid', gap: 6, width: '100%', minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}>
              Serving
            </span>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: compact ? 6 : 8 }}>
              <input
                type="number"
                min={0}
                step="any"
                value={servingQty}
                onChange={(e) => { autoUnitRef.current = false; setServingQty(e.target.value) }}
                style={{
                  width: compact ? 68 : 80, textAlign: 'center', borderRadius: 10, padding: compact ? '8px 4px' : '10px 6px',
                  border: '1px solid var(--glass-edge)', background: 'var(--glass-1)',
                  color: 'var(--fg-primary)', fontSize: 13, outline: 'none',
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                }}
              />
              <select
                value={servingUnit}
                onChange={(e) => changeUnit(e.target.value)}
                style={{
                  borderRadius: 10, padding: compact ? '8px 6px' : '10px 8px', fontSize: 12, flex: '1 1 0px', minWidth: 0, width: '100%',
                  maxWidth: compact ? 'none' : 200,
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
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
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

        {/* Meal items list and actions */}
        {mealItems.length > 0 && (
          <div style={{ marginTop: 6, borderTop: '1px solid var(--glass-edge)', paddingTop: 12, display: 'grid', gap: 12, minWidth: 0, width: '100%' }}>
            <div style={{ minWidth: 0, width: '100%' }}>
              <div className="eyebrow" style={{ fontSize: 9.5, marginBottom: 6 }}>Current meal items</div>
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
                              padding: 2,
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
                              padding: 2,
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
                              padding: 2,
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
                              padding: 2,
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>
                  Adds <span className="num">{addCalories}</span> kcal · <span className="num">{addSatFat}</span>g sat fat · <span className="num">{addSolFiber}</span>g soluble fiber · <span className="num">{addSugars}</span>g sugar · <span className="num">{addProtein}</span>g protein
                </div>
                {fitSignal && (
                  <div style={{ fontSize: 12, fontWeight: 500, color: fitColor }}>
                    {fitLabel}
                  </div>
                )}
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
