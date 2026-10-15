import { useCallback, useEffect, useRef, useState } from 'react'
import { isRecognitionSupported, isSecureContextForSpeech } from '../lib/speech/capabilities'
import { toRecognitionLang } from '../lib/speech/languageMap'
import {
  createRecognizer,
  recognitionErrorMessage,
  type Recognizer,
} from '../lib/speech/stt'
import type { LanguageCode, Speaker } from '../types'

export interface SpeechRecognitionController {
  /** Browser exposes a recognition engine. */
  supported: boolean
  /** Running in a secure context (HTTPS/localhost) — required for the mic. */
  secure: boolean
  /** supported && secure — recognition can actually be used. */
  available: boolean
  /** True while listening. */
  listening: boolean
  /** Which participant's mic is active, or null. Only one at a time. */
  listeningFor: Speaker | null
  /** Live (not-yet-final) transcript, for display in the composer. */
  interim: string
  /** Begins recognition for a participant in their language. */
  start: (speaker: Speaker, langCode: LanguageCode) => void
  /** Stops recognition gracefully (any pending final result still fires). */
  stop: () => void
  /** Discard trailing results when sending or leaving a session. */
  cancel: () => void
}

interface Options {
  /** Receives each final transcript chunk for the speaker who dictated it. */
  onFinalTranscript: (speaker: Speaker, text: string) => void
  /** Surfaces a user-facing error message (null-message errors are swallowed). */
  onError?: (message: string) => void
}

/**
 * Owns browser speech-to-text for the app. A single recognizer is active at a
 * time; starting a new one aborts the old. Unsupported browsers / insecure
 * contexts resolve to `available: false` so the UI can fall back to typing.
 * Nothing is simulated — if there is no engine, nothing is recognized.
 */
export function useSpeechRecognition({
  onFinalTranscript,
  onError,
}: Options): SpeechRecognitionController {
  const supported = isRecognitionSupported()
  const secure = isSecureContextForSpeech()
  const available = supported && secure

  const [listening, setListening] = useState(false)
  const [listeningFor, setListeningFor] = useState<Speaker | null>(null)
  const [interim, setInterim] = useState('')

  const recognizerRef = useRef<Recognizer | null>(null)
  // Monotonic token identifying the most recent `start`. Each recognizer's
  // callbacks capture the token they were created with and act only while it is
  // still the current one, so a superseded recognizer's late `onend`/`onresult`
  // (fired after an abort, or after a rapid switch) can never clobber the state
  // of the recognizer that replaced it.
  const generationRef = useRef(0)
  // Keep handler refs current without re-creating `start`.
  const onFinalRef = useRef(onFinalTranscript)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onFinalRef.current = onFinalTranscript
    onErrorRef.current = onError
  })

  const reset = useCallback(() => {
    recognizerRef.current = null
    setListening(false)
    setListeningFor(null)
    setInterim('')
  }, [])

  const stop = useCallback(() => {
    recognizerRef.current?.stop()
  }, [])

  const cancel = useCallback(() => {
    ++generationRef.current
    const previous = recognizerRef.current
    reset()
    previous?.abort()
  }, [reset])

  const start = useCallback(
    (speaker: Speaker, langCode: LanguageCode) => {
      if (!available) {
        const message = !supported
          ? 'Voice input isn’t supported in this browser — type your message instead.'
          : 'Voice input needs a secure (HTTPS) connection — type your message instead.'
        onErrorRef.current?.(message)
        return
      }

      // Single active recognizer. Claim a new generation first so the previous
      // recognizer's trailing callbacks are ignored, then abort it.
      const previous = recognizerRef.current
      const generation = ++generationRef.current
      const isCurrent = () => generationRef.current === generation
      setInterim('')

      const recognizer = createRecognizer(toRecognitionLang(langCode), {
        onStart: () => {
          if (!isCurrent()) return
          setListening(true)
          setListeningFor(speaker)
        },
        onInterim: (text) => {
          if (isCurrent()) setInterim(text)
        },
        onFinal: (text) => {
          if (isCurrent() && text.trim()) onFinalRef.current(speaker, text)
        },
        onError: (code) => {
          if (!isCurrent()) return
          const message = recognitionErrorMessage(code)
          if (message) onErrorRef.current?.(message)
        },
        onEnd: () => {
          if (isCurrent()) reset()
        },
      })

      if (!recognizer) {
        onErrorRef.current?.(
          'Voice input isn’t supported in this browser — type your message instead.',
        )
        return
      }

      recognizerRef.current = recognizer
      previous?.abort()
      try {
        recognizer.start()
      } catch {
        // start() throws if called while already active; treat as a no-op.
        if (isCurrent()) {
          reset()
          onErrorRef.current?.('Could not start the microphone. Check browser permissions, or type instead.')
        }
      }
    },
    [available, supported, reset],
  )

  // Abort any in-flight recognition if the app unmounts.
  useEffect(() => {
    const generation = generationRef
    return () => {
      ++generation.current
      recognizerRef.current?.abort()
      recognizerRef.current = null
    }
  }, [])

  return { supported, secure, available, listening, listeningFor, interim, start, stop, cancel }
}
