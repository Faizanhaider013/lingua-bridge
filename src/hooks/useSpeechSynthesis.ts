import { useCallback, useEffect, useRef, useState } from 'react'
import {
  hasVoiceForLanguage,
  isSynthesisSupported,
  loadVoices,
} from '../lib/speech/capabilities'
import { cancelSpeech, speak as speakText, type SpeakResult } from '../lib/speech/tts'
import type { LanguageCode } from '../types'

export interface SpeechSynthesisController {
  /** Whether the browser exposes speech synthesis at all. */
  supported: boolean
  /** Installed voices (reactive — updates when the OS list loads/changes). */
  voices: SpeechSynthesisVoice[]
  voicesReady: boolean
  /** Id of the message currently being spoken, or null. Only one at a time. */
  speakingId: string | null
  /** Speaks a message's translation; cancels any current speech first. */
  speak: (id: string, text: string, langCode: LanguageCode) => SpeakResult
  /** Stops any current speech. */
  stop: () => void
  /** Whether an installed voice can speak the given language. */
  hasVoiceFor: (langCode: LanguageCode) => boolean
}

/**
 * Owns browser text-to-speech for the whole app. A single instance lives in
 * `App` so there is one source of truth for "what is speaking" and one voice
 * list; it must not be instantiated per message.
 */
export function useSpeechSynthesis(): SpeechSynthesisController {
  const supported = isSynthesisSupported()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicesReady, setVoicesReady] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const speakingIdRef = useRef<string | null>(null)

  const setSpeaking = useCallback((id: string | null) => {
    speakingIdRef.current = id
    setSpeakingId(id)
  }, [])

  // Load voices (handling the async/empty-first-call race) and keep them fresh.
  // Cancel any speech on unmount so navigating away never leaves audio playing.
  useEffect(() => {
    if (!supported) return
    let active = true
    void loadVoices().then((v) => {
      if (active) { setVoices(v); setVoicesReady(true) }
    })
    const onVoicesChanged = () => { setVoices(window.speechSynthesis.getVoices()); setVoicesReady(true) }
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged)
    return () => {
      active = false
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged)
      cancelSpeech()
    }
  }, [supported])

  const stop = useCallback(() => {
    cancelSpeech()
    setSpeaking(null)
  }, [setSpeaking])

  const speak = useCallback(
    (id: string, text: string, langCode: LanguageCode): SpeakResult => {
      const result = speakText(text, langCode, {
        onEnd: () => {
          if (speakingIdRef.current === id) setSpeaking(null)
        },
        onError: () => {
          if (speakingIdRef.current === id) setSpeaking(null)
        },
      })
      if (result.started) setSpeaking(id)
      return result
    },
    [setSpeaking],
  )

  const hasVoiceFor = useCallback(
    (langCode: LanguageCode) => hasVoiceForLanguage(langCode, voices),
    [voices],
  )

  return { supported, voices, voicesReady, speakingId, speak, stop, hasVoiceFor }
}
