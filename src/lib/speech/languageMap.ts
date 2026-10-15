import type { LanguageCode } from '../../types'

/**
 * Maps the app's internal 2-letter language codes to BCP-47 tags used by the
 * browser speech engines.
 *
 * - `synthesis` is passed to `SpeechSynthesisUtterance.lang` and used to match
 *   an installed voice (matching is done by the 2-letter prefix, so the region
 *   here is a sensible default, not a hard requirement).
 * - `recognition` is the tag a future speech-to-text phase (3.2) will pass to
 *   `SpeechRecognition.lang`. It is defined here now so the mapping lives in one
 *   place; nothing in Phase 3.1 starts recognition.
 *
 * Listing a tag here does NOT guarantee the current browser/OS actually has a
 * voice (TTS) or an engine (STT) for it — that is detected at runtime. Urdu in
 * particular commonly has no installed TTS voice on desktop.
 */
export interface SpeechLangTags {
  recognition: string
  synthesis: string
}

export const SPEECH_LANG_TAGS: Record<LanguageCode, SpeechLangTags> = {
  en: { recognition: 'en-US', synthesis: 'en-US' },
  es: { recognition: 'es-ES', synthesis: 'es-ES' },
  fr: { recognition: 'fr-FR', synthesis: 'fr-FR' },
  hi: { recognition: 'hi-IN', synthesis: 'hi-IN' },
  ar: { recognition: 'ar-SA', synthesis: 'ar-SA' },
  de: { recognition: 'de-DE', synthesis: 'de-DE' },
  pt: { recognition: 'pt-PT', synthesis: 'pt-PT' },
  zh: { recognition: 'zh-CN', synthesis: 'zh-CN' },
  ja: { recognition: 'ja-JP', synthesis: 'ja-JP' },
  ur: { recognition: 'ur-PK', synthesis: 'ur-PK' },
  it: { recognition: 'it-IT', synthesis: 'it-IT' },
  bn: { recognition: 'bn-BD', synthesis: 'bn-BD' },
  ko: { recognition: 'ko-KR', synthesis: 'ko-KR' },
  tr: { recognition: 'tr-TR', synthesis: 'tr-TR' },
  ru: { recognition: 'ru-RU', synthesis: 'ru-RU' },
}

/** BCP-47 tag for speech synthesis (TTS) of a given app language. */
export function toSynthesisLang(code: LanguageCode): string {
  return SPEECH_LANG_TAGS[code].synthesis
}

/** BCP-47 tag for speech recognition (STT) of a given app language. */
export function toRecognitionLang(code: LanguageCode): string {
  return SPEECH_LANG_TAGS[code].recognition
}

/** The 2-letter primary subtag of a BCP-47 tag, lower-cased (e.g. "es-ES" → "es"). */
export function primarySubtag(bcp47: string): string {
  return bcp47.split('-')[0]!.toLowerCase()
}
