import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pill, Plus, Trash2, Pencil, X, CheckCircle2, Circle } from 'lucide-react'
import { api } from '../../lib/api'
import type { Medication } from './types'
import { EmptyState, ActivePill, ModalField } from './shared'

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
// Medications tab
// ---------------------------------------------------------------------------

export function MedicationsTab() {
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
