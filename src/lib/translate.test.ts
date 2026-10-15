import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestTranslation, TranslationError } from './translate'

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } })
}

const input = { text: 'hola', sourceLang: 'es', targetLang: 'en' } as const

afterEach(() => vi.unstubAllGlobals())

describe('requestTranslation', () => {
  it('times out a stalled body instead of leaving the composer pending', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('fetch', vi.fn(async (_url, init) => ({
        json: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
      })))
      const result = expect(requestTranslation(input)).rejects.toMatchObject({ code: 'timeout' })
      await vi.advanceTimersByTimeAsync(35_000)
      await result
    } finally { vi.useRealTimers() }
  })

  it('rejects empty successful payloads', async () => {
    mockFetch(async () => jsonResponse({ translatedText: '  ' }, 200))
    await expect(requestTranslation(input)).rejects.toMatchObject({ code: 'bad_response' })
  })

  it('returns the translated text on success', async () => {
    mockFetch(async () => jsonResponse({ translatedText: 'hello' }, 200))
    expect(await requestTranslation(input)).toBe('hello')
  })

  it('surfaces the backend’s structured, specific message (quota exceeded)', async () => {
    mockFetch(async () =>
      jsonResponse(
        { error: { code: 'quota_exceeded', message: 'The free daily translation quota has been reached. Please try again later.' } },
        429,
      ),
    )
    await expect(requestTranslation(input)).rejects.toMatchObject({
      code: 'quota_exceeded',
      message: /quota has been reached/i,
    })
  })

  // Regression: a non-OK response WITHOUT a structured body (e.g. the dev proxy
  // returning a non-JSON error because the backend is down) must NOT collapse to
  // the opaque "Translation failed. Please try again." It should be status-aware.
  it('gives a "temporarily unavailable" message for a 502 with no structured body', async () => {
    mockFetch(async () => textResponse('<html>Bad Gateway</html>', 502))
    const err = await requestTranslation(input).catch((e) => e)
    expect(err).toBeInstanceOf(TranslationError)
    expect(err.message).toMatch(/temporarily unavailable/i)
    expect(err.message).not.toMatch(/^Translation failed\. Please try again\.$/)
  })

  it('points at the backend/API URL for a 404 with no structured body', async () => {
    mockFetch(async () => textResponse('Not Found', 404))
    await expect(requestTranslation(input)).rejects.toMatchObject({
      message: /backend running|API URL/i,
    })
  })

  it('includes the status for other non-OK responses without a body', async () => {
    mockFetch(async () => textResponse('', 418))
    await expect(requestTranslation(input)).rejects.toMatchObject({
      message: /HTTP 418/,
    })
  })

  it('reports an unreachable backend when fetch itself throws', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(requestTranslation(input)).rejects.toMatchObject({
      code: 'network',
      message: /could not reach/i,
    })
  })

  it('rethrows aborts so callers can distinguish cancellation', async () => {
    mockFetch(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(requestTranslation(input)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
