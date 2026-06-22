import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import {
  Pill, Leaf, ShieldAlert, Plus, Trash2, Pencil, X, AlertTriangle, Info,
  FlaskConical, Settings, TrendingDown, Dumbbell, CheckCircle2, Circle, ChevronDown,
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
  taken_today?: boolean
}

interface Supplement {
  id: string
  name: string
  dose: string | null
  frequency: string | null
  nutrients_per_dose: Record<string, number>
  is_active: boolean
  created_at: string
  taken_today?: boolean
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

interface WeightSimResult {
  current_weight_kg: number
  goal_weight_kg: number | null
  target_weekly_loss_kg: number
  required_daily_deficit_kcal: number
  suggested_daily_kcal: number | null
  trajectory: { week: number; kg: number }[]
  weeks_to_goal: number | null
  weeks: number
  note: string
}

interface ProteinSimResult {
  avg_protein_g: number | null
  target_protein_g: number | null
  body_weight_kg: number | null
  g_per_kg: number | null
  zone: 'low' | 'maintenance' | 'optimal' | 'above' | 'unknown'
  note: string
}

// ---------------------------------------------------------------------------
// Supplement nutrient fields (subset meaningful for supplements)
// ---------------------------------------------------------------------------

// Core macro-level fields shown by default. Sugar & sodium matter for gummy /
// chewable supplements, so they live alongside the other macros here.
const SUPPLEMENT_CORE_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'calories',              label: 'Calories',         unit: 'kcal' },
  { key: 'protein_g',             label: 'Protein',          unit: 'g'    },
  { key: 'fat_g',                 label: 'Total Fat',        unit: 'g'    },
  { key: 'saturated_fat_g',       label: 'Saturated Fat',    unit: 'g'    },
  { key: 'polyunsaturated_fat_g', label: 'Poly Fat (Ω-3/6)', unit: 'g'    },
  { key: 'carbohydrates_g',       label: 'Carbohydrates',    unit: 'g'    },
  { key: 'sugars_g',              label: 'Sugar',            unit: 'g'    },
  { key: 'fiber_g',               label: 'Fiber',            unit: 'g'    },
  { key: 'soluble_fiber_g',       label: 'Soluble Fiber',    unit: 'g'    },
  { key: 'sodium_mg',             label: 'Sodium',           unit: 'mg'   },
]

// Vitamins & minerals — tucked behind a toggle to keep the panel calm.
const SUPPLEMENT_MICRO_FIELDS: { key: string; label: string; unit: string }[] = [
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

const SUPPLEMENT_NUTRIENT_FIELDS = [...SUPPLEMENT_CORE_FIELDS, ...SUPPLEMENT_MICRO_FIELDS]

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
  { label: 'Multivitamin gummy (2)', nutrients: { calories: 15, carbohydrates_g: 4, sugars_g: 3, sodium_mg: 15, vitamin_c_mg: 30, vitamin_d_mcg: 10 } },
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

  const toggleLogMut = useMutation({
    mutationFn: ({ id, taken }: { id: string; taken: boolean }) => {
      if (taken) {
        return api.post(`/health/medications/${id}/log`)
      } else {
        return api.delete(`/health/medications/${id}/log`)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['health', 'medications'] })
      void qc.invalidateQueries({ queryKey: ['health', 'interactions'] })
    },
  })

  if (isLoading) return <div style={{ padding: 24, color: 'var(--fg-quiet)', fontSize: 13 }}>Loading…</div>

  return (
    <div className="health-grid">
      {/* Left column: List & Action */}
      <div className="settings-stack">
        {meds.length === 0 ? (
          <EmptyState icon={Pill} message="No medications added yet. Add your medications to enable interaction checking." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {meds.map((med) => (
              <div key={med.id} className="glass" style={{ padding: '14px 16px', borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {med.is_active ? (
                  <button
                    type="button"
                    onClick={() => toggleLogMut.mutate({ id: med.id, taken: !med.taken_today })}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: med.taken_today ? 'var(--good)' : 'var(--fg-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                      transition: 'all 0.15s ease',
                    }}
                    title={med.taken_today ? "Mark as not taken today" : "Mark as taken today"}
                  >
                    {med.taken_today ? (
                      <CheckCircle2 size={18} style={{ filter: 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.4))' }} />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>
                ) : (
                  <div style={{ width: 18, height: 18, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-quiet)', opacity: 0.3 }} title="Inactive medication">
                    <Circle size={18} style={{ strokeDasharray: '2, 2' }} />
                  </div>
                )}
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
                    aria-label={`Edit ${med.name}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`Delete ${med.name}?`)) deleteMut.mutate(med.id) }}
                    aria-label={`Delete ${med.name}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-quiet)', display: 'flex', padding: 4 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="health-action-btn-wrap">
          <button type="button" className="btn btn-primary health-action-btn" onClick={() => setModal('add')}>
            <Plus size={14} /> Add medication
          </button>
        </div>
      </div>

      {/* Right column: Summary & Clinical context */}
      <div className="settings-stack">
        <div className="glass settings-card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total tracked</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}>{meds.length}</div>
            </div>
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Active</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--good)', fontFamily: 'var(--font-mono)' }}>
                {meds.filter((m) => m.is_active).length}
              </div>
            </div>
          </div>
          
          <div className="eyebrow" style={{ marginBottom: 8 }}>Privacy & Sovereignty</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-quiet)', lineHeight: 1.5 }}>
            Your medication logs, schedules, and clinical notes are stored entirely on your self-hosted instance. No data is transmitted to external providers.
          </p>
        </div>
      </div>

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

  const alerts = data?.alerts ?? []

  return (
    <div className="health-grid">
      {/* Left column: Alerts list / Empty states */}
      <div className="settings-stack">
        {activeMeds.length === 0 ? (
          <div className="glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 24px', textAlign: 'center', borderRadius: 14 }}>
            <ShieldAlert size={28} strokeWidth={1.2} style={{ opacity: 0.4, color: 'var(--fg-quiet)' }} />
            <span style={{ fontSize: 13, color: 'var(--fg-quiet)', maxWidth: 260, lineHeight: 1.5 }}>
              Add and enable medications in the Medications tab to enable active interaction checking.
            </span>
          </div>
        ) : alerts.length === 0 ? (
          <div className="glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 24px', textAlign: 'center', borderRadius: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.2)',
            }}>
              <ShieldAlert size={22} strokeWidth={1.5} color="var(--good)" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>No interactions flagged</span>
            <span style={{ fontSize: 13, color: 'var(--fg-quiet)', maxWidth: 260, lineHeight: 1.5 }}>
              Today's meals look clear based on your active medication list.
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

      {/* Right column: Checked metrics & local rules info */}
      <div className="settings-stack">
        <div className="glass settings-card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Checking Status</div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Meds checked</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}>
                {data?.medications_checked ?? activeMeds.length}
              </div>
            </div>
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--glass-1)', border: '1px solid var(--glass-edge)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: 'var(--fg-quiet)', marginBottom: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Meals today</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg-primary)', fontFamily: 'var(--font-mono)' }}>
                {data?.meal_events_today ?? 0}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--glass-1)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--glass-edge)' }}>
            <Info size={14} strokeWidth={1.5} style={{ color: 'var(--fg-quiet)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--fg-quiet)', lineHeight: 1.4 }}>
              Interaction screening runs entirely within your browser and backend container. No health data is uploaded to third-party APIs.
            </span>
          </div>
        </div>

        <div className="glass settings-card" style={{ padding: 24, border: '1px solid rgba(251,191,36,0.2)' }}>
          <div className="eyebrow" style={{ marginBottom: 8, color: 'var(--sun-400)' }}>Clinical Guidance</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
            Luma helps you track adherence and screen for dietary interactions based on local rule engines. Always consult your primary care physician or pharmacist before starting, modifying, or terminating any drug regimen.
          </p>
        </div>
      </div>
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
      <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
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
    <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
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
// Weight loss simulator (Hall energy balance model)
// ---------------------------------------------------------------------------

function WeightLossSimulator() {
  const [lossRate, setLossRate] = useState(0.5)
  const [weeks, setWeeks] = useState(12)
  const [simResult, setSimResult] = useState<WeightSimResult | null>(null)
  const [simError, setSimError] = useState<string | null>(null)

  const simulateMut = useMutation({
    mutationFn: (body: { target_weekly_loss_kg: number; weeks: number }) =>
      api.post<WeightSimResult>('/health/weight-simulate', body),
    onSuccess: (data) => { setSimResult(data); setSimError(null) },
    onError: (err: Error) => {
      setSimError(
        err.message.includes('no_weight_data')
          ? 'No weight logged yet — add a weight entry to unlock this simulator.'
          : err.message
      )
    },
  })

  return (
    <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <TrendingDown size={16} strokeWidth={1.5} style={{ color: 'var(--good)' }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>Weight Loss</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: '4px 0 20px', lineHeight: 1.4 }}>
        Project your weight trajectory from a target weekly loss rate using the Hall energy balance model.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginBottom: 20 }}>
        <SliderField
          label="Target weekly loss"
          value={lossRate}
          min={0.25}
          max={1.0}
          step={0.05}
          unit="kg / week"
          onChange={setLossRate}
          hint="0.5 kg/week is the widely recommended sustainable rate"
        />
        <SliderField
          label="Projection window"
          value={weeks}
          min={4}
          max={52}
          step={4}
          unit="weeks"
          onChange={setWeeks}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
        disabled={simulateMut.isPending}
        onClick={() => simulateMut.mutate({ target_weekly_loss_kg: lossRate, weeks })}
      >
        {simulateMut.isPending ? 'Simulating…' : 'Run simulation'}
      </button>

      {simError && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 12 }}>{simError}</div>}

      {simResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill label="Current" value={`${simResult.current_weight_kg} kg`} />
            <StatPill
              label={`Week ${simResult.weeks}`}
              value={`${simResult.trajectory[simResult.trajectory.length - 1].kg} kg`}
              accent="good"
            />
            {simResult.weeks_to_goal != null && (
              <StatPill label="Weeks to goal" value={`${simResult.weeks_to_goal} wk`} />
            )}
          </div>

          {simResult.suggested_daily_kcal != null && (
            <div style={{
              fontSize: 12, color: 'var(--fg-quiet)',
              padding: '8px 12px', borderRadius: 10,
              background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
            }}>
              Required deficit: <strong style={{ color: 'var(--fg-secondary)' }}>{simResult.required_daily_deficit_kcal} kcal/day</strong>
              {' '}→ suggested daily calories: <strong style={{ color: 'var(--fg-secondary)' }}>{simResult.suggested_daily_kcal} kcal</strong>
            </div>
          )}

          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simResult.trajectory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="week"
                  tickFormatter={(v) => v === 0 ? 'Now' : `W${v}`}
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--fg-quiet)' }}
                  axisLine={false} tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--glass-edge)', borderRadius: 10, fontSize: 12, color: 'var(--fg-primary)' }}
                  formatter={(v: number) => [`${v} kg`, 'Weight']}
                  labelFormatter={(l: number) => l === 0 ? 'Now' : `Week ${l}`}
                />
                {simResult.goal_weight_kg != null && (
                  <ReferenceLine
                    y={simResult.goal_weight_kg}
                    stroke="var(--good)"
                    strokeDasharray="4 4"
                    label={{ value: `Goal ${simResult.goal_weight_kg} kg`, position: 'right', fontSize: 10, fill: 'var(--good)' }}
                  />
                )}
                <Line type="monotone" dataKey="kg" stroke="var(--good)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--good)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p style={{ fontSize: 11, color: 'var(--fg-quiet)', margin: 0, lineHeight: 1.4 }}>{simResult.note}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Protein adequacy simulator (ISSN zones)
// ---------------------------------------------------------------------------

const PROTEIN_ZONES = [
  { from: 0,   to: 1.2, color: 'rgba(251,113,133,0.5)',  label: 'Low'         },
  { from: 1.2, to: 1.6, color: 'rgba(251,191,36,0.5)',   label: 'Maintenance' },
  { from: 1.6, to: 2.2, color: 'rgba(52,211,153,0.55)',  label: 'Optimal'     },
  { from: 2.2, to: 3.0, color: 'rgba(56,189,248,0.45)',  label: 'Above'       },
]
const PROTEIN_BAR_MAX = 3.0

function ProteinZoneBar({ gPerKg }: { gPerKg: number | null }) {
  const pct = (v: number) => `${(v / PROTEIN_BAR_MAX) * 100}%`
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ position: 'relative', height: 10, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
        {PROTEIN_ZONES.map((z) => (
          <div key={z.from} style={{ position: 'absolute', left: pct(z.from), width: pct(z.to - z.from), top: 0, bottom: 0, background: z.color }} />
        ))}
        {gPerKg != null && (
          <div style={{
            position: 'absolute',
            left: pct(Math.min(gPerKg, PROTEIN_BAR_MAX)),
            top: -2, bottom: -2, width: 3,
            background: 'white', borderRadius: 2,
            transform: 'translateX(-50%)',
            boxShadow: '0 0 5px rgba(255,255,255,0.7)',
          }} />
        )}
      </div>
      <div style={{ position: 'relative', height: 16, marginTop: 3 }}>
        {[0, 1.2, 1.6, 2.2, 3.0].map((v) => (
          <span key={v} style={{ position: 'absolute', left: pct(v), transform: 'translateX(-50%)', fontSize: 9, color: 'var(--fg-quiet)' }}>
            {v}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {PROTEIN_ZONES.map((z) => (
          <div key={z.from} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: z.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--fg-quiet)' }}>{z.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProteinSimulator() {
  const { data, isLoading } = useQuery<ProteinSimResult>({
    queryKey: ['health', 'protein-sim'],
    queryFn: () => api.get('/health/protein-simulate'),
  })

  const zoneAccent: Record<string, 'good' | 'bad' | undefined> = {
    optimal: 'good', low: 'bad',
  }

  return (
    <div className="glass" style={{ padding: '20px 22px', borderRadius: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Dumbbell size={16} strokeWidth={1.5} style={{ color: 'var(--aurora-violet)' }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>Protein Adequacy</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-quiet)', margin: '4px 0 20px', lineHeight: 1.4 }}>
        7-day average protein intake plotted against muscle-synthesis zones, adjusted for body weight.
      </p>

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--fg-quiet)', padding: '12px 0' }}>Loading…</div>
      ) : data?.avg_protein_g == null ? (
        <EmptyState icon={Dumbbell} message="Log meals for at least one day to see your protein adequacy." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <StatPill label="7-day avg" value={`${data.avg_protein_g} g/day`} />
            {data.g_per_kg != null && (
              <StatPill label="Per kg bodyweight" value={`${data.g_per_kg} g/kg`} accent={zoneAccent[data.zone]} />
            )}
            {data.target_protein_g != null && (
              <StatPill label="Your target" value={`${data.target_protein_g} g/day`} />
            )}
          </div>

          <ProteinZoneBar gPerKg={data.g_per_kg} />

          <p style={{ fontSize: 11, color: 'var(--fg-quiet)', margin: 0, lineHeight: 1.4 }}>{data.note}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Simulations tab — wraps all three simulators
// ---------------------------------------------------------------------------

function SimulationsTab() {
  return (
    <div className="health-simulators-grid">
      <LdlSimulator />
      <WeightLossSimulator />
      <div className="health-simulators-protein-wrapper">
        <ProteinSimulator />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main route
// ---------------------------------------------------------------------------

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
