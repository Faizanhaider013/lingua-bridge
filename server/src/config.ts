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
   * Allowed browser origin allowlist: one or more exact, comma-separated
   * origins (scheme + host + port, no path). Wildcards ('*') and malformed
   * origins are rejected by {@link loadConfig}; production requires HTTPS.
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = toPositiveInt(env.PORT, 8787)
  if (port > 65535) throw new Error('PORT must be between 1 and 65535.')
  const production = env.NODE_ENV === 'production'
  const corsOrigin = cleanString(env.CORS_ORIGIN) ?? (production ? '' : 'http://localhost:5173,http://127.0.0.1:5173')
  if (!corsOrigin || corsOrigin.split(',').some((value) => {
    try {
      const origin = value.trim()
      const url = new URL(origin)
      return url.origin !== origin || !['http:', 'https:'].includes(url.protocol) ||
        (production && url.protocol !== 'https:')
    } catch { return true }
  })) throw new Error('CORS_ORIGIN must contain exact comma-separated origins (HTTPS in production); wildcards and paths are not allowed.')
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
