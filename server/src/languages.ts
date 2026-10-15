/**
 * Supported languages for the translation backend.
 *
 * This list is kept intentionally in sync with the frontend's
 * `src/data/languages.ts`. Both must agree, but the backend owns the mapping
 * from our internal ISO 639-1 codes to the codes the Google Cloud Translation
 * API (v2, Basic) actually expects — most are identical; Chinese is the
 * notable exception.
 */
export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'fr',
  'hi',
  'ar',
  'de',
  'pt',
  'zh',
  'ja',
  'ur',
  'it',
  'bn',
  'ko',
  'tr',
  'ru',
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_LANGUAGES)

export function isSupportedLanguage(code: unknown): code is SupportedLanguage {
  return typeof code === 'string' && SUPPORTED_SET.has(code)
}

/**
 * Our codes → Google Cloud Translation API codes. Anything not listed maps to
 * itself, so only genuine differences need an entry here.
 */
const GOOGLE_CODE_OVERRIDES: Partial<Record<SupportedLanguage, string>> = {
  // Google expects a region-qualified code for Chinese; bare `zh` is ambiguous.
  zh: 'zh-CN',
}

export function toGoogleCode(code: SupportedLanguage): string {
  return GOOGLE_CODE_OVERRIDES[code] ?? code
}

/**
 * Our codes → MyMemory API codes. MyMemory accepts 2-letter ISO 639-1 or
 * RFC3066 tags; its own error output recommends `zh-CN` for Chinese, so we
 * qualify that one and pass the rest through unchanged.
 */
const MYMEMORY_CODE_OVERRIDES: Partial<Record<SupportedLanguage, string>> = {
  zh: 'zh-CN',
}

export function toMyMemoryCode(code: SupportedLanguage): string {
  return MYMEMORY_CODE_OVERRIDES[code] ?? code
}
