import type { LanguageCode } from '../../types'
import { primarySubtag, toSynthesisLang } from './languageMap'

/**
 * Browser speech-capability detection and voice lookup.
 *
 * Everything here is defensive: the Web Speech API is not Baseline, voices load
 * asynchronously (and can start empty), and some environments (SSR, tests,
 * locked-down browsers) expose none of it. Nothing throws on an unsupported
 * platform — callers get `false`/`null` and degrade to the typed path.
 */

/** Whether `speechSynthesis` (text-to-speech) exists in this environment. */
export function isSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Whether speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`)
 * exists. Used by the honest capability copy now; wired up for input in 3.2.
 */
export function isRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
}

/** Mic access and recognition require a secure context (HTTPS or localhost). */
export function isSecureContextForSpeech(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true
}

/**
 * Returns the currently-available synthesis voices, or `[]` if unsupported.
 * `getVoices()` is often empty on first call until the engine populates it and
 * fires `voiceschanged`; `loadVoices` handles that race for callers that need
 * to wait.
 */
export function getVoices(): SpeechSynthesisVoice[] {
  if (!isSynthesisSupported()) return []
  try {
    return window.speechSynthesis.getVoices()
  } catch {
    return []
  }
}

/**
 * Resolves the voice list, waiting briefly for the async `voiceschanged` event
 * if the first synchronous read is empty. Resolves `[]` on unsupported
 * platforms or if no voices ever arrive within the timeout.
 */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!isSynthesisSupported()) return Promise.resolve([])

  const immediate = getVoices()
  if (immediate.length > 0) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    let settled = false
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return
      settled = true
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      window.clearTimeout(timer)
      resolve(voices)
    }
    const onChange = () => finish(getVoices())

    window.speechSynthesis.addEventListener('voiceschanged', onChange)
    // Fall back to whatever is available (possibly still empty) after the wait.
    const timer = window.setTimeout(() => finish(getVoices()), timeoutMs)
  })
}

/**
 * Finds the best installed voice for an app language, matching by the 2-letter
 * primary subtag (so `es-MX` satisfies `es`). Prefers a voice whose full tag
 * equals the mapped tag, then a default voice, then any prefix match. Returns
 * `null` when no voice can speak the language — the caller must then disable
 * speaking and say so (common for Urdu on desktop).
 */
export function findVoiceForLanguage(
  code: LanguageCode,
  voices: SpeechSynthesisVoice[] = getVoices(),
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  const target = toSynthesisLang(code)
  const targetTag = target.toLowerCase()
  const prefix = primarySubtag(target)

  const matches = voices.filter((v) => primarySubtag(v.lang) === prefix)
  if (matches.length === 0) return null

  return (
    matches.find((v) => v.lang.toLowerCase() === targetTag) ??
    matches.find((v) => v.default) ??
    matches[0]!
  )
}

/** Convenience: whether any installed voice can speak the given language. */
export function hasVoiceForLanguage(
  code: LanguageCode,
  voices: SpeechSynthesisVoice[] = getVoices(),
): boolean {
  return findVoiceForLanguage(code, voices) !== null
}
