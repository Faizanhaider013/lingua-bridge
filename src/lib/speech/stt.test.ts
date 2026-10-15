import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRecognizer,
  getRecognitionCtor,
  recognitionErrorMessage,
  type RecognizerHandlers,
} from './stt'

/** Minimal fake of a SpeechRecognition instance the tests can drive. */
class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onstart: (() => void) | null = null
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn(() => this.onstart?.())
  stop = vi.fn()
  abort = vi.fn()

  // Test helpers:
  emit(parts: Array<{ transcript: string; isFinal: boolean }>, resultIndex = 0) {
    const results = parts.map((p) => {
      const r = { 0: { transcript: p.transcript }, isFinal: p.isFinal, length: 1 }
      return r
    }) as unknown as { length: number; [i: number]: unknown }
    ;(results as { length: number }).length = parts.length
    this.onresult?.({ resultIndex, results })
  }
  fail(error: string) {
    this.onerror?.({ error })
  }
}

let created: FakeRecognition[] = []

function installRecognition(prefixed = false) {
  created = []
  const Ctor = function (this: FakeRecognition) {
    const inst = new FakeRecognition()
    created.push(inst)
    return inst
  } as unknown as new () => FakeRecognition
  const key = prefixed ? 'webkitSpeechRecognition' : 'SpeechRecognition'
  ;(window as unknown as Record<string, unknown>)[key] = Ctor
}

function uninstallRecognition() {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
}

afterEach(() => uninstallRecognition())

describe('getRecognitionCtor', () => {
  it('returns null when no engine exists', () => {
    uninstallRecognition()
    expect(getRecognitionCtor()).toBeNull()
  })
  it('finds the standard and webkit-prefixed constructors', () => {
    installRecognition(false)
    expect(getRecognitionCtor()).not.toBeNull()
    uninstallRecognition()
    installRecognition(true)
    expect(getRecognitionCtor()).not.toBeNull()
  })
})

describe('createRecognizer', () => {
  it('returns null when recognition is unsupported', () => {
    uninstallRecognition()
    expect(createRecognizer('es-ES', {})).toBeNull()
  })

  it('configures the recognition instance for one-utterance interim dictation', () => {
    installRecognition()
    createRecognizer('ur-PK', {})
    const inst = created[0]!
    expect(inst.lang).toBe('ur-PK')
    expect(inst.interimResults).toBe(true)
    expect(inst.continuous).toBe(false)
    expect(inst.maxAlternatives).toBe(1)
  })

  it('separates interim and final transcripts from a result event', () => {
    installRecognition()
    const onInterim = vi.fn()
    const onFinal = vi.fn()
    const handlers: RecognizerHandlers = { onInterim, onFinal }
    createRecognizer('en-US', handlers)
    const inst = created[0]!
    inst.emit([{ transcript: 'hello wor', isFinal: false }])
    expect(onInterim).toHaveBeenLastCalledWith('hello wor')
    expect(onFinal).not.toHaveBeenCalled()
    inst.emit([{ transcript: 'hello world', isFinal: true }])
    expect(onFinal).toHaveBeenLastCalledWith('hello world')
  })

  it('reports start and end through handlers', () => {
    installRecognition()
    const onStart = vi.fn()
    const onEnd = vi.fn()
    const rec = createRecognizer('en-US', { onStart, onEnd })!
    rec.start()
    expect(onStart).toHaveBeenCalledOnce()
    created[0]!.onend?.()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('maps recognition errors to codes', () => {
    installRecognition()
    const onError = vi.fn()
    createRecognizer('en-US', { onError })
    created[0]!.fail('not-allowed')
    expect(onError).toHaveBeenCalledWith('not-allowed')
    created[0]!.fail('some-future-error')
    expect(onError).toHaveBeenLastCalledWith('unknown')
  })

  it('starts the engine at most once', () => {
    installRecognition()
    const rec = createRecognizer('en-US', {})!
    rec.start()
    rec.start()
    expect(created[0]!.start).toHaveBeenCalledOnce()
  })

  it('delegates stop and abort', () => {
    installRecognition()
    const rec = createRecognizer('en-US', {})!
    rec.stop()
    rec.abort()
    expect(created[0]!.stop).toHaveBeenCalledOnce()
    expect(created[0]!.abort).toHaveBeenCalledOnce()
  })
})

describe('recognitionErrorMessage', () => {
  it('is silent (null) for an expected abort', () => {
    expect(recognitionErrorMessage('aborted')).toBeNull()
  })
  it('gives actionable copy for permission, no-speech, capture, network, and language errors', () => {
    expect(recognitionErrorMessage('not-allowed')).toMatch(/blocked|allow/i)
    expect(recognitionErrorMessage('service-not-allowed')).toMatch(/blocked|allow/i)
    expect(recognitionErrorMessage('no-speech')).toMatch(/no speech/i)
    expect(recognitionErrorMessage('audio-capture')).toMatch(/microphone/i)
    expect(recognitionErrorMessage('network')).toMatch(/internet|network/i)
    expect(recognitionErrorMessage('language-not-supported')).toMatch(/language/i)
    expect(recognitionErrorMessage('unknown')).toMatch(/failed|try again/i)
  })
})
