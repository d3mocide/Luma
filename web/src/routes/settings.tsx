import { useQuery } from '@tanstack/react-query'
import { api, User } from '../lib/api'

export default function SettingsRoute() {
  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
  })

  return (
    <div className="thin-scroll" style={{ height: '100%', overflowY: 'auto', padding: '32px 40px 40px' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Settings</div>
      <h1 style={{ margin: '0 0 28px', fontSize: 32, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--fg-primary)' }}>
        Your account
      </h1>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="glass" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Account</div>
          {user ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Row label="Name" value={user.display_name}/>
              <Row label="Email" value={user.email}/>
              <Row label="Role" value={user.role} last/>
            </div>
          ) : (
            <p style={{ color: 'var(--fg-quiet)', fontSize: 14, margin: 0 }}>Not signed in</p>
          )}
        </div>

        <div className="glass" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Goals</div>
          <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
            Goal configuration coming in Phase 0 final polish.
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0',
      borderBottom: last ? 'none' : '1px solid var(--glass-edge)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--fg-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{value}</span>
    </div>
  )
}
