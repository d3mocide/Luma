import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '../lib/api'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api session refresh on 401', () => {
  beforeEach(() => {
    // Pre-seed the CSRF cookie so csrfHeaders() doesn't fire a bootstrap fetch.
    document.cookie = 'csrf_token=test-csrf'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes the session and retries once after a 401', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Token expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'u1' }))
      .mockResolvedValueOnce(jsonResponse(200, { nudge_enabled: true, nudge_hour: 19, nudge_tz: 'UTC' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      api.put('/notifications/preferences', { nudge_enabled: true, nudge_hour: 19, nudge_tz: 'UTC' })
    ).resolves.toEqual({ nudge_enabled: true, nudge_hour: 19, nudge_tz: 'UTC' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': 'test-csrf' },
    })
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/notifications/preferences')
  })

  it('surfaces the original error when refresh fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Token expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Token has been revoked' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/notifications/preferences')).rejects.toThrow('Token expired')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shares one refresh call across concurrent 401s', async () => {
    const failedOnce = new Set<string>()
    let refreshCount = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/v1/auth/refresh') {
        refreshCount += 1
        return jsonResponse(200, { id: 'u1' })
      }
      if (!failedOnce.has(url)) {
        failedOnce.add(url)
        return jsonResponse(401, { detail: 'Token expired' })
      }
      return jsonResponse(200, { ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(Promise.all([
      api.get('/notifications/preferences'),
      api.get('/auth/me'),
    ])).resolves.toEqual([{ ok: true }, { ok: true }])

    expect(refreshCount).toBe(1)
  })

  it('re-issues the CSRF token and retries once after a 403 on a mutating request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(403, { detail: 'CSRF token missing or invalid' }))
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(jsonResponse(200, { nudge_enabled: true, nudge_hour: 19, nudge_tz: 'UTC' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      api.put('/notifications/preferences', { nudge_enabled: true, nudge_hour: 19, nudge_tz: 'UTC' })
    ).resolves.toEqual({ nudge_enabled: true, nudge_hour: 19, nudge_tz: 'UTC' })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/setup-status')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/v1/notifications/preferences')
  })

  it('does not retry a 403 on a non-mutating GET', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(403, { detail: 'Insufficient permissions' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/notifications/preferences')).rejects.toThrow('Insufficient permissions')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not refresh after a 401 from credential endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Invalid email or password' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      api.post('/auth/login', { email: 'a@b.c', password: 'nope' })
    ).rejects.toThrow('Invalid email or password')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
