import { useState } from 'react'
import { MedicationsTab } from '../components/health/MedicationsTab'
import { SupplementsTab } from '../components/health/SupplementsTab'
import { InteractionsTab } from '../components/health/InteractionsTab'
import { SimulationsTab } from '../components/health/SimulationsTab'

const TABS = [
  { id: 'medications',  label: 'Medications'  },
  { id: 'supplements',  label: 'Supplements'  },
  { id: 'interactions', label: 'Interactions' },
  { id: 'simulations',  label: 'Simulations'  },
] as const

type TabId = typeof TABS[number]['id']

export default function HealthRoute() {
  const [tab, setTab] = useState<TabId>('medications')

  return (
    <div className="thin-scroll health-page">
      <header className="mobile-hero health-hero" style={{ marginBottom: 20 }}>
        <div className="mobile-hero-content">
          <h1 style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
            Health
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--fg-tertiary)' }}>
            Medications, supplements, interactions &amp; dietary simulations.
          </p>
        </div>
      </header>

      {/* Tab bar */}
      <div className="settings-tabs" role="tablist" style={{ marginBottom: 20 }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className="settings-tab"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'medications'  && <MedicationsTab />}
      {tab === 'supplements'  && <SupplementsTab />}
      {tab === 'interactions' && <InteractionsTab />}
      {tab === 'simulations'  && <SimulationsTab />}
    </div>
  )
}
