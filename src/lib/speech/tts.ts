import type { LanguageCode } from '../../types'
import { findVoiceForLanguage, isSynthesisSupported } from './capabilities'
import { toSynthesisLang } from './languageMap'

export type SpeakFailureReason = 'unsupported' | 'no-voice' | 'synthesis-error'

export interface SpeakHandlers {
  onStart?: () => void
  /** Called once when speech ends — whether it finished or was cancelled. */
  onEnd?: () => void
  onError?: (reason: SpeakFailureReason) => void
}

/** Result of attempting to speak: `started` is false when it could not begin. */
export interface SpeakResult {
  started: boolean
  reason?: SpeakFailureReason
}

/** Stops any in-progress or queued speech immediately. Safe to call anytime. */
export function cancelSpeech(): void {
  if (!isSynthesisSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // Ignore — nothing meaningful to do if cancellation itself fails.
  }
}

/**
 * Speaks `text` in `langCode` using the browser's speech synthesis.
 *
 * Any already-playing utterance is cancelled first, so only one message speaks
 * at a time. Returns synchronously whether speech could start; lifecycle is
 * reported through `handlers`. Never throws.
 *
 * Returns `{ started: false, reason }` when synthesis is unsupported or no
 * installed voice can speak the language — the caller surfaces that honestly
 * rather than pretending the message was spoken.
 */
export function speak(
  text: string,
  langCode: LanguageCode,
  handlers: SpeakHandlers = {},
): SpeakResult {
  if (!isSynthesisSupported()) {
    handlers.onError?.('unsupported')
    return { started: false, reason: 'unsupported' }
  }

  const voice = findVoiceForLanguage(langCode)
  if (!voice) {
    handlers.onError?.('no-voice')
    return { started: false, reason: 'no-voice' }
  }

  // Replace whatever is currently speaking.
  cancelSpeech()

  try {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = voice.lang || toSynthesisLang(langCode)

    let ended = false
    const end = () => {
      if (ended) return
      ended = true
      handlers.onEnd?.()
    }

    utterance.onstart = () => handlers.onStart?.()
    utterance.onend = end
    utterance.onerror = (event) => {
      // "interrupted"/"canceled" are expected when we replace an utterance; not
      // real failures, so just end quietly.
      const err = (event as SpeechSynthesisErrorEvent).error
      if (err && err !== 'interrupted' && err !== 'canceled') {
        handlers.onError?.('synthesis-error')
      }
      end()
    }

    window.speechSynthesis.speak(utterance)
    return { started: true }
  } catch {
    handlers.onError?.('synthesis-error')
    return { started: false, reason: 'synthesis-error' }
  }
}
