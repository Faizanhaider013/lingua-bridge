import { fetchProviderJson } from './upstream.ts'
import { ApiError } from './errors.ts'
import { toGoogleCode } from './languages.ts'
import type { TranslateParams } from './translate.ts'

const GOOGLE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2'

export interface GoogleDeps {
  apiKey: string
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface GoogleTranslateResponse {
  data?: { translations?: Array<{ translatedText?: string }> }
  error?: { message?: string; status?: string }
}

/**
 * Translates `text` from `source` to `target` using the Google Cloud
 * Translation API (v2, Basic — API-key auth).
 *
 * Failures are normalised into {@link ApiError}s with client-safe messages.
 * The API key and raw upstream error payloads are never included in the thrown
 * message or server logs.
 */
export async function translateWithGoogle(
  { text, source, target, signal }: TranslateParams,
  { apiKey, fetchImpl = fetch, timeoutMs = 10_000 }: GoogleDeps,
): Promise<string> {
  const result = await fetchProviderJson(
    `${GOOGLE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: toGoogleCode(source), target: toGoogleCode(target), format: 'text' }),
    },
    fetchImpl, timeoutMs, signal,
  )
  const { response } = result
  const payload = result.payload as GoogleTranslateResponse | null

  if (!response.ok) {
    console.error(`[google] provider returned HTTP ${response.status}`)
    if (response.status === 400) {
      // A 400 from Google here almost always means an unusable language pair.
      throw new ApiError(400, 'invalid_language_pair', 'That language pair could not be translated.')
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(502, 'provider_auth_error', 'The translation service rejected the server credentials.')
    }
    throw new ApiError(502, 'upstream_error', 'The translation service returned an error.')
  }

  const translated = payload?.data?.translations?.[0]?.translatedText
  if (typeof translated !== 'string' || translated.trim().length === 0) {
    console.error('[google] unexpected response shape')
    throw new ApiError(502, 'upstream_error', 'The translation service returned an unexpected response.')
  }

  return translated
}
