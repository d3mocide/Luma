import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api'
export function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [validationError, setValidationError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const passwordMutation = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: () => {
      setSuccessMessage('Password updated successfully.')
      setValidationError(null)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      window.setTimeout(() => setSuccessMessage(null), 4000)
    },
    onError: (err: Error) => {
      setValidationError(err.message || 'Failed to update password. Please try again.')
      setSuccessMessage(null)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    setSuccessMessage(null)

    if (!currentPassword) {
      setValidationError('Please enter your current password.')
      return
    }
    if (newPassword.length < 8) {
      setValidationError('New password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setValidationError('New password and confirmation do not match.')
      return
    }

    passwordMutation.mutate()
  }

  const inputContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    border: '1px solid var(--glass-edge)',
    borderRadius: 14,
    background: 'var(--glass-1)',
    transition: 'border-color 0.2s',
  }

  const inputStyle = {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--fg-primary)',
    fontFamily: 'var(--font-sans)',
    fontSize: 14,
  }

  const toggleBtnStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    color: 'var(--fg-quiet)',
  }

  return (
    <div className="glass settings-card settings-card-spacious" style={{ padding: 24 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Password</div>
      <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: '0 0 18px' }}>
        Rotate your password to keep your private space secure.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {validationError && (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(251,113,133,0.10)',
            border: '1px solid rgba(251,113,133,0.25)',
            borderRadius: 12,
            fontSize: 13,
            color: 'var(--bad)',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <AlertCircle size={14} strokeWidth={1.5}/> {validationError}
          </div>
        )}

        {successMessage && (
          <div style={{
            padding: '12px 14px',
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 12,
            fontSize: 13,
            color: 'var(--fg-good, #34d399)',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <CheckCircle2 size={14} strokeWidth={1.5}/> {successMessage}
          </div>
        )}

        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>Current Password</label>
          <div style={inputContainerStyle} className="field-input">
            <Lock size={16} color="var(--fg-quiet)"/>
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              style={toggleBtnStyle}
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>New Password</label>
          <div style={inputContainerStyle} className="field-input">
            <ShieldCheck size={16} color="var(--fg-quiet)"/>
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              style={inputStyle}
              required
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              style={toggleBtnStyle}
              aria-label={showNew ? 'Hide password' : 'Show password'}
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8, fontSize: 10 }}>Confirm New Password</label>
          <div style={inputContainerStyle} className="field-input">
            <ShieldCheck size={16} color="var(--fg-quiet)"/>
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              style={toggleBtnStyle}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={passwordMutation.isPending}
          style={{
            marginTop: 8,
            padding: '12px 20px',
            fontSize: 14,
            justifyContent: 'center',
            opacity: passwordMutation.isPending ? 0.7 : 1,
            width: '100%',
          }}
        >
          {passwordMutation.isPending ? (
            <span style={{
              width: 18, height: 18, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'var(--fg-primary)',
              display: 'inline-block',
              animation: 'spin 0.8s linear infinite',
            }}/>
          ) : 'Update password'}
        </button>
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
