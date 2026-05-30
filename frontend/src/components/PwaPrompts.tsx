import { useEffect, useState } from 'react'
import { Download, WifiOff, X } from 'lucide-react'

// Stale banner: shown when online status changes (offline → serving cached data)
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (!offline) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'rgba(251,113,133,0.15)', backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(251,113,133,0.3)',
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontSize: 13, color: 'var(--bad)',
    }}>
      <WifiOff size={13}/>
      You're offline — showing cached data
    </div>
  )
}

// Install prompt: shown on mobile after 3rd visit, deferred
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const VISIT_KEY = 'luma_visit_count'
const DISMISSED_KEY = 'luma_install_dismissed'

export function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Track visits
    const count = parseInt(localStorage.getItem(VISIT_KEY) ?? '0', 10) + 1
    localStorage.setItem(VISIT_KEY, String(count))

    const dismissed = localStorage.getItem(DISMISSED_KEY) === '1'
    if (dismissed) return

    // Only show on mobile-ish screens after 3+ visits
    const isMobile = window.innerWidth < 768
    if (!isMobile || count < 3) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') setShow(false)
  }

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 9998,
      maxWidth: 400, margin: '0 auto',
    }}>
      <div className="glass" style={{
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
        borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(56,189,248,0.3), rgba(167,139,250,0.2))',
          border: '1px solid rgba(56,189,248,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Download size={18} color="var(--sky-400)"/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)' }}>Add Luma to Home Screen</div>
          <div style={{ fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 2 }}>Works offline, loads instantly</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={install}>
            Install
          </button>
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={dismiss}>
            <X size={14}/>
          </button>
        </div>
      </div>
    </div>
  )
}
