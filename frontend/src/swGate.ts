import { useState, useEffect } from 'react'

// Tracks whether the service worker has settled (no pending reload).
// Released by main.tsx via releaseSwGate() once the SW registration is
// stable. Non-PWA builds release it synchronously before React renders,
// so useSwReady() returns true on the first render and causes no delay.

let _released = false
const _listeners: Array<() => void> = []

export function releaseSwGate(): void {
  if (_released) return
  _released = true
  for (const fn of _listeners) fn()
  _listeners.length = 0
}

export function useSwReady(): boolean {
  // Use _released directly as the initial value — in non-PWA mode this is
  // already true (releaseSwGate ran synchronously before createRoot).
  const [ready, setReady] = useState(_released)

  useEffect(() => {
    if (_released) {
      setReady(true)
      return
    }
    const notify = () => setReady(true)
    _listeners.push(notify)
    return () => {
      const i = _listeners.indexOf(notify)
      if (i !== -1) _listeners.splice(i, 1)
    }
  }, [])

  return ready
}
