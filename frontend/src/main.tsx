import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

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
