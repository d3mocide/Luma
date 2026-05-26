import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles, Heart, ShieldCheck, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { LumaLogo, LumaWordmark } from './ui/LumaLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

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
        await api.post('/auth/setup', { email, password, display_name: displayName || 'Operator' })
      } else {
        await api.post('/auth/login', { email, password })
      }
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
      <div className="luma-bg" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '2px solid rgba(56,189,248,0.2)', borderTopColor: 'var(--sky-400)',
          animation: 'spin 0.8s linear infinite',
        }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const isSetup = setupStatus?.setup_required

  return (
    <div className="luma-bg luma-bg-dawn" style={{ position: 'fixed', inset: 0, display: 'flex', overflow: 'hidden' }}>

      {/* Left — brand story (desktop only) */}
      <div className="hidden md:flex" style={{
        flex: 1.05,
        padding: '60px 60px 40px',
        flexDirection: 'column',
        position: 'relative',
      }}>
        <LumaWordmark size={32}/>

        <div style={{ marginTop: 'auto', maxWidth: 540 }}>
          <div className="eyebrow" style={{ marginBottom: 20, color: 'var(--sky-300)' }}>
            Your light, daily
          </div>
          <h1 style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 400,
            fontSize: 64, lineHeight: 1.02,
            letterSpacing: '-0.035em',
            margin: 0,
            color: 'var(--fg-primary)',
          }}>
            {isSetup ? (
              <>Create your<br/><span className="serif-italic gradient-accent-text" style={{
                background: 'linear-gradient(120deg, var(--sun-200), var(--sky-300) 48%, var(--sky-500))',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                fontSize: 72,
                }}>private</span><br/>space.</>
            ) : (
              <>Track your body<br/>with{' '}
                <span className="serif-italic gradient-accent-text" style={{
                  background: 'linear-gradient(120deg, var(--sun-200), var(--sky-300) 48%, var(--sky-500))',
                  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                  fontSize: 72,
                }}>luminous</span><br/>clarity.</>
            )}
          </h1>
          <p style={{
            color: 'var(--fg-tertiary)',
            fontSize: 17, lineHeight: 1.6,
            marginTop: 28, maxWidth: 460,
          }}>
            A calm, self-hosted health companion. Your data stays on your hardware —
            insight, not surveillance.
          </p>

          <div style={{
            marginTop: 56,
            display: 'flex', gap: 28,
            paddingTop: 28,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[
              { Icon: ShieldCheck, l: 'Self-hosted', s: 'on your hardware' },
              { Icon: Heart, l: 'LDL-aware', s: 'tuned for cardio health' },
              { Icon: Sparkles, l: 'AI-powered', s: 'gentle, not preachy' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'rgba(56,189,248,0.12)',
                  border: '1px solid rgba(56,189,248,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--sky-300)', flexShrink: 0,
                }}>
                  <f.Icon size={15}/>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-primary)' }}>{f.l}</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>{f.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — sign-in card */}
      <div style={{
        flex: 1,
        padding: '60px 60px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}
      className="flex-1 flex items-center justify-center px-6 py-10 md:p-[60px]"
      >
        <div
          className="login-side-atmo"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        />

        <div className="glass login-glass" style={{
          width: '100%', maxWidth: 420,
          padding: 36,
          borderRadius: 28,
          position: 'relative',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex' }}><LumaLogo size={44}/></div>
            <h2 style={{
              margin: '18px 0 6px',
              fontSize: 24, fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'var(--fg-primary)',
            }}>
              {isSetup ? 'Create your account' : 'Welcome back'}
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-tertiary)' }}>
              {isSetup ? 'Set up your operator account' : 'Sign in to your private space'}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {error && (
              <div style={{
                padding: '12px 14px',
                background: 'rgba(251,113,133,0.10)',
                border: '1px solid rgba(251,113,133,0.25)',
                borderRadius: 12,
                fontSize: 13,
                color: 'var(--bad)',
                display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <AlertCircle size={14} strokeWidth={1.5}/> {error}
              </div>
            )}

            {isSetup && (
              <Field
                label="Display Name"
                icon={<Sparkles size={16} color="var(--fg-quiet)"/>}
                value={displayName}
                onChange={setDisplayName}
                placeholder="e.g. Jules"
              />
            )}

            <Field
              label="Email"
              icon={<Mail size={16} color="var(--fg-quiet)"/>}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="operator@luma.local"
              required
            />

            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Password</div>
              <div className="field-input" style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                border: '1px solid var(--glass-edge)',
                borderRadius: 14,
              }}>
                <Lock size={16} color="var(--fg-quiet)"/>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  {showPassword
                    ? <EyeOff size={16} color="var(--fg-quiet)"/>
                    : <Eye size={16} color="var(--fg-quiet)"/>
                  }
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ marginTop: 8, padding: '14px 20px', fontSize: 14, width: '100%', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? (
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--fg-primary)',
                  display: 'inline-block',
                  animation: 'spin 0.8s linear infinite',
                }}/>
              ) : (
                <>
                  {isSetup ? 'Create Account' : 'Sign in'}
                  <ArrowRight size={15}/>
                </>
              )}
            </button>
          </form>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 18px',
          }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }}/>
            <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }}/>
          </div>

          <button className="btn" style={{ width: '100%', padding: '12px', justifyContent: 'center' }}>
            <Sparkles size={16} color="var(--sky-300)"/>
            Continue with passkey
          </button>

          <p style={{
            textAlign: 'center', fontSize: 11.5,
            color: 'var(--fg-quiet)', marginTop: 22,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--good)', boxShadow: '0 0 8px var(--good-glow)',
              }}/>
              Self-hosted
            </span>
            <span style={{ color: 'var(--fg-faint)' }}>·</span>
            <span>End-to-end secure</span>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Field({
  label, icon, type = 'text', value, onChange, placeholder, required,
}: {
  label: string
  icon: React.ReactNode
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="field-input" style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        border: '1px solid var(--glass-edge)',
        borderRadius: 14,
      }}>
        {icon}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--fg-primary)', fontFamily: 'var(--font-sans)', fontSize: 14,
          }}
        />
      </div>
    </div>
  )
}
