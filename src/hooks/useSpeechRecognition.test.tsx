import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpeechRecognition } from './useSpeechRecognition'

// A fake SpeechRecognition whose lifecycle callbacks are fired manually by the
// test, so we can reproduce the ordering that happens on a real engine: an
// aborted recognizer's `onend`/`onresult` arriving *after* a replacement has
// started. start/stop/abort are inert (they never auto-fire callbacks).
class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onstart: (() => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    recognitions.push(this)
  }
}

let recognitions: FakeRecognition[] = []

function fireFinal(rec: FakeRecognition, text: string) {
  rec.onresult?.({
    resultIndex: 0,
    results: { 0: { 0: { transcript: text }, isFinal: true, length: 1 }, length: 1 },
  })
}

beforeEach(() => {
  recognitions = []
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition
})

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
})

describe('useSpeechRecognition — lifecycle robustness', () => {
  it('discards delayed transcripts after cancel and unmount', () => {
    const onFinal = vi.fn()
    const { result, unmount } = renderHook(() => useSpeechRecognition({ onFinalTranscript: onFinal }))
    act(() => result.current.start('you', 'en'))
    act(() => recognitions[0]!.onstart?.())
    act(() => result.current.cancel())
    act(() => fireFinal(recognitions[0]!, 'late result after session reset'))
    expect(onFinal).not.toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
    expect(recognitions[0]!.abort).toHaveBeenCalled()
    act(() => result.current.start('you', 'en'))
    unmount()
    act(() => fireFinal(recognitions[1]!, 'late result after unmount'))
    expect(onFinal).not.toHaveBeenCalled()
  })

  it('detects availability in a secure, supported context', () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }))
    expect(result.current.available).toBe(true)
  })

  it('ignores a superseded recognizer’s trailing callbacks when switching participants', () => {
    const onFinal = vi.fn()
    const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: onFinal }))

    act(() => result.current.start('you', 'en'))
    act(() => recognitions[0]!.onstart?.())
    expect(result.current.listening).toBe(true)
    expect(result.current.listeningFor).toBe('you')

    // Switch to the other participant: a new recognizer is created and the old
    // one is aborted.
    act(() => result.current.start('other', 'es'))
    expect(recognitions[0]!.abort).toHaveBeenCalled()

    // The aborted recognizer's late onend must NOT reset the hook's state…
    act(() => recognitions[0]!.onend?.())
    expect(result.current.listening).toBe(true)

    // …and the new recognizer takes over cleanly.
    act(() => recognitions[1]!.onstart?.())
    expect(result.current.listeningFor).toBe('other')

    // A stale final result from the old recognizer is dropped.
    act(() => fireFinal(recognitions[0]!, 'stale words'))
    expect(onFinal).not.toHaveBeenCalled()

    // The active recognizer's final result is delivered for the right speaker.
    act(() => fireFinal(recognitions[1]!, 'hola'))
    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('other', 'hola')
  })

  it('resets cleanly when the active recognizer ends', () => {
    const { result } = renderHook(() => useSpeechRecognition({ onFinalTranscript: vi.fn() }))
    act(() => result.current.start('you', 'en'))
    act(() => recognitions[0]!.onstart?.())

    act(() => result.current.stop())
    act(() => recognitions[0]!.onend?.())

    expect(result.current.listening).toBe(false)
    expect(result.current.listeningFor).toBeNull()
  })

  it('reports an error and does not start when recognition is unsupported', () => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useSpeechRecognition({ onFinalTranscript: vi.fn(), onError }),
    )
    expect(result.current.available).toBe(false)
    act(() => result.current.start('you', 'en'))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(result.current.listening).toBe(false)
  })
})
