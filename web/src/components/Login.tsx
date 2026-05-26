import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  // 1. Fetch setup status to determine if we show "First-Run Setup" or "Sign In"
  const { data: setupStatus, isLoading: checkingSetup } = useQuery<{ setup_required: boolean }>({
    queryKey: ['setupStatus'],
    queryFn: () => api.get('/auth/setup-status'),
    retry: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const isSetup = setupStatus?.setup_required

    try {
      if (isSetup) {
        // First-run setup: Create user
        await api.post('/auth/setup', {
          email,
          password,
          display_name: displayName || 'Operator',
        })
      } else {
        // Standard login
        await api.post('/auth/login', { email, password })
      }

      // Invalidate queries to refresh auth context and telemetry metrics
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      await queryClient.invalidateQueries({ queryKey: ['today'] })
      await queryClient.invalidateQueries({ queryKey: ['setupStatus'] })
    } catch (err: any) {
      setError(err?.message ?? (isSetup ? 'Failed to complete setup.' : 'Invalid email or password.'))
    } finally {
      setLoading(false)
    }
  }

  if (checkingSetup) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-50">
        <span className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    )
  }

  const isSetupRequired = setupStatus?.setup_required

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col justify-center items-center p-4 z-50 overflow-y-auto">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md backdrop-blur-md bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8 shadow-2xl relative">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-indigo-400 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-3">
            <span className="text-2xl text-white font-semibold">◎</span>
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
            {isSetupRequired ? 'Create Operator Account' : 'Welcome to Luma'}
          </h2>
          <p className="text-xs text-slate-500 mt-1.5 text-center">
            {isSetupRequired
              ? 'Luma detected first run. Set up your operator account to start health telemetry.'
              : 'Your self-hosted health and nutrition command center'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-rose-950/40 border border-rose-900/60 text-rose-300 px-4 py-3 rounded-2xl text-xs flex items-center gap-2 animate-shake">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {isSetupRequired && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Jules"
                required={isSetupRequired}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isSetupRequired ? "e.g. operator@domain.com" : "e.g. admin@luma.health"}
              required
              className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium text-sm py-3 px-4 rounded-2xl transition-all duration-150 transform active:scale-[0.98] shadow-lg shadow-indigo-500/20 mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isSetupRequired ? (
              'Create Account'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800/60 text-center">
          <p className="text-[11px] text-slate-600">
            Self-hosted &middot; Luma &middot; Secure
          </p>
        </div>
      </div>
    </div>
  )
}
