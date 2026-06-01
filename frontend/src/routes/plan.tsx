import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shuffle, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import {
  type MealSlot,
  type PlanData,
  type ShoppingItem,
  type WeekSummary,
  groupByDate,
  formatWeek,
  formatWeekLabel,
  getWeekMonday,
  addWeeks,
} from '../components/plan/types'
import { PlanDayCard } from '../components/plan/PlanDayCard'
import { ShoppingListView } from '../components/plan/ShoppingListView'
import { SlotModal } from '../components/plan/SlotModal'
import { WeekNav } from '../components/plan/WeekNav'

export default function PlanRoute() {
  const queryClient = useQueryClient()
  const [selectedWeek, setSelectedWeek] = useState<string>(() => getWeekMonday())
  const [customConstraints, setCustomConstraints] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null)
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping'>('calendar')

  const currentWeek = getWeekMonday()
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

  const grouped = groupByDate(plan?.slots ?? [])
  const dates = Object.keys(grouped).sort()
  const todayStr = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  function handleGenerate(week: string, text: string) {
    generateMutation.mutate({ week, text })
  }

  function handleUseLastWeekTemplate() {
    setCustomConstraints('Use similar meals and structure from my previous week as a starting point')
  }

  return (
    <div className="thin-scroll plan-page">
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
        <div className="plan-header-top">
          <div className="eyebrow">
            {isCurrentWeek
              ? plan
                ? `Week of ${formatWeek(plan.week_start)}`
                : 'This Week'
              : isPastWeek
              ? `Past week — ${formatWeek(selectedWeek)}`
              : `Planning ahead — ${formatWeek(selectedWeek)}`}
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your{' '}
            <span className="serif-italic gradient-accent-text" style={{ background: 'var(--accent-gradient-hero)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>heart-healthy</span> week.
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
            Targeting LDL reduction · <span className="num">18g</span> soluble fiber / day · <span className="num">&lt;12g</span> saturated fat / day
          </p>
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

      {/* Empty state — no plan for selected week */}
      {!plan && !isLoading && (
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <div className="glass" style={{ padding: 40 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>
                {isPastWeek ? '📅' : isFutureWeek ? '🔮' : '🥗'}
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>
                {isPastWeek
                  ? `No plan for ${formatWeekLabel(selectedWeek)}`
                  : isCurrentWeek
                  ? 'No plan for this week yet'
                  : `Plan ahead for ${formatWeekLabel(selectedWeek)}`}
              </h2>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--fg-tertiary)', lineHeight: 1.6 }}>
                {isPastWeek
                  ? 'No plan was recorded for this week. You can still generate one for reference.'
                  : isCurrentWeek
                  ? 'Generate a personalized 7-day plan calculated for LDL reduction and soluble fiber targets.'
                  : `Get ahead of next week's meals and shopping in one step.`}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Additional constraints (optional)</div>
                <textarea
                  className="field-input plan-constraints-input"
                  value={customConstraints}
                  onChange={(e) => setCustomConstraints(e.target.value)}
                  placeholder="e.g. Include salmon twice, vegetarian lunches, no dairy…"
                  rows={3}
                  disabled={generateMutation.isPending}
                  style={{ width: '100%', resize: 'none', border: '1px solid var(--glass-edge)', borderRadius: 14, padding: '12px 14px', color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none' }}
                />
              </div>

              <button
                className="btn btn-primary"
                style={{ padding: '14px 20px', fontSize: 14, opacity: generateMutation.isPending ? 0.7 : 1 }}
                onClick={() => handleGenerate(selectedWeek, customConstraints)}
                disabled={generateMutation.isPending}
              >
                <Sparkles size={15} />
                {generateMutation.isPending
                  ? 'Luma is orchestrating…'
                  : `Generate Plan for ${formatWeekLabel(selectedWeek)}`}
              </button>

              {/* Copy from last week — shown when prev week has a plan */}
              {prevWeekHasPlan && !isPastWeek && (
                <button
                  className="btn"
                  style={{ fontSize: 13, padding: '10px 16px', color: 'var(--fg-secondary)' }}
                  onClick={handleUseLastWeekTemplate}
                  disabled={generateMutation.isPending}
                >
                  📋 Use last week as inspiration
                </button>
              )}

              {/* Browse past weeks */}
              {weeksWithPlans.size > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-quiet)', textAlign: 'center' }}>
                  Browse past weeks above for meal ideas ↑
                </p>
              )}
            </div>
          </div>
        </div>
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

          <div className="plan-calendar-grid">
            {dates.map((dateStr) => (
              <PlanDayCard
                key={dateStr}
                dateStr={dateStr}
                slots={grouped[dateStr]}
                dayTotals={plan.day_totals?.[dateStr]}
                isToday={dateStr === todayStr}
                onSlotClick={(slot) => setSelectedSlot(slot)}
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
