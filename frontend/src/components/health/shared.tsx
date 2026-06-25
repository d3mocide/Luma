import type { ElementType } from 'react'

// ---------------------------------------------------------------------------
// Shared empty state
// ---------------------------------------------------------------------------

export function EmptyState({ icon: Icon, message }: { icon: ElementType; message: string }) {
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

export function ActivePill({ active }: { active: boolean }) {
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

export function ModalField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
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
