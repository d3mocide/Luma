import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { HealthConnectCard } from '../components/settings/HealthConnectCard'
import { DataSourcePicker } from '../components/settings/DataSourcePicker'
import { api, type User } from '../lib/api'

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HealthConnectCard', () => {
  it('renders the health-connect endpoint URL from the import token', () => {
    const client = makeClient()
    client.setQueryData(['settings', 'hae-import'], { token: 'tok-123', app_secret: 's' })

    render(<HealthConnectCard />, { wrapper: wrap(client) })

    const input = screen.getByLabelText('Health Connect endpoint URL') as HTMLInputElement
    expect(input.value).toContain('/api/v1/ingest/health-connect/tok-123')
    expect(input.value).not.toContain('/ingest/hae/')
  })
})

describe('DataSourcePicker', () => {
  const baseUser: User = {
    id: 'u1', email: 'a@b.c', display_name: 'A', role: 'operator', data_source: 'apple_health',
  }

  it('reflects the current data_source selection', () => {
    const client = makeClient()
    client.setQueryData(['me'], baseUser)

    render(<DataSourcePicker />, { wrapper: wrap(client) })

    expect(screen.getByRole('radio', { name: /Apple Health/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /Health Connect/ })).toHaveAttribute('aria-checked', 'false')
  })

  it('patches /auth/me when switching source', async () => {
    const client = makeClient()
    client.setQueryData(['me'], baseUser)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ ...baseUser, data_source: 'health_connect' })

    render(<DataSourcePicker />, { wrapper: wrap(client) })
    fireEvent.click(screen.getByRole('radio', { name: /Health Connect/ }))

    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith('/auth/me', { data_source: 'health_connect' })
    })
  })

  it('does not re-patch when clicking the already-active source', () => {
    const client = makeClient()
    client.setQueryData(['me'], baseUser)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue(baseUser)

    render(<DataSourcePicker />, { wrapper: wrap(client) })
    fireEvent.click(screen.getByRole('radio', { name: /Apple Health/ }))

    expect(patch).not.toHaveBeenCalled()
  })
})
