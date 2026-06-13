import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { WaterCard } from '../components/today/WaterCard'
import { api, type WaterToday } from '../lib/api'

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

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

const base: WaterToday = {
  total_ml: 750,
  entries: 3,
  goal_ml: 2000,
  glass_ml: 250,
  goal_met: false,
  buddy: 'frog',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WaterCard', () => {
  it('renders the daily total and goal', () => {
    const client = makeClient()
    client.setQueryData(['water', tz], base)

    render(<WaterCard />, { wrapper: wrap(client) })

    expect(screen.getByText('750')).toBeInTheDocument()
    expect(screen.getByText('/ 2000 ml')).toBeInTheDocument()
    expect(screen.getByText('Tap to add 250 ml')).toBeInTheDocument()
  })

  it('logs a glass when the vessel is tapped', async () => {
    const client = makeClient()
    client.setQueryData(['water', tz], base)
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ ...base, total_ml: 1000, entries: 4 })

    render(<WaterCard />, { wrapper: wrap(client) })
    fireEvent.click(screen.getByRole('button', { name: 'Log a glass of water' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        expect.stringContaining('/water/log'),
        { amount_ml: 250 },
      )
    })
    await waitFor(() => {
      expect(screen.getByText('1000')).toBeInTheDocument()
    })
  })

  it('undoes the last glass', async () => {
    const client = makeClient()
    client.setQueryData(['water', tz], base)
    const del = vi
      .spyOn(api, 'delete')
      .mockResolvedValue({ ...base, total_ml: 500, entries: 2 })

    render(<WaterCard />, { wrapper: wrap(client) })
    fireEvent.click(screen.getByRole('button', { name: 'Undo last glass' }))

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith(expect.stringContaining('/water/last'))
    })
    await waitFor(() => {
      expect(screen.getByText('500')).toBeInTheDocument()
    })
  })

  it('disables undo when nothing is logged yet', () => {
    const client = makeClient()
    client.setQueryData(['water', tz], { ...base, total_ml: 0, entries: 0 })

    render(<WaterCard />, { wrapper: wrap(client) })

    expect(screen.getByRole('button', { name: 'Undo last glass' })).toBeDisabled()
  })

  it('shows the buddy picker and saves a new buddy', async () => {
    const client = makeClient()
    client.setQueryData(['water', tz], base)
    const put = vi.spyOn(api, 'put').mockResolvedValue({ buddy: 'cat', goal_ml: 2000 })

    render(<WaterCard />, { wrapper: wrap(client) })
    fireEvent.click(screen.getByRole('button', { name: 'Change water buddy' }))

    expect(screen.getByRole('button', { name: 'Choose Frog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Cat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Dog' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose Axolotl' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose Cat' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/water/settings', { buddy: 'cat' })
    })
    const data = client.getQueryData<WaterToday>(['water', tz])
    expect(data?.buddy).toBe('cat')
  })

  it('marks the goal as met', () => {
    const client = makeClient()
    client.setQueryData(['water', tz], { ...base, total_ml: 2250, entries: 9, goal_met: true })

    render(<WaterCard />, { wrapper: wrap(client) })

    expect(screen.getByText('Goal met')).toBeInTheDocument()
  })
})
