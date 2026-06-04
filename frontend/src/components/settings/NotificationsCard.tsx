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

    const reg = await navigator.serviceWorker.ready

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

    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
      setPermissionState(permission)
    }
    if (permission !== 'granted') {
      setStatusMsg('Notification permission denied. Enable it in browser settings.')
      return
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
          Notifications are blocked in your browser settings. Allow them and reload to continue.
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
          disabled={!isPushSupported || isBlocked}
          className="btn"
          style={{
            padding: '8px 16px',
            fontSize: 12,
            background: subscribed ? 'rgba(251,113,133,0.12)' : 'rgba(14,165,233,0.15)',
            color: subscribed ? 'var(--bad)' : 'var(--sky-400)',
            border: `1px solid ${subscribed ? 'rgba(251,113,133,0.3)' : 'rgba(14,165,233,0.3)'}`,
            opacity: (!isPushSupported || isBlocked) ? 0.4 : 1,
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
