import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { HydrationCard } from '../components/settings/HydrationCard'
import { api, type WaterSettings } from '../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
  })
}

function wrap(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const base: WaterSettings = { buddy: 'frog', goal_ml: 2000, glass_ml: 250 }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HydrationCard', () => {
  it('shows the derived glasses-per-day from goal and glass size', () => {
    const client = makeClient()
    client.setQueryData(['water', 'settings'], base)

    render(<HydrationCard />, { wrapper: wrap(client) })

    expect(screen.getByText(/That's 8 glasses a day/)).toBeInTheDocument()
    expect(screen.getByLabelText('Daily water goal')).toHaveValue('2000')
    expect(screen.getByLabelText('Glass size')).toHaveValue('250')
  })

  it('saves a new daily goal', async () => {
    const client = makeClient()
    client.setQueryData(['water', 'settings'], base)
    const put = vi.spyOn(api, 'put').mockResolvedValue({ ...base, goal_ml: 3000 })

    render(<HydrationCard />, { wrapper: wrap(client) })
    fireEvent.change(screen.getByLabelText('Daily water goal'), { target: { value: '3000' } })

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/water/settings', { goal_ml: 3000 })
    })
  })

  it('saves a new glass size', async () => {
    const client = makeClient()
    client.setQueryData(['water', 'settings'], base)
    const put = vi.spyOn(api, 'put').mockResolvedValue({ ...base, glass_ml: 500 })

    render(<HydrationCard />, { wrapper: wrap(client) })
    fireEvent.change(screen.getByLabelText('Glass size'), { target: { value: '500' } })

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/water/settings', { glass_ml: 500 })
    })
  })

  it('saves a new spirit buddy', async () => {
    const client = makeClient()
    client.setQueryData(['water', 'settings'], base)
    const put = vi.spyOn(api, 'put').mockResolvedValue({ ...base, buddy: 'axolotl' })

    render(<HydrationCard />, { wrapper: wrap(client) })
    fireEvent.click(screen.getByRole('button', { name: 'Choose Axolotl' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/water/settings', { buddy: 'axolotl' })
    })
  })
})
