import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'
import { releaseSwGate } from './swGate'

// Measure env(safe-area-inset-*) at the document root level — outside any
// stacking context — and expose as CSS variables. iOS standalone PWA can fail
// to resolve env() inside position:fixed + isolation:isolate + overflow:clip
// containers, so we do the measurement once here and update on resize.
//
// Vite 8 injects the script into <head> before the stylesheet, so this module
// runs before the first paint. env(safe-area-inset-top) returns 0 on iOS PWA
// before the viewport is rendered. We defer the initial measurement to after
// the first paint (double rAF) so the probe reads the real inset value.
// The CSS fallback — var(--sat, env(safe-area-inset-top, 0px)) — handles the
// first frame correctly because --sat is not yet defined at that point.
function setupSafeAreaVars(): void {
  const measure = () => {
    const probe = document.createElement('div')
    probe.setAttribute('style', [
      'position:fixed', 'bottom:0', 'left:0', 'width:1px',
      'height:env(safe-area-inset-bottom,0px)',
      'pointer-events:none', 'visibility:hidden', 'z-index:-9999',
    ].join(';'))
    document.documentElement.appendChild(probe)
    const sab = probe.getBoundingClientRect().height
    document.documentElement.removeChild(probe)

    const probeTop = document.createElement('div')
    probeTop.setAttribute('style', [
      'position:fixed', 'top:0', 'left:0', 'width:1px',
      'height:env(safe-area-inset-top,0px)',
      'pointer-events:none', 'visibility:hidden', 'z-index:-9999',
    ].join(';'))
    document.documentElement.appendChild(probeTop)
    const sat = probeTop.getBoundingClientRect().height
    document.documentElement.removeChild(probeTop)

    document.documentElement.style.setProperty('--sab', `${sab}px`)
    // Only write --sat when the probe reads a positive value.  On iOS PWA
    // fast cached reloads the double-rAF can fire before env() has settled,
    // returning 0.  Writing --sat: 0px explicitly overrides the env() CSS
    // fallback and permanently breaks the top safe zone.
    if (sat > 0) document.documentElement.style.setProperty('--sat', `${sat}px`)
  }

  // Defer until after the first paint so env() values are settled.
  requestAnimationFrame(() => requestAnimationFrame(measure))
  // Extra safety: re-measure after iOS has had more time to settle.
  // On cached-asset fast reloads (post sign-out or PWA resume) the double-rAF
  // above can fire while env() still returns 0; this catches that case.
  setTimeout(measure, 300)
  window.addEventListener('resize', measure, { passive: true })
  let orientationTimer: ReturnType<typeof setTimeout>
  window.addEventListener('orientationchange', () => {
    clearTimeout(orientationTimer)
    orientationTimer = setTimeout(measure, 300)
  }, { passive: true })
}

setupSafeAreaVars()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

const isTrustedPwaOrigin =
  import.meta.env.PROD &&
  window.location.protocol === 'https:' &&
  !['localhost', '127.0.0.1'].includes(window.location.hostname)

if (isTrustedPwaOrigin) {
  // Release the gate once we know no SW-triggered reload is coming.
  // - onRegistered with nothing installing/waiting → stable, release now.
  // - onRegistered with installing/waiting → a reload is imminent, keep gate
  //   closed so the user never sees interactive UI before the reload fires.
  // - onOfflineReady → precache done, definitely no reload coming.
  // Safety: release after 3.5 s regardless so a stuck SW never locks the UI.
  registerSW({
    immediate: true,
    onRegistered(registration) {
      if (!registration || (!registration.installing && !registration.waiting)) {
        releaseSwGate()
      }
    },
    onOfflineReady() {
      releaseSwGate()
    },
    onRegisterError() {
      releaseSwGate()
    },
  })
  setTimeout(releaseSwGate, 3500)
} else {
  // Dev / non-HTTPS — no service worker, release immediately so there's no
  // splash delay during development.
  releaseSwGate()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
