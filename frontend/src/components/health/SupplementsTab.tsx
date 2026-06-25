import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Leaf, Plus, Trash2, Pencil, X, CheckCircle2, Circle, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import {
  SUPPLEMENT_CORE_FIELDS, SUPPLEMENT_MICRO_FIELDS, SUPPLEMENT_NUTRIENT_FIELDS, SUPPLEMENT_PRESETS,
  type Supplement,
} from './types'
import { EmptyState, ActivePill, ModalField } from './shared'

// ---------------------------------------------------------------------------
// Supplement modal
// ---------------------------------------------------------------------------

function SupplementModal({
  initial,
  onSave,
  onClose,
  saving,
}: {
  initial?: Partial<Supplement>
  onSave: (data: Omit<Supplement, 'id' | 'created_at'>) => void
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    dose: initial?.dose ?? '',
    frequency: initial?.frequency ?? '',
    is_active: initial?.is_active ?? true,
    nutrients: { ...(initial?.nutrients_per_dose ?? {}) } as Record<string, number>,
  })
  // Reveal vitamins & minerals automatically when editing a supplement that
  // already has any micronutrient values set.
  const [showMicros, setShowMicros] = useState(() =>
    SUPPLEMENT_MICRO_FIELDS.some((f) => (initial?.nutrients_per_dose?.[f.key] ?? 0) > 0)
  )

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))
  const setNutrient = (key: string, raw: string) => {
    const val = parseFloat(raw)
    setForm((f) => ({
      ...f,
      nutrients: { ...f.nutrients, [key]: isNaN(val) || val === 0 ? 0 : val },
    }))
  }

  const applyPreset = (preset: typeof SUPPLEMENT_PRESETS[number]) => {
    if (!form.name) setForm((f) => ({ ...f, name: preset.label }))
    setForm((f) => ({ ...f, nutrients: { ...f.nutrients, ...preset.nutrients } }))
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(9,11,16,0.72)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div className="glass supp-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg-primary)' }}>
            {initial?.id ? 'Edit supplement' : 'Add supplement'}
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Presets */}
        {!initial?.id && (
          <div style={{ marginBottom: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 8, fontSize: 9 }}>Quick presets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SUPPLEMENT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
                    background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                    color: 'var(--fg-secondary)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalField label="Name *" value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Fish Oil" />
          <div className="supp-field-row">
            <ModalField label="Dose" value={form.dose} onChange={(v) => set('dose', v)} placeholder="e.g. 1000 mg" />
            <ModalField label="Frequency" value={form.frequency} onChange={(v) => set('frequency', v)} placeholder="e.g. daily with breakfast" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="supp-active" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} style={{ cursor: 'pointer' }} />
            <label htmlFor="supp-active" style={{ fontSize: 13, color: 'var(--fg-secondary)', cursor: 'pointer' }}>Currently taking (active)</label>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--glass-edge)', margin: '20px 0' }} />

        <div className="eyebrow" style={{ marginBottom: 4, fontSize: 9 }}>Nutrients per dose</div>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--fg-quiet)', lineHeight: 1.4 }}>
          Leave fields at 0 to skip them.
        </p>
        <div className="supp-nutrient-grid">
          {SUPPLEMENT_CORE_FIELDS.map(({ key, label, unit }) => (
            <div key={key} className="supp-nutrient-cell">
              <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.nutrients[key] || ''}
                  onChange={(e) => setNutrient(key, e.target.value)}
                  placeholder="0"
                  style={{
                    flex: 1, width: '100%', padding: '6px 8px', borderRadius: 8,
                    background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                    color: 'var(--fg-primary)', fontSize: 13, minWidth: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)', flexShrink: 0 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Vitamins & minerals — collapsible to keep the panel calm */}
        <button
          type="button"
          onClick={() => setShowMicros((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 16,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--fg-secondary)', fontSize: 12, fontFamily: 'var(--font-sans)',
          }}
        >
          <ChevronDown
            size={14}
            style={{ transform: showMicros ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
          />
          {showMicros ? 'Hide vitamins & minerals' : 'Add vitamins & minerals'}
        </button>
        {showMicros && (
          <div className="supp-nutrient-grid" style={{ marginTop: 12 }}>
            {SUPPLEMENT_MICRO_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="supp-nutrient-cell">
                <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.nutrients[key] || ''}
                    onChange={(e) => setNutrient(key, e.target.value)}
                    placeholder="0"
                    style={{
                      flex: 1, width: '100%', padding: '6px 8px', borderRadius: 8,
                      background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                      color: 'var(--fg-primary)', fontSize: 13, minWidth: 0,
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--fg-quiet)', flexShrink: 0 }}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 2, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}
            disabled={saving || !form.name.trim()}
            onClick={() => {
              const cleanNutrients = Object.fromEntries(
                Object.entries(form.nutrients).filter(([, v]) => v > 0)
              )
              onSave({
                name: form.name,
                dose: form.dose || null,
                frequency: form.frequency || null,
                nutrients_per_dose: cleanNutrients,
                is_active: form.is_active,
              })
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Supplements tab
// ---------------------------------------------------------------------------

export function SupplementsTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'add' | Supplement | null>(null)

  const { data: supps = [], isLoading } = useQuery<Supplement[]>({
    queryKey: ['health', 'supplements'],
    queryFn: () => api.get('/health/supplements'),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => api.post('/health/supplements', body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['health', 'supplements'] }); void qc.invalidateQueries({ queryKey: ['today'] }); setModal(null) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch(`/health/supplements/${id}`, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['health', 'supplements'] }); void qc.invalidateQueries({ queryKey: ['today'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/health/supplements/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['health', 'supplements'] }); void qc.invalidateQueries({ queryKey: ['today'] }) },
  })

  const toggleLogMut = useMutation({
    mutationFn: ({ id, taken }: { id: string; taken: boolean }) => {
      if (taken) {
        return api.post(`/health/supplements/${id}/log`)
      } else {
        return api.delete(`/health/supplements/${id}/log`)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['health', 'supplements'] })
      void qc.invalidateQueries({ queryKey: ['today'] })
    },
  })

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-quiet)', fontSize: 13 }}>Loading…</div>

  const takenToday = supps.filter((s) => s.is_active && s.taken_today)
  const aggregateNutrients: Record<string, number> = {}
  for (const s of takenToday) {
    for (const [key, val] of Object.entries(s.nutrients_per_dose || {})) {
      if (val > 0) {
        aggregateNutrients[key] = (aggregateNutrients[key] ?? 0) + val
      }
    }
  }
  const aggregateEntries = Object.entries(aggregateNutrients).filter(([, val]) => val > 0)

  return (
    <div className="health-grid">
      {/* Left column: List & Action */}
      <div className="settings-stack">
        {supps.length === 0 ? (
          <EmptyState icon={Leaf} message="No supplements added yet. Mark a supplement as taken to add its nutrients to your daily totals." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {supps.map((s) => {
              const significantNutrients = Object.entries(s.nutrients_per_dose)
                .filter(([, v]) => v > 0)
                .slice(0, 5)
              return (
                <div key={s.id} className="glass" style={{ padding: '14px 16px', borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {s.is_active ? (
                    <button
                      type="button"
                      onClick={() => toggleLogMut.mutate({ id: s.id, taken: !s.taken_today })}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: s.taken_today ? 'var(--good)' : 'var(--fg-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                        transition: 'all 0.15s ease',
                      }}
                      title={s.taken_today ? "Mark as not taken today" : "Mark as taken today"}
                    >
                      {s.taken_today ? (
                        <CheckCircle2 size={18} style={{ filter: 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))' }} />
                      ) : (
                        <Circle size={18} />
                      )}
                    </button>
                  ) : (
                    <div style={{ width: 18, height: 18, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-quiet)', opacity: 0.3 }} title="Inactive supplement">
                      <Circle size={18} style={{ strokeDasharray: '2, 2' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>{s.name}</span>
                      <ActivePill active={s.is_active} />
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: significantNutrients.length ? 6 : 0 }}>
                      {s.dose && <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{s.dose}</span>}
                      {s.frequency && <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{s.frequency}</span>}
                    </div>
                    {significantNutrients.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {significantNutrients.map(([key, val]) => {
                          const field = SUPPLEMENT_NUTRIENT_FIELDS.find((f) => f.key === key)
                          return (
                            <span key={key} style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 99,
                              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                              color: 'var(--fg-quiet)',
                            }}>
                              {field?.label ?? key}: {val}{field?.unit ?? ''}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setModal(s)}
                      aria-label={`Edit ${s.name}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Delete ${s.name}?`)) deleteMut.mutate(s.id) }}
                      aria-label={`Delete ${s.name}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="health-action-btn-wrap">
          <button type="button" className="btn btn-primary health-action-btn" onClick={() => setModal('add')}>
            <Plus size={14} /> Add supplement
          </button>
        </div>
      </div>

      {/* Right column: Dynamic Aggregation */}
      <div className="settings-stack">
        <div className="glass settings-card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Taken Today</div>
          {aggregateEntries.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-quiet)', lineHeight: 1.5 }}>
              Nothing taken yet today. Mark a supplement as taken and its nutrients are aggregated here.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 12px' }}>
              {aggregateEntries.map(([key, val]) => {
                const field = SUPPLEMENT_NUTRIENT_FIELDS.find((f) => f.key === key)
                return (
                  <div key={key} className="glass-inset" style={{
                    padding: '8px 10px', borderRadius: 8,
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                    <span style={{ fontSize: 9, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {field?.label ?? key}
                    </span>
                    <span className="num" style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>
                      {val.toFixed(1).replace(/\.0$/, '')} <span style={{ fontSize: 11, color: 'var(--fg-tertiary)', fontWeight: 400 }}>{field?.unit ?? ''}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--glass-edge)', fontSize: 12, color: 'var(--fg-quiet)', lineHeight: 1.4 }}>
            Only supplements you mark as taken today are integrated into your daily totals in the Today dashboard.
          </div>
        </div>
      </div>

      {modal === 'add' && (
        <SupplementModal
          onSave={(data) => createMut.mutate(data)}
          onClose={() => setModal(null)}
          saving={createMut.isPending}
        />
      )}
      {modal && modal !== 'add' && (
        <SupplementModal
          initial={modal as Supplement}
          onSave={(data) => updateMut.mutate({ id: (modal as Supplement).id, ...data })}
          onClose={() => setModal(null)}
          saving={updateMut.isPending}
        />
      )}
    </div>
  )
}
