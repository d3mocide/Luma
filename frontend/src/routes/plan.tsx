import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shuffle } from 'lucide-react'
import { api } from '../lib/api'
import { type MealSlot, type PlanData, type ShoppingItem, groupByDate, formatWeek } from '../components/plan/types'
import { PlanDayCard } from '../components/plan/PlanDayCard'
import { ShoppingListView } from '../components/plan/ShoppingListView'
import { SlotModal } from '../components/plan/SlotModal'

export default function PlanRoute() {
  const queryClient = useQueryClient()
  const [customConstraints, setCustomConstraints] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<MealSlot | null>(null)
  const [activeTab, setActiveTab] = useState<'calendar' | 'shopping'>('calendar')

  const { data: plan, isLoading } = useQuery<PlanData>({
    queryKey: ['plan'],
    queryFn: () => api.get('/plan/current'),
    retry: false,
  })

  const { data: shoppingData } = useQuery<{ shopping_list: ShoppingItem[] }>({
    queryKey: ['shopping', plan?.id],
    queryFn: () => api.get(`/plan/${plan?.id}/shopping-list`),
    enabled: !!plan?.id,
  })

  const generateMutation = useMutation({
    mutationFn: (text: string) =>
      api.post('/plan/generate', { constraints: text ? { custom_request: text } : undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['plan'] }); setCustomConstraints('') },
    onError: () => alert('Failed to generate meal plan. Make sure your AI API key is configured.'),
  })

  const grouped = groupByDate(plan?.slots ?? [])
  const dates = Object.keys(grouped).sort()

  return (
    <div className="thin-scroll plan-page">
      {generateMutation.isPending && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(9, 11, 16, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <style>{`
            @keyframes progress-slide {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
            @keyframes pulse-opacity {
              0%, 100% { opacity: 0.65; }
              50% { opacity: 1; }
            }
          `}</style>
          <div className="glass" style={{
            maxWidth: 420,
            width: '100%',
            padding: 32,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
            boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}>
            <div style={{ fontSize: 44, animation: 'pulse-opacity 2s infinite ease-in-out' }}>🥗</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 400, color: 'var(--fg-primary)' }}>Orchestrating Weekly Plan</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-tertiary)', lineHeight: 1.5 }}>
                Luma is calculating optimal macronutrient boundaries and selecting cholesterol-lowering meals.
              </p>
            </div>
            
            <div style={{ width: '100%', height: 4, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2, overflow: 'hidden', position: 'relative', border: '1px solid rgba(255, 255, 255, 0.02)' }}>
              <div style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                background: 'linear-gradient(90deg, transparent, var(--sky-400), var(--sun-400), transparent)',
                animation: 'progress-slide 1.6s infinite linear',
                width: '40%',
              }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--sky-300)', fontWeight: 400, animation: 'pulse-opacity 2.5s infinite ease-in-out' }}>
                This may take up to 30 seconds...
              </span>
              <span style={{ fontSize: 11, color: 'var(--sun-300)', opacity: 0.9, fontWeight: 500, letterSpacing: '0.02em' }}>
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
            {plan ? `Week of ${formatWeek(plan.week_start)}` : 'Meal Plan'}
          </div>
          <h1 style={{ margin: '8px 0 6px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Your{' '}
            <span className="serif-italic gradient-accent-text" style={{ background: 'var(--accent-gradient-hero)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>heart-healthy</span> week.
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
            Targeting LDL reduction · <span className="num">18g</span> soluble fiber / day · <span className="num">&lt;12g</span> saturated fat / day
          </p>
        </div>
        {plan && (
          <div className="plan-header-controls plan-sticky-controls">
            <button className="btn" style={{ padding: '10px 14px' }}
              onClick={() => generateMutation.mutate(customConstraints)}
              disabled={generateMutation.isPending}>
              <Shuffle size={15}/> {generateMutation.isPending ? 'Generating…' : 'Regenerate'}
            </button>
            <div className="plan-view-toggle">
              {(['calendar', 'shopping'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`plan-view-toggle-btn ${activeTab === tab ? 'active' : ''}`}>
                  {tab === 'calendar' ? 'Calendar' : 'Shopping'}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* No plan */}
      {!plan && !isLoading && (
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="glass" style={{ padding: 40 }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🥗</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>No Weekly Plan Active</h2>
              <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--fg-tertiary)', lineHeight: 1.6 }}>
                Generate a personalized 7-day plan calculated for LDL reduction, dietary pattern targets, and soluble fiber intake.
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
              <button className="btn btn-primary" style={{ padding: '14px 20px', fontSize: 14, opacity: generateMutation.isPending ? 0.7 : 1 }} onClick={() => generateMutation.mutate(customConstraints)} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? 'Luma is orchestrating…' : 'Generate Personalized 7-Day Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.2)', borderTopColor: '#38bdf8', animation: 'spin 0.8s linear infinite' }}/>
          <p style={{ fontSize: 12, color: 'var(--fg-quiet)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Loading meal planner…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Calendar view */}
      {plan && activeTab === 'calendar' && (
        <div className="plan-calendar-grid">
          {dates.map((dateStr) => (
            <PlanDayCard
              key={dateStr}
              dateStr={dateStr}
              slots={grouped[dateStr]}
              dayTotals={plan.day_totals?.[dateStr]}
              isToday={dateStr === new Date().toISOString().slice(0, 10)}
              onSlotClick={(slot) => setSelectedSlot(slot)}
            />
          ))}
        </div>
      )}

      {/* Shopping view */}
      {plan && activeTab === 'shopping' && (
        <ShoppingListView
          planId={plan.id}
          shoppingList={shoppingData?.shopping_list ?? []}
        />
      )}

      {/* Slot modal */}
      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          planId={plan!.id}
          onClose={() => setSelectedSlot(null)}
          onSlotUpdated={(updated) => setSelectedSlot(updated)}
        />
      )}
    </div>
  )
}
