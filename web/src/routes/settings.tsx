import { useQuery } from '@tanstack/react-query'
import { api, User } from '../lib/api'

export default function SettingsRoute() {
  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me'),
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <h1 className="text-lg font-semibold text-slate-300">Settings</h1>

      <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 space-y-3">
        <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Account</p>
        {user ? (
          <>
            <Row label="Name" value={user.display_name} />
            <Row label="Email" value={user.email} />
            <Row label="Role" value={user.role} />
          </>
        ) : (
          <p className="text-sm text-slate-500">Not signed in</p>
        )}
      </div>

      <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
        <p className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-3">Goals</p>
        <p className="text-sm text-slate-500">Goal configuration coming in Phase 0 final polish.</p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  )
}
