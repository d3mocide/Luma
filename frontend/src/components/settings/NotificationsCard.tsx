import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

type NotifPrefs = {
  nudge_enabled: boolean
  nudge_hour: number
  nudge_tz: string
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12
  const period = i < 12 ? 'am' : 'pm'
  return { value: i, label: `${h}:00 ${period}` }
})

function swReady(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('_SW_TIMEOUT')), 30000)
    ),
  ])
}

export function NotificationsCard() {
  const queryClient = useQueryClient()
  const [subscribed, setSubscribed] = useState(false)
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default')
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [localTz, setLocalTz] = useState<string | null>(null)

  const { data: prefs } = useQuery<NotifPrefs>({
    queryKey: ['notifications', 'preferences'],
    queryFn: () => api.get('/notifications/preferences'),
  })

  const { data: vapidData } = useQuery<{ public_key: string }>({
    queryKey: ['notifications', 'vapid-key'],
    queryFn: () => api.get('/notifications/vapid-public-key'),
  })

  useEffect(() => {
    if (vapidData?.public_key) setVapidKey(vapidData.public_key)
  }, [vapidData])

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionState(Notification.permission)
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub))
      })
    }
    // Watch for OS-level permission changes so the UI updates without a reload.
    // On iOS, the user enables notifications via Settings → Notifications → Luma,
    // and this fires when they return to the app.
    let permStatus: PermissionStatus | null = null
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' as PermissionName }).then((status) => {
        permStatus = status
        status.addEventListener('change', () => {
          setPermissionState(
            status.state === 'granted' ? 'granted'
            : status.state === 'denied' ? 'denied'
            : 'default'
          )
        })
      }).catch(() => { /* permissions API not available on this platform */ })
    }
    return () => {
      // permStatus cleanup is best-effort; removing a listener on a GC'd object is a no-op
      permStatus?.removeEventListener('change', () => {})
    }
  }, [])

  const prefsMutation = useMutation({
    mutationFn: (update: NotifPrefs) => api.put('/notifications/preferences', update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] })
      setStatusMsg('Saved')
      setTimeout(() => setStatusMsg(null), 2000)
    },
  })

  const handleToggleSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatusMsg('Push notifications are not supported in this browser.')
      return
    }
    if (!vapidKey) {
      setStatusMsg('Push notifications are not configured on this server.')
      return
    }

    // Always re-read live permission on click — iOS persists this at the OS level
    // and it can differ from the last-read state without any page reload.
    const live = 'Notification' in window ? Notification.permission : 'denied'
    if (live !== permissionState) setPermissionState(live)
    if (live === 'denied') {
      setStatusMsg('Notifications are blocked. On iOS: Settings → Notifications → Luma → Allow, then return here.')
      return
    }

    // Give immediate feedback based on actual SW state rather than waiting silently
    const existingReg = await navigator.serviceWorker.getRegistration()
    if (!existingReg) {
      setStatusMsg('App is still setting up — wait a few seconds and try again.')
      return
    }
    if (existingReg.installing) {
      setStatusMsg('Installing in the background — wait a moment and try again.')
      return
    }
    if (existingReg.waiting && !existingReg.active) {
      setStatusMsg('Update pending — close the app fully, reopen it, and try again.')
      return
    }

    let reg: ServiceWorkerRegistration
    try {
      reg = await swReady()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setStatusMsg(msg === '_SW_TIMEOUT'
        ? 'Still loading — close the app fully, reopen it, wait a few seconds, then try again.'
        : `Service worker error: ${msg}`)
      return
    }

    if (subscribed) {
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const keys = sub.toJSON().keys ?? {}
        await api.post('/notifications/unsubscribe', {
          endpoint: sub.endpoint,
          p256dh: keys.p256dh ?? '',
          auth: keys.auth ?? '',
        })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      if (prefs) prefsMutation.mutate({ ...prefs, nudge_enabled: false })
      return
    }

    // live is 'default' or 'granted' here — we already returned if 'denied' above
    if (live === 'default') {
      const granted = await Notification.requestPermission()
      setPermissionState(granted)
      if (granted !== 'granted') {
        setStatusMsg('Notification permission denied. On iOS: Settings → Notifications → Luma → Allow.')
        return
      }
    }

    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const json = sub.toJSON()
      const keys = json.keys ?? {}
      await api.post('/notifications/subscribe', {
        endpoint: sub.endpoint,
        p256dh: keys.p256dh ?? '',
        auth: keys.auth ?? '',
        device_label: navigator.userAgent.slice(0, 80),
      })
      setSubscribed(true)
      if (prefs) prefsMutation.mutate({ ...prefs, nudge_enabled: true })
    } catch (err) {
      setStatusMsg(`Subscription failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const isPushSupported = 'PushManager' in window && 'serviceWorker' in navigator
  const isBlocked = permissionState === 'denied'

  return (
    <div className="glass settings-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Notifications</div>
        <p style={{ color: 'var(--fg-tertiary)', fontSize: 14, margin: 0 }}>
          Daily logging nudge and high-priority health alerts.
        </p>
      </div>

      {!isPushSupported && (
        <div style={{ padding: '12px 14px', background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.22)', borderRadius: 8, fontSize: 13, color: 'var(--bad)', marginBottom: 16 }}>
          Push notifications require installing Luma as a PWA on a supported device.
        </div>
      )}

      {isBlocked && (
        <div style={{ padding: '12px 14px', background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.22)', borderRadius: 8, fontSize: 13, color: 'var(--bad)', marginBottom: 16 }}>
          Notifications are blocked. On iOS: <strong>Settings → Notifications → Luma → Allow</strong>, then return here. On other browsers: check site permissions and reload.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid var(--glass-edge)', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)', marginBottom: 2 }}>Enable push notifications</div>
          <div style={{ fontSize: 12, color: 'var(--fg-quiet)' }}>
            {subscribed ? 'This device is subscribed.' : 'Subscribe this device to receive nudges and alerts.'}
          </div>
        </div>
        <button
          onClick={handleToggleSubscription}
          disabled={!isPushSupported}
          className="btn"
          style={{
            padding: '8px 16px',
            fontSize: 12,
            background: subscribed ? 'rgba(251,113,133,0.12)' : 'rgba(14,165,233,0.15)',
            color: subscribed ? 'var(--bad)' : 'var(--sky-400)',
            border: `1px solid ${subscribed ? 'rgba(251,113,133,0.3)' : 'rgba(14,165,233,0.3)'}`,
            opacity: !isPushSupported ? 0.4 : 1,
          }}
        >
          {subscribed ? 'Unsubscribe' : 'Subscribe'}
        </button>
      </div>

      {subscribed && prefs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--fg-secondary)', marginBottom: 2 }}>Daily logging nudge</div>
              <div style={{ fontSize: 11, color: 'var(--fg-quiet)' }}>If you haven't logged by this hour, Luma will remind you.</div>
            </div>
            <input
              type="checkbox"
              checked={prefs.nudge_enabled}
              onChange={(e) => prefsMutation.mutate({ ...prefs, nudge_enabled: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: 'var(--sky-400)', flexShrink: 0 }}
            />
          </label>

          {prefs.nudge_enabled && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Nudge time</span>
                <select
                  value={prefs.nudge_hour}
                  onChange={(e) => prefsMutation.mutate({ ...prefs, nudge_hour: Number(e.target.value) })}
                  className="field-input"
                  style={{ padding: '8px 10px', fontSize: 13, background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 8, color: 'var(--fg-primary)' }}
                >
                  {HOUR_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-quiet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Timezone</span>
                <input
                  type="text"
                  value={localTz ?? prefs.nudge_tz}
                  onChange={(e) => setLocalTz(e.target.value)}
                  onBlur={(e) => {
                    const tz = e.target.value.trim()
                    if (tz && tz !== prefs.nudge_tz) prefsMutation.mutate({ ...prefs, nudge_tz: tz })
                    setLocalTz(null)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  placeholder="America/New_York"
                  className="field-input"
                  style={{ padding: '8px 10px', fontSize: 13, background: 'var(--glass-1)', border: '1px solid var(--glass-edge)', borderRadius: 8, color: 'var(--fg-primary)' }}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {statusMsg && (
        <div style={{ marginTop: 12, fontSize: 12, color: statusMsg.toLowerCase().includes('fail') || statusMsg.toLowerCase().includes('deny') || statusMsg.toLowerCase().includes('block') || statusMsg.toLowerCase().includes('not') ? 'var(--bad)' : 'var(--good)' }}>
          {statusMsg}
        </div>
      )}
    </div>
  )
}
