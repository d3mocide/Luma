import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PendingMeal } from '../components/journal/JournalDrawer'
import { FoodsTab } from '../components/meals/FoodsTab'
import { JournalTab } from '../components/meals/JournalTab'
import { CalculatorTab } from '../components/meals/CalculatorTab'
import PlanRoute from './plan'
import RecipesRoute from './recipes'

type TabKey = 'foods' | 'plan' | 'journal' | 'calculator' | 'recipes'

export default function MealsRoute() {
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab: TabKey = (() => {
    const t = searchParams.get('tab')
    if (t === 'plan' || t === 'journal' || t === 'calculator' || t === 'recipes') return t
    return 'foods'
  })()

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)

  // Journal prefill from URL (mealId + mealName passed from Today nudge)
  const prefillMealId = searchParams.get('mealId')
  const prefillMealName = searchParams.get('mealName')
  const prefillLoggedAt = searchParams.get('loggedAt')
  const prefillSlot = searchParams.get('slot')

  const journalPrefill: PendingMeal | null =
    prefillMealId && prefillMealName
      ? { meal_event_id: prefillMealId, meal_name: prefillMealName, logged_at: prefillLoggedAt ?? new Date().toISOString(), slot: prefillSlot ?? 'meal' }
      : null

  function switchTab(tab: TabKey) {
    setActiveTab(tab)
    setSearchParams(tab === 'foods' ? {} : { tab }, { replace: true })
  }

  return (
    <div className="meals-page thin-scroll">
      {/* Page header */}
      <header style={{ marginBottom: 24 }}>
        <h1 style={{
          margin: '0 0 6px', fontSize: 32, fontWeight: 400,
          letterSpacing: '-0.02em', color: 'var(--fg-primary)',
        }}>
          Your{' '}
          <span
            className="serif-italic gradient-accent-text"
            style={{ background: 'var(--accent-gradient-hero)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
          >
            meal database.
          </span>
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
          Browse food groups by saturated fat · search the full database · plan your week · calculate portions.
        </p>
      </header>

      {/* Tab bar */}
      <div className="settings-tabs" role="tablist">
        {([
          { key: 'foods',      label: 'Foods'      },
          { key: 'plan',       label: 'Plan'       },
          { key: 'journal',    label: 'Journal'    },
          { key: 'calculator', label: 'Calculator' },
          { key: 'recipes',    label: 'Recipes'    },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            className="settings-tab"
            onClick={() => switchTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'foods' && <FoodsTab />}
      {activeTab === 'plan' && <PlanRoute />}
      {activeTab === 'journal' && (
        <JournalTab openWithPrefill={journalPrefill} />
      )}
      {activeTab === 'calculator' && <CalculatorTab />}
      {activeTab === 'recipes' && <RecipesRoute />}
    </div>
  )
}
