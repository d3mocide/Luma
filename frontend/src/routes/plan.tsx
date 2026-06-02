import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shuffle, Sparkles, Plus } from 'lucide-react'
import { api } from '../lib/api'
import {
  type MealSlot,
  type PlanData,
  type ShoppingItem,
  type WeekSummary,
  SLOT_META,
  groupByDate,
  formatWeek,
  formatWeekLabel,
  getWeekSunday,
  addWeeks,
} from '../components/plan/types'
import { PlanDayCard } from '../components/plan/PlanDayCard'
import { ShoppingListView } from '../components/plan/ShoppingListView'
import { SlotModal } from '../components/plan/SlotModal'
import { WeekNav } from '../components/plan/WeekNav'

// ── Blank day card (shown before any plan is created) ─────────────────────────

function BlankDayCard({
  dateStr,
  isToday,
  isPending,
  onSlotClick,
}: {
  dateStr: string
  isToday: boolean
  isPending: boolean
  onSlotClick: (slotType: string) => void
}) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const dayNum = dateObj.getDate()

  return (
    <div className="glass plan-day-card" style={{ padding: 16, borderRadius: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div className="eyebrow" style={{ fontSize: 10 }}>{dayName}</div>
        <div style={{
          fontSize: 22, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em',
          color: isToday ? 'var(--sky-400)' : 'var(--fg-primary)',
        }}>
          {dayNum}
        </div>
        {isToday && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sky-400)', flexShrink: 0 }} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(['breakfast', 'lunch', 'snack', 'dinner'] as const).map((slotType) => {
          const meta = SLOT_META[slotType]
          return (
            <button
              key={slotType}
              onClick={() => onSlotClick(slotType)}
              disabled={isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10,
                background: 'transparent',
                border: `1px dashed ${meta.color}33`,
                textAlign: 'left', cursor: isPending ? 'wait' : 'pointer', width: '100%',
                opacity: isPending ? 0.5 : 1, transition: 'opacity 150ms',
              }}
            >
              <span style={{ fontSize: 13, flexShrink: 0, opacity: 0.4 }}>{meta.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: meta.color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>
                  {slotType}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>Add meal</div>
              </div>
              <Plus size={11} style={{ color: 'var(--fg-quiet)', flexShrink: 0, opacity: 0.4 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Plan route ────────────────────────────────────────────────────────────────

export default function PlanRoute() {
  const queryClient = useQueryClient()
  const [selectedWeek, setSelectedWeek] = useState<string>(() => getWeekSunday())
  const [customConstraints, setCustomConstraints] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null)
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping'>('calendar')
  const [pendingSlotKey, setPendingSlotKey] = useState<{ date: string; slotType: string } | null>(null)

  const currentWeek = getWeekSunday()
  const nextWeek = addWeeks(currentWeek, 1)
  const todayDow = new Date().getDay()
  const isPastWeek = selectedWeek < currentWeek
  const isCurrentWeek = selectedWeek === currentWeek
  const isFutureWeek = selectedWeek > currentWeek

  // Plan for the selected week
  const { data: plan, isLoading } = useQuery<PlanData>({
    queryKey: ['plan', selectedWeek],
    queryFn: () => api.get(`/plan/week/${selectedWeek}`),
    retry: false,
  })

  // All weeks that have any plan (for nav dots)
  const { data: weeksData } = useQuery<{ weeks: WeekSummary[] }>({
    queryKey: ['plan-weeks'],
    queryFn: () => api.get('/plan/weeks'),
    staleTime: 60_000,
  })

  const weeksWithPlans = useMemo(
    () => new Set((weeksData?.weeks ?? []).map((w) => w.week_start)),
    [weeksData],
  )

  const prevWeek = addWeeks(selectedWeek, -1)
  const prevWeekHasPlan = weeksWithPlans.has(prevWeek)

  // Show nudge Thu/Fri/Sat when current week is selected and next week has no plan
  const showNextWeekNudge =
    isCurrentWeek && [4, 5, 6].includes(todayDow) && !weeksWithPlans.has(nextWeek)

  // Shopping list (only when plan is loaded)
  const { data: shoppingData } = useQuery<{ shopping_list: ShoppingItem[] }>({
    queryKey: ['shopping', plan?.id],
    queryFn: () => api.get(`/plan/${plan?.id}/shopping-list`),
    enabled: !!plan?.id,
  })

  const { data: goals } = useQuery<{
    daily_calorie_target: number | null
    daily_sat_fat_g_max: number | null
    daily_soluble_fiber_g: number | null
  }>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals'),
    staleTime: 300_000,
  })

  const moveMutation = useMutation({
    mutationFn: ({ slotId, newDate }: { slotId: string; newDate: string }) =>
      api.patch(`/plan/slot/${slotId}/move`, { new_date: newDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan'] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: ({ week, text }: { week: string; text: string }) =>
      api.post('/plan/generate', {
        week_start: week,
        constraints: text ? { custom_request: text } : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan'] })
      queryClient.invalidateQueries({ queryKey: ['plan-weeks'] })
      setCustomConstraints('')
    },
    onError: () => alert('Failed to generate meal plan. Make sure your AI API key is configured.'),
  })

  const initMutation = useMutation({
    mutationFn: (weekStart: string) => api.post('/plan/init', { week_start: weekStart }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', selectedWeek] })
      queryClient.invalidateQueries({ queryKey: ['plan-weeks'] })
    },
  })

  // After blank init, auto-open the slot the user clicked
  useEffect(() => {
    if (!pendingSlotKey || !plan) return
    const slot = plan.slots.find(
      (s) => s.slot_date === pendingSlotKey.date && s.slot === pendingSlotKey.slotType
    )
    if (slot) {
      setSelectedSlot(slot)
      setPendingSlotKey(null)
    }
  }, [plan, pendingSlotKey])

  const grouped = groupByDate(plan?.slots ?? [])
  const dates = Object.keys(grouped).sort()

  // All 7 dates for the selected week (used for blank-week grid)
  const weekDates = useMemo(() => {
    const [y, m, d] = selectedWeek.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(y, m - 1, d + i)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    })
  }, [selectedWeek])
  const todayStr = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  const weeklyAvg = useMemo(() => {
    if (!plan?.day_totals) return null
    const days = Object.values(plan.day_totals)
    if (!days.length) return null
    const sum = days.reduce(
      (acc, d) => ({
        calories: acc.calories + Number(d.calories ?? 0),
        saturated_fat_g: acc.saturated_fat_g + Number(d.saturated_fat_g ?? 0),
        soluble_fiber_g: acc.soluble_fiber_g + Number(d.soluble_fiber_g ?? 0),
      }),
      { calories: 0, saturated_fat_g: 0, soluble_fiber_g: 0 }
    )
    return {
      calories: sum.calories / days.length,
      saturated_fat_g: sum.saturated_fat_g / days.length,
      soluble_fiber_g: sum.soluble_fiber_g / days.length,
    }
  }, [plan?.day_totals])

  function handleGenerate(week: string, text: string) {
    generateMutation.mutate({ week, text })
  }

  function handleUseLastWeekTemplate() {
    setCustomConstraints('Use similar meals and structure from my previous week as a starting point')
  }

  return (
    <div className="plan-page">
      {/* Generation overlay */}
      {generateMutation.isPending && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(9,11,16,0.72)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <style>{`
            @keyframes progress-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
            @keyframes pulse-opacity { 0%,100% { opacity:0.65; } 50% { opacity:1; } }
          `}</style>
          <div className="glass" style={{
            maxWidth: 420, width: '100%', padding: 32, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            boxShadow: '0 24px 48px -12px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 44, animation: 'pulse-opacity 2s infinite ease-in-out' }}>🥗</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400, color: 'var(--fg-primary)' }}>
                Orchestrating Weekly Plan
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
                Luma is calculating optimal macronutrient boundaries and selecting cholesterol-lowering meals.
              </p>
            </div>
            <div style={{
              width: '100%', height: 4, background: 'var(--bg-3)', borderRadius: 2,
              overflow: 'hidden', position: 'relative', border: '1px solid var(--glass-edge)',
            }}>
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: '40%',
                background: 'linear-gradient(90deg, transparent, var(--sky-400), var(--sun-400), transparent)',
                animation: 'progress-slide 1.6s infinite linear',
              }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--fg-secondary)', fontWeight: 400, animation: 'pulse-opacity 2.5s infinite ease-in-out' }}>
                This may take a while…
              </span>
              <span style={{ fontSize: 11, color: 'var(--warn)', opacity: 0.9, fontWeight: 500 }}>
                ⚠️ Do not leave or refresh this page.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="plan-header">
        <div className="eyebrow" style={{ color: 'var(--fg-secondary)', letterSpacing: '0.12em', fontSize: 11 }}>
          {isCurrentWeek
            ? plan
              ? `Week of ${formatWeek(plan.week_start)}`
              : 'This Week'
            : isPastWeek
            ? `Past week — ${formatWeek(selectedWeek)}`
            : `Planning ahead — ${formatWeek(selectedWeek)}`}
        </div>

        {/* Week navigation */}
        <WeekNav
          selectedWeek={selectedWeek}
          currentWeek={currentWeek}
          weeksWithPlans={weeksWithPlans}
          onChange={(w) => { setSelectedWeek(w); setActiveTab('calendar') }}
        />

        {/* Controls row (only when plan loaded) */}
        {plan && (
          <div className="plan-header-controls plan-sticky-controls">
            <button
              className="btn"
              style={{ padding: '10px 14px' }}
              onClick={() => handleGenerate(selectedWeek, customConstraints)}
              disabled={generateMutation.isPending}
            >
              <Shuffle size={15} />
              {generateMutation.isPending ? 'Generating…' : 'Regenerate'}
            </button>
            <div className="plan-view-toggle">
              {(['calendar', 'shopping'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`plan-view-toggle-btn ${activeTab === tab ? 'active' : ''}`}
                >
                  {tab === 'calendar' ? 'Calendar' : 'Shopping'}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* End-of-week nudge: suggest planning next week */}
      {showNextWeekNudge && !generateMutation.isPending && (
        <div className="plan-next-week-nudge">
          <span style={{ fontSize: 20, flexShrink: 0 }}>📆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>
              Next week starts {formatWeekLabel(nextWeek)}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--fg-tertiary)' }}>
              Ready to plan ahead and prep your grocery list?
            </p>
          </div>
          <button
            className="btn"
            style={{ fontSize: 12, padding: '8px 14px', flexShrink: 0 }}
            onClick={() => { setSelectedWeek(nextWeek); setActiveTab('calendar') }}
          >
            Plan next week →
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: 12, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Loading meal planner…</p>
        </div>
      )}

      {/* Blank week — no plan yet, show empty scaffold */}
      {!plan && !isLoading && (
        <>
          {/* AI generate banner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
            padding: '12px 16px', background: 'var(--glass-1)', borderRadius: 12,
            border: '1px solid var(--glass-edge)',
          }}>
            <Sparkles size={16} style={{ color: 'var(--sky-400)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>
                No plan for {isPastWeek ? formatWeekLabel(selectedWeek) : 'this week'} yet.
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 1 }}>
                Click any slot to add a meal, or generate a full week with AI.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {prevWeekHasPlan && !isPastWeek && (
                <button
                  className="btn"
                  style={{ fontSize: 12, padding: '7px 12px' }}
                  onClick={handleUseLastWeekTemplate}
                  disabled={generateMutation.isPending}
                >
                  📋 Use last week
                </button>
              )}
              <button
                className="btn"
                style={{ fontSize: 12, padding: '7px 12px' }}
                onClick={() => handleGenerate(selectedWeek, customConstraints)}
                disabled={generateMutation.isPending}
              >
                <Sparkles size={12} />
                Generate with AI
              </button>
            </div>
          </div>

          {/* Empty 7-day scaffold */}
          <div className="plan-calendar-grid">
            {weekDates.map((dateStr) => (
              <BlankDayCard
                key={dateStr}
                dateStr={dateStr}
                isToday={dateStr === todayStr}
                isPending={initMutation.isPending}
                onSlotClick={(slotType) => {
                  setPendingSlotKey({ date: dateStr, slotType })
                  initMutation.mutate(selectedWeek)
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Calendar view */}
      {plan && activeTab === 'calendar' && (
        <>
          {/* Past-week context banner */}
          {(isPastWeek || isFutureWeek) && (
            <div className="plan-context-banner">
              <span style={{ fontSize: 14 }}>{isPastWeek ? '🕐' : '📅'}</span>
              <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>
                {isPastWeek
                  ? `Viewing past plan — ${formatWeek(plan.week_start)}`
                  : `Future plan — ${formatWeek(plan.week_start)}`}
              </span>
              <button
                className="plan-context-banner-btn"
                onClick={() => setSelectedWeek(currentWeek)}
              >
                Back to this week
              </button>
            </div>
          )}

          {weeklyAvg && (
            <div className="glass" style={{ padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 0, alignItems: 'center' }}>
              <div style={{ marginRight: 20, flexShrink: 0 }}>
                <div className="eyebrow" style={{ marginBottom: 2 }}>Weekly avg</div>
                <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>vs daily goal</div>
              </div>
              {[
                {
                  label: 'Calories', key: 'calories' as const,
                  value: Math.round(weeklyAvg.calories),
                  target: goals?.daily_calorie_target ?? null,
                  unit: '', color: 'var(--fg-primary)',
                  fmt: (v: number) => String(Math.round(v)),
                },
                {
                  label: 'Sat Fat', key: 'saturated_fat_g' as const,
                  value: weeklyAvg.saturated_fat_g,
                  target: goals?.daily_sat_fat_g_max ?? null,
                  unit: 'g', color: 'var(--bad)',
                  fmt: (v: number) => Number(v).toFixed(1) + 'g',
                  lowerIsBetter: true,
                },
                {
                  label: 'Sol Fiber', key: 'soluble_fiber_g' as const,
                  value: weeklyAvg.soluble_fiber_g,
                  target: goals?.daily_soluble_fiber_g ?? null,
                  unit: 'g', color: 'var(--good)',
                  fmt: (v: number) => Number(v).toFixed(1) + 'g',
                },
              ].map(({ label, value, target, color, fmt, lowerIsBetter }) => {
                const pct = target ? Math.min((value / target) * 100, 120) : null
                const good = target
                  ? lowerIsBetter ? value <= target : value >= target * 0.85
                  : true
                return (
                  <div key={label} style={{ flex: 1, padding: '0 12px', borderLeft: '1px solid var(--glass-edge)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{label}</span>
                      <span className="num" style={{ fontSize: 13, fontWeight: 600, color: good ? color : 'var(--warn)' }}>
                        {fmt(value)}
                        {target && <span style={{ fontSize: 10, color: 'var(--fg-quiet)', fontWeight: 400 }}> / {fmt(target)}</span>}
                      </span>
                    </div>
                    {pct !== null && (
                      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 2, transition: 'width 400ms ease',
                          width: `${Math.min(pct, 100)}%`,
                          background: good ? color : 'var(--warn)',
                        }}/>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="plan-calendar-grid">
            {dates.map((dateStr) => (
              <PlanDayCard
                key={dateStr}
                dateStr={dateStr}
                slots={grouped[dateStr]}
                dayTotals={plan.day_totals?.[dateStr]}
                isToday={dateStr === todayStr}
                onSlotClick={(slot) => setSelectedSlot(slot)}
                onMoveSlot={(slotId, newDate) => moveMutation.mutate({ slotId, newDate })}
              />
            ))}
          </div>
        </>
      )}

      {/* Shopping view */}
      {plan && activeTab === 'shopping' && (
        <ShoppingListView planId={plan.id} shoppingList={shoppingData?.shopping_list ?? []} />
      )}

      {/* Slot modal */}
      {selectedSlot && plan && (
        <SlotModal
          slot={selectedSlot}
          planId={plan.id}
          onClose={() => setSelectedSlot(null)}
          onSlotUpdated={(updated) => setSelectedSlot(updated)}
        />
      )}
    </div>
  )
}
