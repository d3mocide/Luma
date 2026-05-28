import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

// Measure env(safe-area-inset-*) at the document root level — outside any
// stacking context — and expose as CSS variables. iOS standalone PWA can fail
// to resolve env() inside position:fixed + isolation:isolate + overflow:clip
// containers, so we do the measurement once here and update on resize.
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
    document.documentElement.style.setProperty('--sat', `${sat}px`)
  }

  measure()
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
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
