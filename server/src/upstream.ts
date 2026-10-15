import { ApiError } from './errors.ts'

/** Keep the timeout active until the body is consumed. Never log URLs or payloads. */
export async function fetchProviderJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<{ response: Response; payload: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal
  try {
    signal.throwIfAborted()
    const response = await fetchImpl(url, { ...init, signal })
    let payload: unknown = null
    try { payload = await response.json() } catch (err) {
      if (signal.aborted) throw err
    }
    signal.throwIfAborted()
    return { response, payload }
  } catch (err) {
    if (signal.aborted || (err instanceof Error && ['AbortError', 'TimeoutError'].includes(err.name))) {
      throw new ApiError(504, 'upstream_timeout', 'The translation service took too long to respond. Please try again.')
    }
    throw new ApiError(502, 'upstream_unreachable', 'Could not reach the translation service.')
  } finally {
    clearTimeout(timer)
  }
}
