import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelSpeech, speak } from './tts'

class FakeUtterance {
  text: string
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

function voice(lang: string): SpeechSynthesisVoice {
  return { lang, name: `${lang} voice`, default: false, localService: true, voiceURI: lang } as SpeechSynthesisVoice
}

interface Installed {
  calls: string[]
  utterances: FakeUtterance[]
}

function installSynth(voices: SpeechSynthesisVoice[]): Installed {
  const calls: string[] = []
  const utterances: FakeUtterance[] = []
  const synth = {
    getVoices: () => voices,
    addEventListener: () => {},
    removeEventListener: () => {},
    cancel: () => calls.push('cancel'),
    speak: (u: FakeUtterance) => {
      calls.push('speak')
      utterances.push(u)
    },
  }
  ;(window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance
  return { calls, utterances }
}

afterEach(() => {
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis
  delete (globalThis as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance
})

describe('speak', () => {
  it('returns unsupported and calls onError when synthesis is absent', () => {
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis
    const onError = vi.fn()
    const result = speak('hola', 'es', { onError })
    expect(result).toEqual({ started: false, reason: 'unsupported' })
    expect(onError).toHaveBeenCalledWith('unsupported')
  })

  it('returns no-voice (and does not speak) when the language has no voice', () => {
    const { calls } = installSynth([voice('en-US')]) // no Urdu voice
    const onError = vi.fn()
    const result = speak('سلام', 'ur', { onError })
    expect(result).toEqual({ started: false, reason: 'no-voice' })
    expect(onError).toHaveBeenCalledWith('no-voice')
    expect(calls).not.toContain('speak')
  })

  it('cancels current speech before speaking the new utterance', () => {
    const { calls, utterances } = installSynth([voice('es-ES')])
    const result = speak('hola mundo', 'es')
    expect(result.started).toBe(true)
    expect(calls).toEqual(['cancel', 'speak']) // cancel precedes speak
    expect(utterances[0]!.text).toBe('hola mundo')
    expect(utterances[0]!.voice?.lang).toBe('es-ES')
  })

  it('reports onStart and onEnd through the utterance lifecycle', () => {
    const { utterances } = installSynth([voice('es-ES')])
    const onStart = vi.fn()
    const onEnd = vi.fn()
    speak('hola', 'es', { onStart, onEnd })
    const u = utterances[0]!
    u.onstart?.()
    u.onend?.()
    expect(onStart).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('treats an "interrupted" error as a quiet end, not a failure', () => {
    const { utterances } = installSynth([voice('es-ES')])
    const onEnd = vi.fn()
    const onError = vi.fn()
    speak('hola', 'es', { onEnd, onError })
    utterances[0]!.onerror?.({ error: 'interrupted' })
    expect(onError).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('reports a genuine synthesis error', () => {
    const { utterances } = installSynth([voice('es-ES')])
    const onError = vi.fn()
    speak('hola', 'es', { onError })
    utterances[0]!.onerror?.({ error: 'synthesis-failed' })
    expect(onError).toHaveBeenCalledWith('synthesis-error')
  })
})

describe('cancelSpeech', () => {
  it('cancels via speechSynthesis when supported', () => {
    const { calls } = installSynth([])
    cancelSpeech()
    expect(calls).toEqual(['cancel'])
  })

  it('is a no-op (no throw) when synthesis is absent', () => {
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis
    expect(() => cancelSpeech()).not.toThrow()
  })
})
