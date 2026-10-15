import type { ProviderName } from './translate.ts'

/** Server configuration, resolved from environment variables. */
export interface ServerConfig {
  production: boolean
  serveFrontend: boolean
  maxConcurrentTranslations: number
  requestsPerMinute: number
  port: number
  /** Active translation provider. */
  provider: ProviderName
  /** Google Cloud Translation API key. Undefined if not configured. */
  googleApiKey: string | undefined
  /** Optional MyMemory contact email (`de`) — raises the daily quota. */
  myMemoryEmail: string | undefined
  /** Optional MyMemory API key for private TM / higher limits. */
  myMemoryApiKey: string | undefined
  /**
   * Allowed browser origin allowlist: one or more comma-separated, canonical
   * origins (scheme + host + port), already normalised by {@link loadConfig}
   * via {@link normalizeOrigin}. A trailing slash, path or mixed case in the
   * environment value is normalised away; wildcards, credentials and
   * non-HTTP(S) values are rejected, and production requires HTTPS.
   */
  corsOrigin: string
  /** How long to wait on the translation provider before giving up (ms). */
  requestTimeoutMs: number
  /** Maximum accepted length of a single message, in characters. */
  maxTextLength: number
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('Numeric server settings must be positive integers.')
  return parsed
}

/** Treats empty / whitespace-only values as "not set". */
function cleanString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Canonicalises a browser origin to scheme+host+port — lowercased, with no
 * path, query, fragment or trailing slash, exactly as a browser sends it in the
 * `Origin` header. Returns null when the value cannot be a usable web origin:
 * unparseable (including `*`), not HTTP(S), carrying credentials, or — when
 * `requireHttps` — not HTTPS.
 *
 * A trailing slash, a path or mixed case are normalised rather than rejected,
 * so an origin pasted from the browser address bar (e.g. `https://app.example/`)
 * still resolves to the correct origin instead of failing validation. This is
 * safe: the matcher only ever compares the canonical origin, which is all a
 * browser's `Origin` header ever contains.
 */
export function normalizeOrigin(value: string, requireHttps: boolean): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null
  if (url.username || url.password) return null
  if (requireHttps && url.protocol !== 'https:') return null
  return url.origin
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = toPositiveInt(env.PORT, 8787)
  if (port > 65535) throw new Error('PORT must be between 1 and 65535.')
  const production = env.NODE_ENV === 'production'
  const rawCorsOrigin = cleanString(env.CORS_ORIGIN) ?? (production ? '' : 'http://localhost:5173,http://127.0.0.1:5173')
  const allowedOrigins: string[] = []
  for (const entry of rawCorsOrigin ? rawCorsOrigin.split(',') : []) {
    const normalized = normalizeOrigin(entry, production)
    if (!normalized) {
      throw new Error(
        'CORS_ORIGIN must be one or more comma-separated web origins (HTTPS in production). ' +
          'A trailing slash, path or mixed case is normalised; wildcards, credentials and non-HTTP(S) values are rejected.',
      )
    }
    allowedOrigins.push(normalized)
  }
  if (allowedOrigins.length === 0) {
    throw new Error(
      "CORS_ORIGIN is required in production. Set it to the site's exact HTTPS origin, e.g. https://your-service.onrender.com",
    )
  }
  // Store de-duplicated, canonical origins; the request guard compares against these.
  const corsOrigin = [...new Set(allowedOrigins)].join(',')
  if (env.TRANSLATION_PROVIDER && !['mymemory', 'google'].includes(env.TRANSLATION_PROVIDER.trim().toLowerCase())) {
    throw new Error('TRANSLATION_PROVIDER must be mymemory or google.')
  }
  const provider: ProviderName =
    env.TRANSLATION_PROVIDER?.trim().toLowerCase() === 'google' ? 'google' : 'mymemory'

  // Both providers accept longer messages now: MyMemory's 500-byte per-request
  // limit is handled internally by UTF-8-safe chunking, so this is the overall
  // message limit (in characters) surfaced to the UI.
  const maxTextLength = toPositiveInt(env.MAX_TEXT_LENGTH, 2000)

  return {
    production,
    serveFrontend: env.SERVE_FRONTEND === 'true',
    maxConcurrentTranslations: Math.min(toPositiveInt(env.MAX_CONCURRENT_TRANSLATIONS, 4), 20),
    requestsPerMinute: Math.min(toPositiveInt(env.REQUESTS_PER_MINUTE, 30), 300),
    port,
    provider,
    googleApiKey: cleanString(env.GOOGLE_TRANSLATE_API_KEY),
    myMemoryEmail: cleanString(env.MYMEMORY_EMAIL),
    myMemoryApiKey: cleanString(env.MYMEMORY_API_KEY),
    corsOrigin,
    requestTimeoutMs: Math.min(toPositiveInt(env.TRANSLATE_TIMEOUT_MS, 10_000), 10_000),
    maxTextLength,
  }
}
