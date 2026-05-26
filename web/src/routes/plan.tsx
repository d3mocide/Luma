import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface MealSlot {
  id: string
  slot_date: string
  slot: string
  custom_name: string
  notes: string
  recipe_id: string | null
}

interface PlanData {
  id: string
  week_start: string
  status: string
  slots: MealSlot[]
}

export default function PlanRoute() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping'>('calendar')
  
  // Custom constraints input for Claude Sonnet meal generation
  const [customConstraints, setCustomConstraints] = useState('')
  
  // Selected slot drawer state
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null)
  
  // 1. Fetch current weekly plan
  const { data: plan, isLoading } = useQuery<PlanData>({
    queryKey: ['plan'],
    queryFn: () => api.get('/plan/current'),
    retry: false,
  })

  // 2. Fetch shopping list
  const { data: shoppingData } = useQuery<{ shopping_list: any[] }>({
    queryKey: ['shopping', plan?.id],
    queryFn: () => api.get(`/plan/${plan?.id}/shopping-list`),
    enabled: !!plan?.id,
  })

  // 3. Generate new plan mutation
  const generateMutation = useMutation({
    mutationFn: (constraintsText: string) =>
      api.post('/plan/generate', {
        constraints: constraintsText ? { custom_request: constraintsText } : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan'] })
      setCustomConstraints('')
    },
    onError: () => {
      alert('Failed to generate meal plan. Make sure Anthropic API key is configured!')
    }
  })

  // 4. Swap Slot mutation
  const swapMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/plan/slot/${slotId}/swap`),
    onSuccess: (updatedSlot: any) => {
      queryClient.invalidateQueries({ queryKey: ['plan'] })
      if (selectedSlot && selectedSlot.id === updatedSlot.id) {
        setSelectedSlot({ ...selectedSlot, ...updatedSlot })
      }
    }
  })

  // 5. Log as Eaten mutation
  const logEatenMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/plan/${plan?.id}/log-as-eaten/${slotId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today'] })
      alert('Meal successfully logged as eaten!')
      setSelectedSlot(null)
    }
  })

  // Group slots by date
  const groupSlotsByDate = () => {
    if (!plan || !plan.slots) return {}
    const grouped: Record<string, MealSlot[]> = {}
    plan.slots.forEach((s) => {
      if (!grouped[s.slot_date]) grouped[s.slot_date] = []
      grouped[s.slot_date].push(s)
    })
    return grouped
  }

  const grouped = groupSlotsByDate()
  const dates = Object.keys(grouped).sort()

  const formatDayName = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  // Shopping purchased state toggle mock
  const [purchasedItems, setPurchasedItems] = useState<Record<string, boolean>>({})
  const togglePurchased = (foodId: string) => {
    setPurchasedItems((prev) => ({ ...prev, [foodId]: !prev[foodId] }))
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 pb-24">
      {/* Route Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 uppercase tracking-wide">
            Heart-Healthy Meal Planner
          </h1>
          <p className="text-sm text-slate-400">Claude Sonnet-driven cardiovascular dietary orchestrator</p>
        </div>

        {plan && (
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 self-start">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'calendar' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Calendar Schedule
            </button>
            <button
              onClick={() => setActiveTab('shopping')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'shopping' ? 'bg-brand-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shopping List
            </button>
          </div>
        )}
      </div>

      {/* NO ACTIVE PLAN STATE */}
      {!plan && !isLoading && (
        <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <span className="text-4xl block">🥗</span>
            <h2 className="text-lg font-bold text-slate-200">No Weekly Plan Active</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generate a personalized 7-day meal plan calculated specifically for LDL reduction, dietary pattern targets, and soluble fiber intake.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-350 uppercase tracking-wider block">
              Additional Prompt Constraints (Optional)
            </label>
            <textarea
              value={customConstraints}
              onChange={(e) => setCustomConstraints(e.target.value)}
              placeholder="e.g. Include salmon twice, vegetarian lunches, no dairy..."
              className="w-full h-24 bg-slate-950 border border-slate-800 focus:border-brand-500 rounded-xl p-3 text-sm text-slate-300 focus:outline-none resize-none"
            />
            <button
              onClick={() => generateMutation.mutate(customConstraints)}
              disabled={generateMutation.isPending}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-800 text-white font-extrabold text-sm rounded-xl transition-all shadow shadow-brand-500/20 active:scale-95"
            >
              {generateMutation.isPending ? 'Claude is Orchestrating Plan...' : 'Generate Personalized 7-Day Plan'}
            </button>
          </div>
        </div>
      )}

      {/* LOADING STATE */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="w-10 h-10 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Loading meal planner...</p>
        </div>
      )}

      {/* CALENDAR TAB VIEW */}
      {plan && activeTab === 'calendar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dates.map((dateStr) => (
            <div
              key={dateStr}
              className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-4 shadow-xl"
            >
              <h3 className="text-sm font-black text-slate-200 border-b border-slate-800/80 pb-2 flex items-center justify-between">
                <span>{formatDayName(dateStr)}</span>
                <span className="text-xxs uppercase bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded-full font-bold">
                  Day Plan
                </span>
              </h3>

              <div className="space-y-3 flex-1">
                {grouped[dateStr].map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlot(slot)}
                    className="w-full text-left bg-slate-950/45 hover:bg-slate-950/90 border border-slate-850 hover:border-brand-500/40 rounded-xl p-3 flex flex-col gap-1 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xxs uppercase font-black tracking-wider text-slate-500 group-hover:text-brand-400 transition-colors">
                        {slot.slot}
                      </span>
                      <span className="text-xs opacity-0 group-hover:opacity-105 transition-opacity text-slate-400">
                        ➔
                      </span>
                    </div>
                    <span className="text-sm font-bold text-slate-200 block truncate">
                      {slot.custom_name}
                    </span>
                    {slot.notes && (
                      <span className="text-xs text-slate-450 line-clamp-1">
                        {slot.notes}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SHOPPING LIST TAB VIEW */}
      {plan && activeTab === 'shopping' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl mx-auto shadow-xl space-y-6">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-200">Ingredients Shopping List</h2>
              <p className="text-xs text-slate-500">Auto-compiled from this week's planned slots</p>
            </div>
            
            {/* Native Reminders Export trigger */}
            <button
              onClick={async () => {
                const res: any = await api.post(`/plan/${plan.id}/shopping-list/export-reminders`)
                alert(res.message || 'Exported successfully!')
              }}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-slate-100 rounded-lg text-xs font-bold border border-slate-700 transition-colors"
            >
              🍏 Export to Reminders
            </button>
          </div>

          <div className="divide-y divide-slate-800">
            {shoppingData?.shopping_list && shoppingData.shopping_list.length > 0 ? (
              shoppingData.shopping_list.map((item) => (
                <div
                  key={item.food_id}
                  onClick={() => togglePurchased(item.food_id)}
                  className="py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-slate-850/30 px-2 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox circle */}
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      purchasedItems[item.food_id]
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-700 group-hover:border-slate-500'
                    }`}>
                      {purchasedItems[item.food_id] && <span className="text-[10px] font-bold">✓</span>}
                    </div>

                    <div className="flex flex-col">
                      <span className={`text-sm font-bold transition-all ${
                        purchasedItems[item.food_id] ? 'text-slate-500 line-through' : 'text-slate-200'
                      }`}>
                        {item.name}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">{item.aisle || 'Grocery'}</span>
                    </div>
                  </div>

                  <span className={`text-xs font-mono font-bold transition-all ${
                    purchasedItems[item.food_id] ? 'text-slate-600' : 'text-slate-400'
                  }`}>
                    {item.quantity} {item.unit}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                No items in your shopping list yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SLOT DETAIL MODAL / DRAWER */}
      {selectedSlot && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedSlot(null)}
              className="absolute right-4 top-4 text-slate-500 hover:text-slate-300 font-bold"
            >
              ✕
            </button>

            <div className="space-y-1">
              <span className="text-xxs uppercase bg-brand-500/15 text-brand-450 px-2 py-0.5 rounded-full font-bold tracking-wider">
                {selectedSlot.slot}
              </span>
              <h3 className="text-lg font-black text-slate-100">{selectedSlot.custom_name}</h3>
              <span className="text-xs text-slate-500 font-mono">
                Planned for: {formatDayName(selectedSlot.slot_date)}
              </span>
            </div>

            {selectedSlot.notes && (
              <div className="p-3 bg-slate-950/45 border border-slate-850 rounded-xl">
                <span className="text-xxs text-slate-500 font-bold uppercase tracking-wider block mb-1">
                  Orchestrator Notes
                </span>
                <p className="text-xs text-slate-350 leading-relaxed">{selectedSlot.notes}</p>
              </div>
            )}

            {/* Estimated Nutrition Profile */}
            <div className="space-y-2">
              <span className="text-xxs text-slate-500 font-bold uppercase tracking-wider block">
                Estimated Nutrition
              </span>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-950/40 p-2 rounded text-center border border-slate-850">
                  <span className="text-xxs text-slate-500 block">Calories</span>
                  <span className="text-xs font-bold text-slate-300">350</span>
                </div>
                <div className="bg-slate-950/40 p-2 rounded text-center border border-slate-850">
                  <span className="text-xxs text-slate-500 block">Sat Fat</span>
                  <span className="text-xs font-bold text-red-400">1.0g</span>
                </div>
                <div className="bg-slate-950/40 p-2 rounded text-center border border-slate-850">
                  <span className="text-xxs text-slate-500 block">Sol Fiber</span>
                  <span className="text-xs font-bold text-emerald-400">4.5g</span>
                </div>
                <div className="bg-slate-950/40 p-2 rounded text-center border border-slate-850">
                  <span className="text-xxs text-slate-500 block">Protein</span>
                  <span className="text-xs font-bold text-indigo-400">15.0g</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => swapMutation.mutate(selectedSlot.id)}
                disabled={swapMutation.isPending}
                className="py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs rounded-xl transition-colors border border-slate-700/80"
              >
                {swapMutation.isPending ? 'Swapping...' : '🔄 Swap Alternative'}
              </button>

              <button
                onClick={() => logEatenMutation.mutate(selectedSlot.id)}
                disabled={logEatenMutation.isPending}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-colors shadow-lg shadow-emerald-600/10"
              >
                {logEatenMutation.isPending ? 'Logging...' : '✓ Log as Eaten'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
