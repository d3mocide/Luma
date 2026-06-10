import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  Pill, Leaf, ShieldAlert, Plus, Trash2, Pencil, X, AlertTriangle, Info,
  ChevronRight, FlaskConical, Settings,
} from 'lucide-react'
import { api } from '../lib/api'
import { NavLink } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Medication {
  id: string
  name: string
  generic_name: string | null
  dose: string | null
  frequency: string | null
  notes: string | null
  is_active: boolean
  created_at: string
}

interface Supplement {
  id: string
  name: string
  dose: string | null
  frequency: string | null
  nutrients_per_dose: Record<string, number>
  is_active: boolean
  created_at: string
}

interface InteractionAlert {
  rule_id: string
  severity: 'high' | 'medium' | 'low'
  title: string
  message: string
}

interface InteractionsResponse {
  alerts: InteractionAlert[]
  checked_at: string
  medications_checked: number
  meal_events_today: number
}

interface LdlSimResult {
  baseline_ldl: number | null
  projected_ldl: number
  delta_ldl: number
  current_avg_sat_fat_pct: number
  current_avg_soluble_fiber_g: number
  target_sat_fat_pct: number
  target_soluble_fiber_g: number
  trajectory: { week: number; ldl: number }[]
  weeks: number
  note: string
}

// ---------------------------------------------------------------------------
// Supplement nutrient fields (subset meaningful for supplements)
// ---------------------------------------------------------------------------

const SUPPLEMENT_NUTRIENT_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'calories',              label: 'Calories',         unit: 'kcal' },
  { key: 'protein_g',             label: 'Protein',          unit: 'g'    },
  { key: 'fat_g',                 label: 'Total Fat',        unit: 'g'    },
  { key: 'saturated_fat_g',       label: 'Saturated Fat',    unit: 'g'    },
  { key: 'polyunsaturated_fat_g', label: 'Poly Fat (Ω-3/6)', unit: 'g'    },
  { key: 'carbohydrates_g',       label: 'Carbohydrates',    unit: 'g'    },
  { key: 'fiber_g',               label: 'Fiber',            unit: 'g'    },
  { key: 'soluble_fiber_g',       label: 'Soluble Fiber',    unit: 'g'    },
  { key: 'vitamin_a_mcg',         label: 'Vitamin A',        unit: 'mcg'  },
  { key: 'vitamin_c_mg',          label: 'Vitamin C',        unit: 'mg'   },
  { key: 'vitamin_d_mcg',         label: 'Vitamin D',        unit: 'mcg'  },
  { key: 'vitamin_e_mg',          label: 'Vitamin E',        unit: 'mg'   },
  { key: 'vitamin_k_mcg',         label: 'Vitamin K',        unit: 'mcg'  },
  { key: 'vitamin_b12_mcg',       label: 'Vitamin B12',      unit: 'mcg'  },
  { key: 'folate_mcg',            label: 'Folate',           unit: 'mcg'  },
  { key: 'calcium_mg',            label: 'Calcium',          unit: 'mg'   },
  { key: 'iron_mg',               label: 'Iron',             unit: 'mg'   },
  { key: 'magnesium_mg',          label: 'Magnesium',        unit: 'mg'   },
  { key: 'zinc_mg',               label: 'Zinc',             unit: 'mg'   },
  { key: 'selenium_mcg',          label: 'Selenium',         unit: 'mcg'  },
]

// ---------------------------------------------------------------------------
// Common supplement presets
// ---------------------------------------------------------------------------

const SUPPLEMENT_PRESETS: { label: string; nutrients: Record<string, number> }[] = [
  { label: 'Fish Oil 1000 mg', nutrients: { polyunsaturated_fat_g: 0.6, fat_g: 1.0, calories: 9 } },
  { label: 'Vitamin D 1000 IU', nutrients: { vitamin_d_mcg: 25 } },
  { label: 'Vitamin D 2000 IU', nutrients: { vitamin_d_mcg: 50 } },
  { label: 'Magnesium 200 mg', nutrients: { magnesium_mg: 200 } },
  { label: 'Zinc 15 mg', nutrients: { zinc_mg: 15 } },
  { label: 'Vitamin C 500 mg', nutrients: { vitamin_c_mg: 500 } },
  { label: 'Fiber supplement 5 g', nutrients: { fiber_g: 5, soluble_fiber_g: 3.5 } },
  { label: 'B12 1000 mcg', nutrients: { vitamin_b12_mcg: 1000 } },
  { label: 'Iron 18 mg', nutrients: { iron_mg: 18 } },
  { label: 'Calcium 500 mg', nutrients: { calcium_mg: 500, vitamin_d_mcg: 6.25 } },
]

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityColor(sev: string) {
  if (sev === 'high')   return 'var(--bad)'
  if (sev === 'medium') return 'var(--sun-400)'
  return 'var(--sky-300)'
}

function severityBg(sev: string) {
  if (sev === 'high')   return 'rgba(251,113,133,0.08)'
  if (sev === 'medium') return 'rgba(251,191,36,0.08)'
  return 'rgba(56,189,248,0.08)'
}

function SeverityIcon({ sev }: { sev: string }) {
  if (sev === 'high' || sev === 'medium')
    return <AlertTriangle size={16} strokeWidth={1.5} color={severityColor(sev)} />
  return <Info size={16} strokeWidth={1.5} color={severityColor(sev)} />
}

// ---------------------------------------------------------------------------
// Shared empty state
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      padding: '40px 24px', color: 'var(--fg-quiet)', textAlign: 'center',
    }}>
      <Icon size={28} strokeWidth={1.2} style={{ opacity: 0.4 }} />
      <span style={{ fontSize: 13, maxWidth: 240, lineHeight: 1.5 }}>{message}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Active/inactive pill
// ---------------------------------------------------------------------------

function ActivePill({ active }: { active: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
      padding: '2px 7px', borderRadius: 99,
      background: active ? 'rgba(52,211,153,0.14)' : 'rgba(255,255,255,0.06)',
      color: active ? 'var(--good)' : 'var(--fg-quiet)',
      border: `1px solid ${active ? 'rgba(52,211,153,0.25)' : 'transparent'}`,
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Medication modal
// ---------------------------------------------------------------------------

function MedicationModal({
  initial,
  onSave,
  onClose,
  saving,
}: {
  initial?: Partial<Medication>
  onSave: (data: Omit<Medication, 'id' | 'created_at'>) => void
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    generic_name: initial?.generic_name ?? '',
    dose: initial?.dose ?? '',
    frequency: initial?.frequency ?? '',
    notes: initial?.notes ?? '',
    is_active: initial?.is_active ?? true,
  })

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

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
      <div className="glass" style={{ maxWidth: 420, width: '100%', padding: 28, borderRadius: 20 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg-primary)' }}>
            {initial?.id ? 'Edit medication' : 'Add medication'}
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalField label="Brand name *" value={form.name} onChange={(v) => set('name', v)} placeholder="e.g. Lipitor" />
          <ModalField label="Generic name" value={form.generic_name} onChange={(v) => set('generic_name', v)} placeholder="e.g. atorvastatin" />
          <ModalField label="Dose" value={form.dose} onChange={(v) => set('dose', v)} placeholder="e.g. 20 mg" />
          <ModalField label="Frequency" value={form.frequency} onChange={(v) => set('frequency', v)} placeholder="e.g. once daily at bedtime" />
          <ModalField label="Notes" value={form.notes} onChange={(v) => set('notes', v)} placeholder="Optional notes" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="med-active" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} style={{ cursor: 'pointer' }} />
            <label htmlFor="med-active" style={{ fontSize: 13, color: 'var(--fg-secondary)', cursor: 'pointer' }}>Currently taking (active)</label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 2, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}
            disabled={saving || !form.name.trim()}
            onClick={() => onSave({ ...form, generic_name: form.generic_name || null, dose: form.dose || null, frequency: form.frequency || null, notes: form.notes || null })}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
      <div className="glass" style={{ maxWidth: 480, width: '100%', padding: 28, borderRadius: 20, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
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
          <ModalField label="Dose" value={form.dose} onChange={(v) => set('dose', v)} placeholder="e.g. 1000 mg" />
          <ModalField label="Frequency" value={form.frequency} onChange={(v) => set('frequency', v)} placeholder="e.g. daily with breakfast" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="supp-active" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} style={{ cursor: 'pointer' }} />
            <label htmlFor="supp-active" style={{ fontSize: 13, color: 'var(--fg-secondary)', cursor: 'pointer' }}>Currently taking (active)</label>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--glass-edge)', margin: '20px 0' }} />

        <div className="eyebrow" style={{ marginBottom: 12, fontSize: 9 }}>Nutrients per dose</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          {SUPPLEMENT_NUTRIENT_FIELDS.map(({ key, label, unit }) => (
            <div key={key}>
              <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginBottom: 4 }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.nutrients[key] || ''}
                  onChange={(e) => setNutrient(key, e.target.value)}
                  placeholder="0"
                  style={{
                    flex: 1, padding: '6px 8px', borderRadius: 8,
                    background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
                    color: 'var(--fg-primary)', fontSize: 13, minWidth: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)', flexShrink: 0 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

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

function ModalField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6, fontSize: 9 }}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 10,
          background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
          color: 'var(--fg-primary)', fontSize: 13, boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Medications tab
// ---------------------------------------------------------------------------

function MedicationsTab() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'add' | Medication | null>(null)

  const { data: meds = [], isLoading } = useQuery<Medication[]>({
    queryKey: ['health', 'medications'],
    queryFn: () => api.get('/health/medications'),
  })

  const createMut = useMutation({
    mutationFn: (body: unknown) => api.post('/health/medications', body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['health', 'medications'] }); setModal(null) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch(`/health/medications/${id}`, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['health', 'medications'] }); void qc.invalidateQueries({ queryKey: ['health', 'interactions'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/health/medications/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['health', 'medications'] }); void qc.invalidateQueries({ queryKey: ['health', 'interactions'] }) },
  })

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-quiet)', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button type="button" className="btn btn-primary" style={{ gap: 6 }} onClick={() => setModal('add')}>
          <Plus size={14} /> Add medication
        </button>
      </div>

      {meds.length === 0 ? (
        <EmptyState icon={Pill} message="No medications added yet. Add your medications to enable interaction checking." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {meds.map((med) => (
            <div key={med.id} className="glass" style={{ padding: '14px 16px', borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>{med.name}</span>
                  {med.generic_name && (
                    <span style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>({med.generic_name})</span>
                  )}
                  <ActivePill active={med.is_active} />
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {med.dose && <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{med.dose}</span>}
                  {med.frequency && <span style={{ fontSize: 12, color: 'var(--fg-tertiary)' }}>{med.frequency}</span>}
                </div>
                {med.notes && <div style={{ fontSize: 12, color: 'var(--fg-quiet)', marginTop: 4 }}>{med.notes}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setModal(med)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Delete ${med.name}?`)) deleteMut.mutate(med.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'add' && (
        <MedicationModal
          onSave={(data) => createMut.mutate(data)}
          onClose={() => setModal(null)}
          saving={createMut.isPending}
        />
      )}
      {modal && modal !== 'add' && (
        <MedicationModal
          initial={modal}
          onSave={(data) => updateMut.mutate({ id: (modal as Medication).id, ...data })}
          onClose={() => setModal(null)}
          saving={updateMut.isPending}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Supplements tab
// ---------------------------------------------------------------------------

function SupplementsTab() {
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

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-quiet)', fontSize: 13 }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button type="button" className="btn btn-primary" style={{ gap: 6 }} onClick={() => setModal('add')}>
          <Plus size={14} /> Add supplement
        </button>
      </div>

      {supps.length === 0 ? (
        <EmptyState icon={Leaf} message="No supplements added yet. Supplement nutrients are automatically added to your daily totals." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {supps.map((s) => {
            const significantNutrients = Object.entries(s.nutrients_per_dose)
              .filter(([, v]) => v > 0)
              .slice(0, 5)
            return (
              <div key={s.id} className="glass" style={{ padding: '14px 16px', borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Delete ${s.name}?`)) deleteMut.mutate(s.id) }}
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

// ---------------------------------------------------------------------------
// Interactions tab
// ---------------------------------------------------------------------------

function InteractionsTab() {
  const { data, isLoading, error } = useQuery<InteractionsResponse>({
    queryKey: ['health', 'interactions'],
    queryFn: () => api.get('/health/interactions'),
    refetchOnWindowFocus: true,
  })

  const { data: meds = [] } = useQuery<Medication[]>({
    queryKey: ['health', 'medications'],
    queryFn: () => api.get('/health/medications'),
  })

  const activeMeds = meds.filter((m) => m.is_active)

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-quiet)', fontSize: 13 }}>Checking interactions…</div>
  if (error) return <div style={{ padding: 24, color: 'var(--bad)', fontSize: 13 }}>Failed to check interactions.</div>

  if (activeMeds.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 24px', textAlign: 'center' }}>
        <ShieldAlert size={28} strokeWidth={1.2} style={{ opacity: 0.4, color: 'var(--fg-quiet)' }} />
        <span style={{ fontSize: 13, color: 'var(--fg-quiet)', maxWidth: 260, lineHeight: 1.5 }}>
          Add medications in the Medications tab to enable interaction checking.
        </span>
        <ChevronRight size={14} style={{ color: 'var(--fg-quiet)', opacity: 0.5 }} />
      </div>
    )
  }

  const alerts = data?.alerts ?? []

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
        padding: '10px 14px', borderRadius: 12,
        background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-edge)',
      }}>
        <Info size={13} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: 'var(--fg-quiet)', lineHeight: 1.4 }}>
          Checked {data?.medications_checked ?? activeMeds.length} medication{activeMeds.length !== 1 ? 's' : ''} against {data?.meal_events_today ?? 0} meal event{data?.meal_events_today !== 1 ? 's' : ''} logged today. Rules run locally — no data leaves your instance.
        </span>
      </div>

      {alerts.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 24px', textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.2)',
          }}>
            <ShieldAlert size={22} strokeWidth={1.5} color="var(--good)" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>No interactions flagged</span>
          <span style={{ fontSize: 13, color: 'var(--fg-quiet)', maxWidth: 260, lineHeight: 1.5 }}>
            Today's meals look clear based on your medication list.
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map((alert) => (
            <div key={alert.rule_id} style={{
              padding: '14px 16px', borderRadius: 14,
              background: severityBg(alert.severity),
              border: `1px solid ${severityColor(alert.severity)}33`,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, marginTop: 1 }}>
                  <SeverityIcon sev={alert.severity} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: severityColor(alert.severity), marginBottom: 4 }}>
                    {alert.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                    {alert.message}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LDL Simulator
// ---------------------------------------------------------------------------

function LdlSimulator() {
  const { data: goals } = useQuery<{ current_ldl_mg_dl?: number | null; target_ldl_mg_dl?: number | null }>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals'),
  })

  const [satFatPct, setSatFatPct] = useState(8)
  const [fiberG, setFiberG] = useState(10)
  const [simResult, setSimResult] = useState<LdlSimResult | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const simulateMut = useMutation({
    mutationFn: (body: { target_sat_fat_pct: number; target_soluble_fiber_g: number; weeks: number }) =>
      api.post<LdlSimResult>('/health/ldl-simulate', body),
    onSuccess: (data) => { setSimResult(data); setSimError(null) },
    onError: (err: Error) => setSimError(err.message),
  })

  const hasLdl = goals?.current_ldl_mg_dl != null

  if (!hasLdl) {
    return (
      <div className="glass" style={{ padding: '20px 22px', borderRadius: 18, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <FlaskConical size={16} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>LDL Simulator</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-quiet)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Set your current LDL in Settings to unlock the dietary impact simulator.
        </p>
        <NavLink
          to="/settings"
          className="btn"
          style={{ display: 'inline-flex', gap: 6, fontSize: 13 }}
        >
          <Settings size={13} /> Open settings
        </NavLink>
      </div>
    )
  }

  const targetLdl = goals?.target_ldl_mg_dl
  const currentLdl = goals.current_ldl_mg_dl!

  return (
    <div className="glass" style={{ padding: '20px 22px', borderRadius: 18, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <FlaskConical size={16} strokeWidth={1.5} style={{ color: 'var(--sky-300)' }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>LDL Simulator</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: '4px 0 20px', lineHeight: 1.4 }}>
        Adjust dietary targets and project estimated LDL change over 8 weeks using the Mensink-Katan equation.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
        <SliderField
          label="Target saturated fat"
          value={satFatPct}
          min={3}
          max={20}
          step={0.5}
          unit="% of calories"
          onChange={setSatFatPct}
          hint="AHA recommends <7% for LDL lowering"
        />
        <SliderField
          label="Target soluble fiber"
          value={fiberG}
          min={1}
          max={30}
          step={0.5}
          unit="g / day"
          onChange={setFiberG}
          hint="10–20 g/day lowers LDL by 7–14 mg/dL"
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
        disabled={simulateMut.isPending}
        onClick={() => simulateMut.mutate({ target_sat_fat_pct: satFatPct, target_soluble_fiber_g: fiberG, weeks: 8 })}
      >
        {simulateMut.isPending ? 'Simulating…' : 'Run simulation'}
      </button>

      {simError && (
        <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12 }}>{simError}</div>
      )}

      {simResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill label="Current LDL" value={`${currentLdl} mg/dL`} />
            <StatPill
              label="Projected (8 wk)"
              value={`${simResult.projected_ldl} mg/dL`}
              accent={simResult.delta_ldl < 0 ? 'good' : simResult.delta_ldl > 0 ? 'bad' : undefined}
            />
            <StatPill
              label="Change"
              value={`${simResult.delta_ldl > 0 ? '+' : ''}${simResult.delta_ldl} mg/dL`}
              accent={simResult.delta_ldl < 0 ? 'good' : simResult.delta_ldl > 0 ? 'bad' : undefined}
            />
          </div>

          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simResult.trajectory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="week"
                  tickFormatter={(v) => v === 0 ? 'Now' : `W${v}`}
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-2)', border: '1px solid var(--glass-edge)',
                    borderRadius: 10, fontSize: 12, color: 'var(--fg-primary)',
                  }}
                  formatter={(v: number) => [`${v} mg/dL`, 'LDL']}
                  labelFormatter={(l: number) => l === 0 ? 'Now' : `Week ${l}`}
                />
                {targetLdl && (
                  <ReferenceLine
                    y={targetLdl}
                    stroke="var(--good)"
                    strokeDasharray="4 4"
                    label={{ value: `Target ${targetLdl}`, position: 'right', fontSize: 10, fill: 'var(--good)' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="ldl"
                  stroke="var(--sky-300)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--sky-300)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--fg-quiet)', flexWrap: 'wrap' }}>
            <span>Your recent avg: <strong style={{ color: 'var(--fg-secondary)' }}>{simResult.current_avg_sat_fat_pct}% sat fat</strong></span>
            <span>·</span>
            <span><strong style={{ color: 'var(--fg-secondary)' }}>{simResult.current_avg_soluble_fiber_g}g</strong> sol. fiber</span>
          </div>

          <p style={{ fontSize: 11, color: 'var(--fg-quiet)', margin: 0, lineHeight: 1.4 }}>{simResult.note}</p>
        </div>
      )}
    </div>
  )
}

function SliderField({ label, value, min, max, step, unit, onChange, hint }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--fg-secondary)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}>
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', cursor: 'pointer' }}
      />
      {hint && <div style={{ fontSize: 11, color: 'var(--fg-quiet)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: 'good' | 'bad' }) {
  const color = accent === 'good' ? 'var(--good)' : accent === 'bad' ? 'var(--bad)' : 'var(--fg-primary)'
  return (
    <div style={{
      flex: 1, padding: '10px 12px', borderRadius: 12,
      background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main route
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'medications',  label: 'Medications',  Icon: Pill       },
  { id: 'supplements',  label: 'Supplements',  Icon: Leaf       },
  { id: 'interactions', label: 'Interactions', Icon: ShieldAlert },
] as const

type TabId = typeof TABS[number]['id']

export default function HealthRoute() {
  const [tab, setTab] = useState<TabId>('medications')

  return (
    <div style={{ padding: '20px 20px 120px', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
          Health
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-quiet)' }}>
          Medications, supplements, and interaction checking
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        background: 'var(--glass-1)', borderRadius: 14, padding: 4,
        border: '1px solid var(--glass-edge)',
      }}>
        {TABS.map(({ id, label, Icon }) => {
          const isActive = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 6px', borderRadius: 10, cursor: 'pointer', border: 'none',
                background: isActive ? 'linear-gradient(90deg, rgba(56,189,248,0.18), rgba(56,189,248,0.06))' : 'transparent',
                color: isActive ? 'var(--sky-300)' : 'var(--fg-quiet)',
                fontWeight: isActive ? 500 : 400, fontSize: 13,
                transition: 'all 150ms ease-out',
                boxShadow: isActive ? 'inset 0 0 0 1px rgba(56,189,248,0.2)' : 'none',
              }}
            >
              <Icon size={14} strokeWidth={1.5} />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'medications'  && <MedicationsTab />}
      {tab === 'supplements'  && <SupplementsTab />}
      {tab === 'interactions' && <InteractionsTab />}

      {/* LDL Simulator — always visible below tabs */}
      <LdlSimulator />
    </div>
  )
}
