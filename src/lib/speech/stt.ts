/**
 * Thin, self-typed wrapper over the Web Speech API's `SpeechRecognition`
 * (prefixed `webkitSpeechRecognition` in Chromium/Safari).
 *
 * The API is not in the TS DOM lib reliably, so the minimal shapes are declared
 * here rather than depended on globally. Nothing simulates recognition: if the
 * constructor is absent, `createRecognizer` returns null and callers fall back
 * to typed input.
 *
 * PRIVACY: on Chromium browsers this engine is server-based — audio is sent to a
 * third-party service (e.g. Google) and requires an internet connection. The UI
 * discloses this; see README.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string
  readonly message?: string
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

export type RecognitionErrorCode =
  | 'not-allowed'
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'language-not-supported'
  | 'unknown'

const KNOWN_ERROR_CODES = new Set<RecognitionErrorCode>([
  'not-allowed',
  'service-not-allowed',
  'no-speech',
  'audio-capture',
  'network',
  'aborted',
  'language-not-supported',
])

export interface RecognizerHandlers {
  onStart?: () => void
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (code: RecognitionErrorCode) => void
  onEnd?: () => void
}

export interface Recognizer {
  start: () => void
  stop: () => void
  abort: () => void
}

/** The `SpeechRecognition` constructor, or null if the browser lacks it. */
export function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function normalizeError(raw: string): RecognitionErrorCode {
  return KNOWN_ERROR_CODES.has(raw as RecognitionErrorCode)
    ? (raw as RecognitionErrorCode)
    : 'unknown'
}

/**
 * Maps a recognition error to a user-facing message, or `null` when it should
 * be silent (an expected `aborted`, e.g. from switching mics or unmounting).
 */
export function recognitionErrorMessage(code: RecognitionErrorCode): string | null {
  switch (code) {
    case 'aborted':
      return null
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow it in your browser, or type instead.'
    case 'no-speech':
      return 'No speech was detected. Try again, or type your message.'
    case 'audio-capture':
      return 'No microphone was found. Check your device, or type instead.'
    case 'network':
      return 'Speech recognition needs internet and the network request failed. Type instead, or retry.'
    case 'language-not-supported':
      return 'This language isn’t available for speech input in this browser. Please type it.'
    default:
      return 'Speech recognition failed. Please try again, or type your message.'
  }
}

/**
 * Creates a one-utterance recognizer for `lang` (a BCP-47 tag). Returns null if
 * the browser has no recognition engine. `start()` must be called from a user
 * gesture; the browser prompts for microphone permission.
 */
export function createRecognizer(
  lang: string,
  handlers: RecognizerHandlers,
): Recognizer | null {
  const Ctor = getRecognitionCtor()
  if (!Ctor) return null

  const recognition = new Ctor()
  recognition.lang = lang
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 1

  recognition.onstart = () => handlers.onStart?.()

  recognition.onresult = (event) => {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]!
      const transcript = result[0]?.transcript ?? ''
      if (result.isFinal) final += transcript
      else interim += transcript
    }
    if (interim) handlers.onInterim?.(interim)
    if (final) handlers.onFinal?.(final)
  }

  recognition.onerror = (event) => handlers.onError?.(normalizeError(event.error))
  recognition.onend = () => handlers.onEnd?.()

  let started = false
  return {
    start: () => {
      if (started) return
      started = true
      recognition.start()
    },
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  }
}
