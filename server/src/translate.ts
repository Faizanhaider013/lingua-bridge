import type { ServerConfig } from './config.ts'
import { ApiError } from './errors.ts'
import { translateWithGoogle } from './google.ts'
import type { SupportedLanguage } from './languages.ts'
import { translateWithMyMemory } from './mymemory.ts'

export interface TranslateParams {
  signal?: AbortSignal
  text: string
  source: SupportedLanguage
  target: SupportedLanguage
}

export type ProviderName = 'mymemory' | 'google'

export interface Translator {
  /** Which provider is active. */
  name: ProviderName
  /** Whether it can actually run (Google needs a key; MyMemory never does). */
  ready: boolean
  translate: (params: TranslateParams) => Promise<string>
}

/**
 * Builds the active translator from config. MyMemory is the default: it is free
 * and needs no credentials. Google is opt-in via `TRANSLATION_PROVIDER=google`
 * and requires `GOOGLE_TRANSLATE_API_KEY`.
 */
export function createTranslator(config: ServerConfig): Translator {
  if (config.provider === 'google') {
    const apiKey = config.googleApiKey
    return {
      name: 'google',
      ready: Boolean(apiKey),
      translate: async (params) => {
        if (!apiKey) {
          throw new ApiError(
            503,
            'not_configured',
            'Google translation is selected but GOOGLE_TRANSLATE_API_KEY is not set.',
          )
        }
        return translateWithGoogle(params, { apiKey, timeoutMs: config.requestTimeoutMs })
      },
    }
  }

  // Default: MyMemory (free, no credentials required).
  return {
    name: 'mymemory',
    ready: true,
    translate: (params) =>
      translateWithMyMemory(params, {
        email: config.myMemoryEmail,
        apiKey: config.myMemoryApiKey,
        timeoutMs: config.requestTimeoutMs,
      }),
  }
}
