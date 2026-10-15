import type { Language, LanguageCode } from '../types'

/**
 * Central language configuration — the single source of truth for every
 * language the interface offers. Adding a language later is a one-line change
 * here; nothing else needs to know the list.
 *
 * NOTE (Phase 1): these are UI options only. Listing a language here does NOT
 * mean speech recognition or the eventual translation provider supports it —
 * that wiring comes in a later phase.
 */
export const LANGUAGES: readonly Language[] = [
  { code: 'en', label: 'English', endonym: 'English', dir: 'ltr' },
  { code: 'es', label: 'Spanish', endonym: 'Español', dir: 'ltr' },
  { code: 'fr', label: 'French', endonym: 'Français', dir: 'ltr' },
  { code: 'hi', label: 'Hindi', endonym: 'हिन्दी', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', endonym: 'العربية', dir: 'rtl' },
  { code: 'de', label: 'German', endonym: 'Deutsch', dir: 'ltr' },
  { code: 'pt', label: 'Portuguese', endonym: 'Português', dir: 'ltr' },
  { code: 'zh', label: 'Chinese (Mandarin)', endonym: '中文', dir: 'ltr' },
  { code: 'ja', label: 'Japanese', endonym: '日本語', dir: 'ltr' },
  { code: 'ur', label: 'Urdu', endonym: 'اردو', dir: 'rtl' },
  { code: 'it', label: 'Italian', endonym: 'Italiano', dir: 'ltr' },
  { code: 'bn', label: 'Bengali', endonym: 'বাংলা', dir: 'ltr' },
  { code: 'ko', label: 'Korean', endonym: '한국어', dir: 'ltr' },
  { code: 'tr', label: 'Turkish', endonym: 'Türkçe', dir: 'ltr' },
  { code: 'ru', label: 'Russian', endonym: 'Русский', dir: 'ltr' },
] as const

/** Default language for Participant A (You). */
export const DEFAULT_LANGUAGE_A: LanguageCode = 'en'
/** Default language for Participant B (Them). */
export const DEFAULT_LANGUAGE_B: LanguageCode = 'es'

const BY_CODE = new Map<LanguageCode, Language>(
  LANGUAGES.map((lang) => [lang.code, lang]),
)

export function getLanguage(code: LanguageCode): Language {
  const lang = BY_CODE.get(code)
  if (!lang) throw new Error(`Unsupported language code: ${code}`)
  return lang
}
