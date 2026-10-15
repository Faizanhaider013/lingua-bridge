import type { LanguageCode } from '../types'
import { API_BASE_URL, MAX_MESSAGE_LENGTH } from './config'

/** Bound headers AND body reading, while preserving session cancellation. */
async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  const parent = init.signal
  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  const timer = window.setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    let payload: unknown = null
    try { payload = await response.json() } catch (error) {
      if (controller.signal.aborted) throw error
    }
    return { response, payload }
  } catch (error) {
    if (timedOut) throw new TranslationError('Translation took too long. Please try again.', 'timeout')
    if (parent?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    throw new TranslationError('Could not reach the translation service. Check your connection and try again.', 'network')
  } finally {
    window.clearTimeout(timer)
    parent?.removeEventListener('abort', onAbort)
  }
}

export interface TranslationInfo {
  /** Active backend provider, e.g. "mymemory" or "google". */
  provider: string
  /** Max message length the backend will accept, in characters. */
  maxTextLength: number
  /** Whether the backend can actually translate (e.g. Google needs a key). */
  ready: boolean
}

/**
 * Reads the backend's translation capabilities (provider, max length, readiness)
 * from the health endpoint. Falls back to safe defaults if the backend can't be
 * reached, so the UI still functions.
 */
export async function fetchTranslationInfo(): Promise<TranslationInfo> {
  const fallback: TranslationInfo = {
    provider: 'unknown',
    maxTextLength: MAX_MESSAGE_LENGTH,
    ready: true,
  }
  try {
    const { response, payload } = await fetchJson(`${API_BASE_URL}/health`)
    if (!response.ok || !payload) return fallback
    const data = payload as {
      provider?: unknown
      maxTextLength?: unknown
      translationReady?: unknown
    }
    return {
      provider: typeof data.provider === 'string' ? data.provider : fallback.provider,
      maxTextLength:
        typeof data.maxTextLength === 'number' && data.maxTextLength > 0
          ? data.maxTextLength
          : fallback.maxTextLength,
      ready: typeof data.translationReady === 'boolean' ? data.translationReady : fallback.ready,
    }
  } catch {
    return fallback
  }
}

/**
 * Lightweight reachability check against the same `/health` endpoint used by
 * {@link fetchTranslationInfo}. Resolves `true` when the backend answers OK.
 * Network failures reject (so callers can distinguish them); an aborted request
 * rejects with an `AbortError`.
 */
export async function pingBackend(signal?: AbortSignal): Promise<boolean> {
  const { response, payload } = await fetchJson(`${API_BASE_URL}/health`, { signal })
  const health = payload as { status?: string; translationReady?: boolean } | null
  return response.ok && health?.status === 'ok' && health.translationReady !== false
}

/** An error carrying a client-safe message and a machine-readable code. */
export class TranslationError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'TranslationError'
    this.code = code
  }
}

export interface TranslateInput {
  text: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  /** Optional abort signal to cancel an in-flight request. */
  signal?: AbortSignal
}

interface TranslateSuccess {
  translatedText?: unknown
}
interface TranslateFailure {
  error?: { code?: unknown; message?: unknown }
}

/** A useful message for a non-OK response that carried no structured error body. */
function messageForHttpStatus(status: number): string {
  if (status === 404) {
    return 'Translation service not found. Is the backend running and the API URL correct?'
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'The translation service is temporarily unavailable. Please try again in a moment.'
  }
  if (status >= 500) {
    return 'The translation server hit an error. Please try again.'
  }
  return `Translation request failed (HTTP ${status}). Please try again.`
}

/**
 * Requests a translation from the backend.
 *
 * Returns the translated text on success. On any failure throws a
 * {@link TranslationError} whose `message` is safe to show to the user — the
 * backend never includes secrets in its error bodies.
 */
export async function requestTranslation({
  text,
  sourceLang,
  targetLang,
  signal,
}: TranslateInput): Promise<string> {
  const result = await fetchJson(`${API_BASE_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sourceLang, targetLang }),
    signal,
  }, 35_000)
  const { response } = result
  const payload = result.payload as (TranslateSuccess & TranslateFailure) | null

  if (!response.ok) {
    // Prefer the backend's structured, specific message (quota exceeded, invalid
    // language pair, provider error, etc.) whenever it is present.
    const structuredMessage =
      typeof payload?.error?.message === 'string' ? payload.error.message : null
    const structuredCode =
      typeof payload?.error?.code === 'string' ? payload.error.code : null

    if (structuredMessage) {
      throw new TranslationError(structuredMessage, structuredCode ?? 'error')
    }

    // No structured body: the request failed before/around the backend (the dev
    // proxy returning a non-JSON error when the backend is down, a gateway, a
    // 5xx without a body). Give a useful, status-aware message instead of an
    // opaque "Translation failed."
    throw new TranslationError(
      messageForHttpStatus(response.status),
      structuredCode ?? `http_${response.status}`,
    )
  }

  if (typeof payload?.translatedText !== 'string' || !payload.translatedText.trim()) {
    throw new TranslationError('The translation service returned an unexpected response.', 'bad_response')
  }

  return payload.translatedText
}
