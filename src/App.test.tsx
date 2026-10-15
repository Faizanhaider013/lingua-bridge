import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The translation client is mocked at the module boundary so the full
// orchestration in App (dictate → translate → speak, interrupt, retry, cleanup)
// runs for real against a controllable backend. Speech recognition and
// synthesis run for real too, over fake browser engines installed on `window`
// (mirroring the approach in the stt/tts unit tests) — nothing about the loop's
// wiring is stubbed out.
const mocks = vi.hoisted(() => ({ requestTranslation: vi.fn() }))

vi.mock('./lib/translate', () => {
  class TranslationError extends Error {
    readonly code: string
    constructor(message: string, code: string) {
      super(message)
      this.name = 'TranslationError'
      this.code = code
    }
  }
  return {
    TranslationError,
    requestTranslation: mocks.requestTranslation,
    fetchTranslationInfo: () =>
      Promise.resolve({ provider: 'mock', maxTextLength: 2000, ready: true }),
    pingBackend: () => Promise.resolve(true),
  }
})

import App from './App'
import { TranslationError } from './lib/translate'

// ---- Fake speech synthesis (TTS) ------------------------------------------

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
  return {
    lang,
    name: `${lang} voice`,
    default: false,
    localService: true,
    voiceURI: lang,
  } as SpeechSynthesisVoice
}

let synth: {
  getVoices: () => SpeechSynthesisVoice[]
  addEventListener: () => void
  removeEventListener: () => void
  cancel: ReturnType<typeof vi.fn>
  speak: ReturnType<typeof vi.fn>
}
let utterances: FakeUtterance[]

function installSynth(langs: string[]) {
  utterances = []
  synth = {
    getVoices: () => langs.map(voice),
    addEventListener: () => {},
    removeEventListener: () => {},
    cancel: vi.fn(),
    speak: vi.fn((u: FakeUtterance) => utterances.push(u)),
  }
  ;(window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth
  ;(globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    FakeUtterance
}

// ---- Fake speech recognition (STT) ----------------------------------------

let startedRecognizers: FakeRecognition[] = []

class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onstart: (() => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null
  start() {
    startedRecognizers.push(this)
    this.onstart?.()
  }
  stop() {
    this.onend?.()
  }
  abort() {
    this.onend?.()
  }
}

function installRecognition() {
  ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition
}

function latestRecognizer(): FakeRecognition {
  const rec = startedRecognizers[startedRecognizers.length - 1]
  if (!rec) throw new Error('no recognizer has started')
  return rec
}

/** Fires a final recognition result on the active recognizer. */
function dictate(text: string) {
  act(() => {
    latestRecognizer().onresult?.({
      resultIndex: 0,
      results: { 0: { 0: { transcript: text }, isFinal: true, length: 1 }, length: 1 },
    })
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets a settled promise's full `.then().catch().finally()` chain drain. */
async function flushMicrotasks() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

// ---- DOM query helpers -----------------------------------------------------

const textbox = () => screen.getByRole('textbox') as HTMLTextAreaElement
const sendButton = () => screen.getByRole('button', { name: 'Send' })
const transcript = () => screen.getByRole('list', { name: /Conversation transcript/i })

function type(text: string) {
  fireEvent.change(textbox(), { target: { value: text } })
}

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  startedRecognizers = []
  mocks.requestTranslation.mockReset()
})

afterEach(() => {
  cleanup()
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis
  delete (globalThis as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
})

describe('voice conversation loop (Phase 3.3)', () => {
  it('finishes checking voices even when the device has none installed', async () => {
    vi.useFakeTimers()
    try {
      installSynth([])
      installRecognition()
      render(<App />)
      expect(screen.getByText(/Checking installed English voices/)).toBeTruthy()
      await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
      expect(screen.queryByText(/Checking installed English voices/)).toBeNull()
      expect(screen.getByText(/No installed English voice/)).toBeTruthy()
      expect(screen.getByText(/No installed Spanish voice/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not send while Enter confirms an IME composition', async () => {
    installSynth(['en-US'])
    render(<App />)
    type('日本語')
    fireEvent.keyDown(textbox(), { key: 'Enter', isComposing: true })
    expect(mocks.requestTranslation).not.toHaveBeenCalled()
    expect(textbox().value).toBe('日本語')
    mocks.requestTranslation.mockResolvedValue('Japanese')
    fireEvent.keyDown(textbox(), { key: 'Enter', isComposing: false })
    await waitFor(() => expect(mocks.requestTranslation).toHaveBeenCalledTimes(1))
  })

  it('keeps all languages and switches the composer direction for Urdu', async () => {
    installSynth(['en-US'])
    render(<App />)
    const selector = screen.getByRole('combobox', { name: 'Your language' })
    expect(within(selector).getAllByRole('option')).toHaveLength(15)
    fireEvent.change(selector, { target: { value: 'ur' } })
    expect(textbox().getAttribute('dir')).toBe('rtl')
    expect(textbox().getAttribute('lang')).toBe('ur')
    expect(screen.getByLabelText('Translation direction: Urdu to Spanish')).toBeTruthy()
    mocks.requestTranslation.mockResolvedValue('Hola')
    type('سلام')
    fireEvent.click(sendButton())
    await waitFor(() => expect(within(transcript()).getByText('سلام').getAttribute('dir')).toBe('rtl'))
    expect(mocks.requestTranslation.mock.calls[0][0]).toMatchObject({ sourceLang: 'ur', targetLang: 'es' })
  })

  it('runs the full dictate → translate → speak flow', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    mocks.requestTranslation.mockResolvedValue('hola')

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    dictate('hello')

    // Dictation fills the composer for review — nothing sent yet.
    expect(textbox().value).toContain('hello')
    expect(mocks.requestTranslation).not.toHaveBeenCalled()

    fireEvent.click(sendButton())

    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1))
    // Translated into the recipient's language and spoken aloud.
    expect(mocks.requestTranslation).toHaveBeenCalledTimes(1)
    expect(mocks.requestTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello', sourceLang: 'en', targetLang: 'es' }),
    )
    expect(utterances[0]!.text).toBe('hola')
    expect(utterances[0]!.voice?.lang).toBe('es-ES')
    expect(within(transcript()).getByText('hello')).toBeTruthy()
    expect(within(transcript()).getByText('hola')).toBeTruthy()
  })

  it('interrupts active speech and does not auto-speak the cut-in', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    mocks.requestTranslation.mockResolvedValue('hola')

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    dictate('hello')
    fireEvent.click(sendButton())
    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1))

    const cancelsBefore = synth.cancel.mock.calls.length
    const speaksBefore = synth.speak.mock.calls.length

    // Recipient cuts in with a typed message via the Interrupt control.
    mocks.requestTranslation.mockResolvedValue('déjame hablar')
    type('let me finish')
    fireEvent.click(screen.getByRole('button', { name: /Interrupt/i }))

    // Speech was cancelled immediately…
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore)

    await waitFor(() => expect(within(transcript()).getByText('let me finish')).toBeTruthy())
    // …the cut-in is marked as an interruption…
    expect(within(transcript()).getByText('Interrupted')).toBeTruthy()
    // …and a typed interruption is NOT auto-spoken.
    expect(synth.speak.mock.calls.length).toBe(speaksBefore)
  })

  it('stops recognition and ends the session cleanly', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    mocks.requestTranslation.mockResolvedValue('hola')

    render(<App />)

    // Start then stop recognition.
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    expect(screen.getByRole('button', { name: 'Stop voice input for You' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stop voice input for You' }))
    expect(screen.getByRole('button', { name: 'Start voice input for You' })).toBeTruthy()

    // Send a message, then end the session.
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    dictate('hello')
    fireEvent.click(sendButton())
    await waitFor(() => expect(within(transcript()).getByText('hola')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))

    // Speech cancelled and the timeline cleared back to the empty state.
    expect(synth.cancel).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('list', { name: /Conversation transcript/i })).toBeNull())
    expect(screen.getByText(/Someone has to go first/i)).toBeTruthy()
  })

  it('switches the active participant one mic at a time', () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    // You is listening; Them's mic is held off (one at a time).
    expect(screen.getByRole('button', { name: 'Stop voice input for You' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Start voice input for Them' }) as HTMLButtonElement).disabled).toBe(true)

    // Stop You, then switch to Them.
    fireEvent.click(screen.getByRole('button', { name: 'Stop voice input for You' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for Them' }))

    expect(screen.getByRole('button', { name: 'Stop voice input for Them' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start voice input for You' })).toBeTruthy()
    // Sender followed the active mic.
    const senders = within(screen.getByRole('group', { name: /Choose who is sending/i }))
    expect(senders.getByRole('button', { name: 'Them' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('prevents duplicate submissions for one turn', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    const d = deferred<string>()
    mocks.requestTranslation.mockReturnValue(d.promise)

    render(<App />)
    type('hello')

    // Two Enter presses in the same tick must produce exactly one send.
    act(() => {
      fireEvent.keyDown(textbox(), { key: 'Enter' })
      fireEvent.keyDown(textbox(), { key: 'Enter' })
    })

    expect(mocks.requestTranslation).toHaveBeenCalledTimes(1)

    await act(async () => {
      d.resolve('hola')
      await flushMicrotasks()
    })
    expect(within(transcript()).getAllByText('hello')).toHaveLength(1)
  })

  it('ignores a translation that resolves after the session ends (stale callback)', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    const d = deferred<string>()
    mocks.requestTranslation.mockReturnValue(d.promise)

    render(<App />)
    type('hello')
    fireEvent.click(sendButton())

    // End the session while the translation is still in flight.
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))

    // The late response must not resurrect a message or speak.
    await act(async () => {
      d.resolve('hola')
      await flushMicrotasks()
    })
    expect(screen.queryByText('hola')).toBeNull()
    expect(synth.speak).not.toHaveBeenCalled()
  })

  it('keeps a new session locked when an old aborted request settles', async () => {
    installSynth(['en-US', 'es-ES'])
    const old = deferred<string>()
    const current = deferred<string>()
    mocks.requestTranslation.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    render(<App />)
    type('old session')
    fireEvent.click(sendButton())
    fireEvent.click(screen.getByRole('button', { name: 'End session' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End session' }))
    type('new session')
    fireEvent.click(sendButton())
    await act(async () => { old.resolve('stale'); await flushMicrotasks() })
    type('another message')
    fireEvent.keyDown(textbox(), { key: 'Enter' })
    expect(mocks.requestTranslation).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('stale')).toBeNull()
    await act(async () => { current.resolve('nuevo'); await flushMicrotasks() })
    expect(within(transcript()).getByText('nuevo')).toBeTruthy()
  })

  it('retains the original on failure, offers retry, and never speaks an invalid translation', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    mocks.requestTranslation.mockRejectedValueOnce(
      new TranslationError('Daily quota exceeded. Try later.', 'quota'),
    )

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    dictate('hello')
    fireEvent.click(sendButton())

    await waitFor(() => expect(screen.getByText(/Daily quota exceeded/i)).toBeTruthy())
    // Original retained; failed translation never spoken.
    expect(within(transcript()).getByText('hello')).toBeTruthy()
    expect(synth.speak).not.toHaveBeenCalled()

    // Retry succeeds and now the translation is spoken.
    mocks.requestTranslation.mockResolvedValueOnce('hola')
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    await waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1))
    expect(within(transcript()).getByText('hola')).toBeTruthy()
  })

  it('does not fake audio when no voice exists for the target language', async () => {
    installSynth(['en-US']) // no Spanish voice
    installRecognition()
    mocks.requestTranslation.mockResolvedValue('hola')

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    dictate('hello')
    fireEvent.click(sendButton())

    await waitFor(() => expect(within(transcript()).getByText('hola')).toBeTruthy())
    expect(synth.speak).not.toHaveBeenCalled()
    expect(screen.getByText(/No Spanish voice on this device/i)).toBeTruthy()
  })

  it('falls back to typing when speech recognition is unsupported', async () => {
    installSynth(['en-US', 'es-ES'])
    // No SpeechRecognition installed.
    mocks.requestTranslation.mockResolvedValue('hola')

    render(<App />)
    expect(screen.getAllByText(/Voice input not supported in this browser/i).length).toBeGreaterThan(0)

    type('hello')
    fireEvent.click(sendButton())
    await waitFor(() => expect(within(transcript()).getByText('hola')).toBeTruthy())
  })

  it('cleans up pending work on unmount without speaking afterward', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    const d = deferred<string>()
    mocks.requestTranslation.mockReturnValue(d.promise)

    const { unmount } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    dictate('hello')
    fireEvent.click(sendButton())

    const cancelsBefore = synth.cancel.mock.calls.length
    unmount()
    expect(synth.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore) // synthesis torn down

    // A translation that resolves after unmount must not speak.
    await act(async () => {
      d.resolve('hola')
      await flushMicrotasks()
    })
    expect(synth.speak).not.toHaveBeenCalled()
  })
})

describe('unified status and capability transparency (Phase 3.4)', () => {
  const phaseOf = (container: HTMLElement) =>
    (container.querySelector('[data-phase]') as HTMLElement | null)?.getAttribute('data-phase')
  const statusEl = (container: HTMLElement) =>
    container.querySelector('[data-phase]') as HTMLElement

  it('shows the active speaker and recognition language while listening', () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()

    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))

    expect(phaseOf(container)).toBe('listening')
    expect(statusEl(container).textContent).toMatch(/You/)
    expect(statusEl(container).textContent).toMatch(/English/)
  })

  it('names the language being spoken during playback', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    mocks.requestTranslation.mockResolvedValue('hola')

    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Start voice input for You' }))
    dictate('hello')
    fireEvent.click(sendButton())

    await waitFor(() => expect(phaseOf(container)).toBe('speaking'))
    expect(statusEl(container).textContent).toMatch(/Spanish/)
  })

  it('declares per-language voice capability honestly from installed voices', async () => {
    installSynth(['en-US']) // English voice present, Spanish absent
    installRecognition()

    render(<App />)
    const them = within(screen.getByRole('region', { name: /Them panel/i }))
    const you = within(screen.getByRole('region', { name: /You panel/i }))

    // Spanish (Them) has no installed voice → honest text-only fallback.
    await waitFor(() => expect(them.getByText(/No installed Spanish voice/i)).toBeTruthy())
    // English (You) can be spoken.
    expect(you.getByText(/English can be spoken aloud/i)).toBeTruthy()
  })

  it('distinguishes missing speech synthesis from a missing voice', () => {
    // No speechSynthesis installed at all.
    installRecognition()

    render(<App />)
    const you = within(screen.getByRole('region', { name: /You panel/i }))
    expect(you.getByText(/Spoken output isn.t supported in this browser/i)).toBeTruthy()
  })

  it('clears the interrupted indicator after a normal send', async () => {
    installSynth(['en-US', 'es-ES'])
    installRecognition()
    mocks.requestTranslation.mockResolvedValue('x')

    const { container } = render(<App />)

    // Cut in (typed) → the loop settles to an "interrupted" indicator.
    type('cut in')
    fireEvent.click(screen.getByRole('button', { name: /Interrupt/i }))
    await waitFor(() => expect(phaseOf(container)).toBe('interrupted'))

    // A subsequent normal send must not leave a stale "interrupted" status.
    type('carry on')
    fireEvent.click(sendButton())
    await waitFor(() => expect(phaseOf(container)).toBe('idle'))
  })
})
