import { afterEach, describe, expect, it } from 'vitest'
import {
  findVoiceForLanguage,
  getVoices,
  hasVoiceForLanguage,
  isRecognitionSupported,
  isSynthesisSupported,
  loadVoices,
} from './capabilities'

type FakeSynth = {
  getVoices: () => SpeechSynthesisVoice[]
  addEventListener: (t: string, cb: () => void) => void
  removeEventListener: (t: string, cb: () => void) => void
  cancel: () => void
  speak: () => void
  _setVoices: (v: SpeechSynthesisVoice[]) => void
  _fire: () => void
}

function voice(lang: string, extra: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    lang,
    name: extra.name ?? `${lang} voice`,
    default: extra.default ?? false,
    localService: true,
    voiceURI: extra.name ?? lang,
  } as SpeechSynthesisVoice
}

function installSynth(initial: SpeechSynthesisVoice[]): FakeSynth {
  let voices = initial
  const listeners = new Set<() => void>()
  const synth: FakeSynth = {
    getVoices: () => voices,
    addEventListener: (t, cb) => {
      if (t === 'voiceschanged') listeners.add(cb)
    },
    removeEventListener: (_t, cb) => {
      listeners.delete(cb)
    },
    cancel: () => {},
    speak: () => {},
    _setVoices: (v) => {
      voices = v
    },
    _fire: () => listeners.forEach((cb) => cb()),
  }
  ;(window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth
  return synth
}

function uninstallSynth() {
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis
}

afterEach(() => uninstallSynth())

describe('isSynthesisSupported', () => {
  it('is false when speechSynthesis is absent', () => {
    uninstallSynth()
    expect(isSynthesisSupported()).toBe(false)
    expect(getVoices()).toEqual([])
  })

  it('is true when speechSynthesis is present', () => {
    installSynth([])
    expect(isSynthesisSupported()).toBe(true)
  })
})

describe('isRecognitionSupported', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  })

  it('is false when neither constructor exists', () => {
    expect(isRecognitionSupported()).toBe(false)
  })
  it('is true with the standard or webkit-prefixed constructor', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = function () {}
    expect(isRecognitionSupported()).toBe(true)
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = function () {}
    expect(isRecognitionSupported()).toBe(true)
  })
})

describe('findVoiceForLanguage', () => {
  it('returns null when there are no voices', () => {
    installSynth([])
    expect(findVoiceForLanguage('es', [])).toBeNull()
    expect(hasVoiceForLanguage('es', [])).toBe(false)
  })

  it('returns null when no voice matches the language (e.g. missing Urdu)', () => {
    const voices = [voice('en-US'), voice('es-ES')]
    expect(findVoiceForLanguage('ur', voices)).toBeNull()
    expect(hasVoiceForLanguage('ur', voices)).toBe(false)
  })

  it('matches by primary subtag so a regional variant satisfies the language', () => {
    const esMx = voice('es-MX')
    expect(findVoiceForLanguage('es', [voice('en-US'), esMx])).toBe(esMx)
  })

  it('prefers an exact tag match over other regional variants', () => {
    const esMx = voice('es-MX')
    const esEs = voice('es-ES')
    expect(findVoiceForLanguage('es', [esMx, esEs])).toBe(esEs)
  })

  it('prefers the default voice when no exact tag matches', () => {
    const a = voice('es-MX')
    const b = voice('es-AR', { default: true })
    expect(findVoiceForLanguage('es', [a, b])).toBe(b)
  })
})

describe('loadVoices', () => {
  it('resolves immediately when voices are already available', async () => {
    installSynth([voice('en-US')])
    const voices = await loadVoices()
    expect(voices).toHaveLength(1)
  })

  it('waits for voiceschanged when the first read is empty', async () => {
    const synth = installSynth([])
    const promise = loadVoices(1000)
    // Voices populate asynchronously, then the engine fires the event.
    synth._setVoices([voice('es-ES'), voice('en-US')])
    synth._fire()
    const voices = await promise
    expect(voices.map((v) => v.lang)).toEqual(['es-ES', 'en-US'])
  })

  it('resolves to [] when synthesis is unsupported', async () => {
    uninstallSynth()
    expect(await loadVoices()).toEqual([])
  })
})
