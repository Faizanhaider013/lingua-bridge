import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBackendHealth } from './useBackendHealth'

function okResponse() {
  return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useBackendHealth', () => {
  it('reports online when /health responds OK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()))
    const { result } = renderHook(() => useBackendHealth({ intervalMs: 10_000 }))
    await waitFor(() => expect(result.current).toBe('online'))
  })

  it('reports offline when the request fails (backend unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const { result } = renderHook(() => useBackendHealth({ intervalMs: 10_000 }))
    await waitFor(() => expect(result.current).toBe('offline'))
  })

  it('treats a non-OK response as offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const { result } = renderHook(() => useBackendHealth({ intervalMs: 10_000 }))
    await waitFor(() => expect(result.current).toBe('offline'))
  })

  it('recovers to online when the backend comes back', async () => {
    let up = false
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (!up) throw new TypeError('down')
      return okResponse()
    }))
    // Short interval so the recovery poll fires quickly in the test.
    const { result } = renderHook(() => useBackendHealth({ intervalMs: 20 }))
    await waitFor(() => expect(result.current).toBe('offline'))
    up = true
    await waitFor(() => expect(result.current).toBe('online'), { timeout: 2000 })
  })

  it('stops polling after unmount (no further fetches)', async () => {
    const fetchMock = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() => useBackendHealth({ intervalMs: 20 }))
    await waitFor(() => expect(result.current).toBe('online'))
    unmount()
    const callsAtUnmount = fetchMock.mock.calls.length
    await new Promise((r) => setTimeout(r, 80))
    expect(fetchMock.mock.calls.length).toBe(callsAtUnmount)
  })
})
