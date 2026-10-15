import { fetchProviderJson } from './upstream.ts'
import { byteLength, chunkText } from './chunk.ts'
import { ApiError } from './errors.ts'
import { toMyMemoryCode } from './languages.ts'
import type { TranslateParams } from './translate.ts'

const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get'

/**
 * MyMemory's hard limit on the `q` parameter is 500 BYTES (UTF-8), not 500
 * characters — multi-byte scripts (CJK, Arabic, …) reach it sooner.
 */
export const MYMEMORY_MAX_QUERY_BYTES = 500

/**
 * Safety ceiling on how many chunks one message may be split into. This caps
 * the number of upstream requests a single translation can trigger, protecting
 * the free daily quota from a pathological input. At 500 bytes/chunk this
 * comfortably covers the UI's character limit even for 4-byte scripts.
 */
export const MYMEMORY_MAX_CHUNKS = 25

/** How many chunk requests may be in flight at once. Protects against bursts. */
export const MYMEMORY_MAX_CONCURRENCY = 3

export interface MyMemoryDeps {
  /** Optional contact email (`de`). Raises the daily quota (50k vs 5k chars). */
  email?: string
  /** Optional API key for private TM / higher limits. */
  apiKey?: string
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Overridable mainly for tests. */
  maxChunks?: number
  maxConcurrency?: number
}

interface SingleDeps {
  email?: string
  apiKey?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Aborts this request if a sibling chunk has already failed. */
  externalSignal?: AbortSignal
}

interface MyMemoryResponse {
  responseData?: { translatedText?: unknown; match?: unknown }
  responseStatus?: unknown // number (200) on success, string ("403") on error
  responseDetails?: unknown
  quotaFinished?: unknown
}

/** MyMemory signals an exhausted daily quota in a few different ways. */
function isQuotaExhausted(payload: MyMemoryResponse, details: string): boolean {
  return (
    payload.quotaFinished === true ||
    /ALL AVAILABLE FREE TRANSLATIONS|MYMEMORY WARNING/i.test(details)
  )
}

/**
 * Translates one request-sized piece of text (≤ 500 bytes) via MyMemory.
 *
 * Notes that drive the error handling here:
 * - MyMemory returns HTTP 200 even for application errors, carrying the real
 *   status in `responseStatus` (a *string* like "403") and putting a warning
 *   message in `translatedText`. We must NOT treat that warning as a real
 *   translation — only a numeric 200 status yields a result.
 * - Daily quota exhaustion surfaces as `quotaFinished: true` and/or a warning
 *   message; we map it to a recoverable 429 so the UI can offer a retry.
 */
async function translateSingle(
  { text, source, target, signal }: TranslateParams,
  { email, apiKey, fetchImpl = fetch, timeoutMs = 10_000, externalSignal }: SingleDeps,
): Promise<string> {
  // Defensive: callers guarantee ≤ limit, but never send an over-size query.
  const bytes = byteLength(text)
  if (bytes > MYMEMORY_MAX_QUERY_BYTES) {
    throw new ApiError(
      400,
      'text_too_long',
      `MyMemory accepts up to ${MYMEMORY_MAX_QUERY_BYTES} bytes per request (this one is ${bytes}).`,
    )
  }

  // URLSearchParams handles URL-encoding of the text and the "a|b" langpair.
  const params = new URLSearchParams({
    q: text,
    langpair: `${toMyMemoryCode(source)}|${toMyMemoryCode(target)}`,
  })
  if (email) params.set('de', email)
  if (apiKey) params.set('key', apiKey)

  const combinedSignal = signal && externalSignal ? AbortSignal.any([signal, externalSignal]) : signal ?? externalSignal
  const result = await fetchProviderJson(
    `${MYMEMORY_ENDPOINT}?${params.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    fetchImpl, timeoutMs, combinedSignal,
  )
  const { response } = result
  const payload = result.payload as MyMemoryResponse | null

  // Transport-level HTTP errors (rate limiting, 5xx, …).
  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError(429, 'quota_exceeded', 'The free translation quota has been reached. Please try again later.')
    }
    console.error(`[mymemory] provider returned HTTP ${response.status}`)
    throw new ApiError(502, 'upstream_error', 'The translation service returned an error.')
  }

  if (!payload) {
    throw new ApiError(502, 'upstream_error', 'The translation service returned an unreadable response.')
  }

  const details = typeof payload.responseDetails === 'string' ? payload.responseDetails : ''
  const status = Number(payload.responseStatus)

  // Quota first — it can arrive with a 403-ish status and a warning body.
  if (isQuotaExhausted(payload, details)) {
    console.warn('[mymemory] daily quota exhausted')
    throw new ApiError(
      429,
      'quota_exceeded',
      'The free daily translation quota has been reached. Please try again later.',
    )
  }

  // Any non-200 application status is a real failure — never return the body
  // text (it holds a warning/error message, not a translation).
  if (status !== 200) {
    console.error('[mymemory] provider rejected translation')
    // Invalid language pair also arrives as an in-body 403, so check it first.
    if (/INVALID.*LANGUAGE|LANGUAGE.*INVALID/i.test(details)) {
      throw new ApiError(400, 'invalid_language_pair', 'That language pair could not be translated.')
    }
    // MyMemory signals rate limiting / usage limits with an in-body 429 or 403
    // (HTTP 200). Treat these as recoverable quota/rate-limit errors rather than
    // an opaque provider failure.
    if (status === 429 || status === 403) {
      throw new ApiError(
        429,
        'quota_exceeded',
        'The free translation service is rate-limited or over its quota right now. Please wait a moment and try again.',
      )
    }
    throw new ApiError(502, 'upstream_error', 'The translation service returned an error.')
  }

  const translated = payload.responseData?.translatedText
  if (typeof translated !== 'string' || translated.trim().length === 0) {
    console.error('[mymemory] unexpected response shape')
    throw new ApiError(502, 'upstream_error', 'The translation service returned an unexpected response.')
  }

  return translated
}

/**
 * Translates an ordered list of chunks with bounded concurrency, preserving
 * order. If any chunk fails, the remaining in-flight and pending requests are
 * aborted and the first error is re-thrown — so a partial result is never
 * returned as if it were complete.
 */
async function translateChunks(
  chunks: string[],
  { source, target, signal }: Pick<TranslateParams, 'source' | 'target' | 'signal'>,
  deps: MyMemoryDeps,
): Promise<string[]> {
  const results = new Array<string>(chunks.length)
  const concurrency = Math.max(1, Math.min(deps.maxConcurrency ?? MYMEMORY_MAX_CONCURRENCY, chunks.length))
  const abort = new AbortController()
  let cursor = 0
  let firstError: unknown = null

  async function worker(): Promise<void> {
    while (firstError === null) {
      const index = cursor++
      if (index >= chunks.length) return
      try {
        results[index] = await translateSingle(
          { text: chunks[index], source, target, signal },
          {
            email: deps.email,
            apiKey: deps.apiKey,
            fetchImpl: deps.fetchImpl,
            timeoutMs: deps.timeoutMs,
            externalSignal: abort.signal,
          },
        )
      } catch (err) {
        if (firstError === null) {
          firstError = err
          abort.abort() // cancel siblings; don't waste more quota
        }
        return
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  if (firstError !== null) throw firstError
  return results
}

/**
 * Translates `text` from `source` to `target` using the free MyMemory API.
 *
 * Short messages (≤ 500 bytes) take the single-request fast path. Longer
 * messages are split UTF-8-safely at sentence/word/grapheme boundaries,
 * translated in order with bounded concurrency, and rejoined. If the message
 * would need more than the chunk-count ceiling, it is rejected before any
 * request is made (protecting the free quota).
 */
export async function translateWithMyMemory(
  params: TranslateParams,
  deps: MyMemoryDeps,
): Promise<string> {
  if (byteLength(params.text) <= MYMEMORY_MAX_QUERY_BYTES) {
    return translateSingle(params, deps) // fast path — unchanged behaviour
  }

  const maxChunks = deps.maxChunks ?? MYMEMORY_MAX_CHUNKS
  const chunks = chunkText(params.text, MYMEMORY_MAX_QUERY_BYTES)

  if (chunks.length === 0) {
    // Only whitespace after chunking; upstream validation rejects empties, but
    // guard anyway rather than returning a misleading empty translation.
    throw new ApiError(400, 'empty_text', 'Message text must not be empty.')
  }
  if (chunks.length > maxChunks) {
    throw new ApiError(
      400,
      'text_too_long',
      `This message would need ${chunks.length} translation requests, over the safety limit of ${maxChunks}. Please shorten it.`,
    )
  }

  const parts = await translateChunks(chunks, params, deps)
  // Rejoin with single spaces at chunk boundaries (within-chunk text preserved).
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join(' ')
}
