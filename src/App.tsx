import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BackendStatusBanner } from './components/BackendStatusBanner'
import { Composer } from './components/Composer'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ConversationStatus } from './components/ConversationStatus'
import { DemoPreview } from './components/DemoPreview'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { ParticipantPanel, type VoiceOutput } from './components/ParticipantPanel'
import { SectionHeading } from './components/SectionHeading'
import { Timeline, type TimelineSpeech } from './components/Timeline'
import { Toast } from './components/Toast'
import {
  DEFAULT_LANGUAGE_A,
  DEFAULT_LANGUAGE_B,
  getLanguage,
} from './data/languages'
import { useBackendHealth } from './hooks/useBackendHealth'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis'
import { derivePhase } from './lib/conversation'
import { fetchTranslationInfo, requestTranslation, TranslationError } from './lib/translate'
import { MAX_MESSAGE_LENGTH } from './lib/config'
import { createSessionId } from './lib/session'
import type { ConversationEvent, LanguageCode, Message, MessageOrigin, Speaker } from './types'

/** Appends a dictated transcript chunk to the current draft with clean spacing. */
function appendTranscript(draft: string, text: string): string {
  const addition = text.trim()
  if (!addition) return draft
  if (!draft) return addition
  return /\s$/.test(draft) ? draft + addition : `${draft} ${addition}`
}

function App() {
  const [sessionId, setSessionId] = useState(createSessionId)
  const [youLang, setYouLang] = useState<LanguageCode>(DEFAULT_LANGUAGE_A)
  const [themLang, setThemLang] = useState<LanguageCode>(DEFAULT_LANGUAGE_B)
  const [sendAs, setSendAs] = useState<Speaker>('you')
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [showDemo, setShowDemo] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [maxLength, setMaxLength] = useState(MAX_MESSAGE_LENGTH)
  const [draft, setDraft] = useState('')
  // Explicit, trailing "a recipient just cut in" marker for the loop status.
  // It auto-expires so it can never stick (see effect below).
  const [interrupted, setInterrupted] = useState(false)

  const backendStatus = useBackendHealth()

  const tts = useSpeechSynthesis()
  // These controller callbacks are stable across renders (memoised in the
  // hooks), so handlers that depend on them stay stable too.
  const { speak: ttsSpeak, stop: ttsStop } = tts

  // Whether the current draft came from dictation. A voice-originated turn has
  // its translation spoken automatically; typing is spoken only on demand. Held
  // in a ref because it must be read synchronously at send time, not awaited.
  const voiceOriginRef = useRef(false)

  const stt = useSpeechRecognition({
    onFinalTranscript: (speaker, text) => {
      voiceOriginRef.current = true
      setSendAs(speaker)
      setDraft((prev) => appendTranscript(prev, text))
    },
    onError: (message) => notify(message),
  })
  const { start: sttStart, stop: sttStop, cancel: sttCancel } = stt

  const composerRef = useRef<HTMLTextAreaElement>(null)
  // In-flight translation requests, aborted on session end / unmount so a late
  // response can never resolve into a torn-down or reset conversation.
  const controllersRef = useRef<Set<AbortController>>(new Set())
  // Synchronous guard against duplicate/concurrent sends (double Enter, a held
  // key, a double click): released once the turn's translation settles.
  const sendLockRef = useRef(false)
  // Id of the newest message, read inside async callbacks to decide whether an
  // arriving translation is still the current turn (and so may auto-speak). Set
  // synchronously when a message is sent or the session ends — never via an
  // effect — so the guard can't race the translation that resolves right after.
  const lastMessageIdRef = useRef<string | null>(null)

  // Learn the active backend's message limit (provider-dependent) once on load.
  // Falls back to the default if the backend can't be reached.
  useEffect(() => {
    let cancelled = false
    fetchTranslationInfo().then((info) => {
      if (!cancelled) setMaxLength(info.maxTextLength)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-dismiss the current notice after a readable interval.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  // The "interrupted" marker is a brief, trailing status; expire it so the loop
  // always settles back to a truthful phase on its own.
  useEffect(() => {
    if (!interrupted) return
    const timer = window.setTimeout(() => setInterrupted(false), 1800)
    return () => window.clearTimeout(timer)
  }, [interrupted])

  // On unmount, abort any in-flight translation. (Speech recognition and
  // synthesis are torn down by their own hooks' cleanup.)
  useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      controllers.forEach((c) => c.abort())
      controllers.clear()
    }
  }, [])

  // Re-trigger the effect even when the same message fires twice in a row.
  const notify = useCallback((message: string) => {
    setToast(null)
    window.setTimeout(() => setToast(message), 0)
  }, [])

  const handleStart = useCallback(() => {
    composerRef.current?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' })
    composerRef.current?.focus({ preventScroll: true })
  }, [])

  const setPending = useCallback((id: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  /**
   * Runs (or re-runs) the translation for one message, updating it in place by
   * id. Updating by id is what keeps the timeline safe: a late or failed
   * response only ever touches its own message, never reorders others, and is
   * a no-op if that message is gone (e.g. the session was ended).
   *
   * On success, a voice-originated turn that is still the current turn speaks
   * its translation automatically — this is the hands-free leg of the loop. A
   * failed or superseded turn never speaks: we never voice an invalid or stale
   * translation.
   */
  const runTranslation = useCallback(
    (message: Message) => {
      setPending(message.id, true)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, status: 'translating', error: undefined } : m,
        ),
      )

      const controller = new AbortController()
      controllersRef.current.add(controller)

      requestTranslation({
        text: message.originalText,
        sourceLang: message.originalLang,
        targetLang: message.translatedLang,
        signal: controller.signal,
      })
        .then((translatedText) => {
          if (controller.signal.aborted) return
          setMessages((prev) =>
            prev.map((m) =>
              m.id === message.id
                ? { ...m, translatedText, status: 'done', error: undefined }
                : m,
            ),
          )
          // Complete the voice loop: speak the translation to the recipient —
          // but only for a voice turn that is still the latest message. If a
          // newer send/interruption arrived, or the session was ended, the id
          // no longer matches and we stay silent rather than play stale audio.
          if (message.origin === 'voice' && message.id === lastMessageIdRef.current) {
            ttsSpeak(message.id, translatedText, message.translatedLang)
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
            return
          }
          const errorText =
            err instanceof TranslationError
              ? err.message
              : 'Something went wrong while translating. Please try again.'
          setMessages((prev) =>
            prev.map((m) => (m.id === message.id ? { ...m, status: 'error', error: errorText } : m)),
          )
        })
        .finally(() => {
          controllersRef.current.delete(controller)
          if (controller.signal.aborted) return
          setPending(message.id, false)
          sendLockRef.current = false
        })
    },
    [setPending, ttsSpeak],
  )

  const sendMessage = useCallback(
    (text: string, origin: MessageOrigin, event?: ConversationEvent) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const sourceLang = sendAs === 'you' ? youLang : themLang
      const targetLang = sendAs === 'you' ? themLang : youLang

      const message: Message = {
        id: crypto.randomUUID(),
        speaker: sendAs,
        originalText: trimmed,
        originalLang: sourceLang,
        translatedText: '',
        translatedLang: targetLang,
        timestamp: new Date().toISOString(),
        status: 'translating',
        origin,
        ...(event ? { event } : {}),
      }

      lastMessageIdRef.current = message.id
      setMessages((prev) => [...prev, message])
      runTranslation(message)
    },
    [sendAs, youLang, themLang, runTranslation],
  )

  const handleRetry = useCallback(
    (id: string) => {
      if (sendLockRef.current) return
      const target = messages.find((m) => m.id === id)
      if (target?.status === 'error') {
        sendLockRef.current = true
        runTranslation(target)
      }
    },
    [messages, runTranslation],
  )

  // Send a message. Stops any dictation, cancels any active speech (so turns
  // never overlap and stale audio never lingers), and clears the composer.
  // `event === 'interruption'` additionally marks the loop as interrupted.
  const handleSend = useCallback(
    (text: string, event?: ConversationEvent) => {
      const trimmed = text.trim()
      if (!trimmed) return
      // Duplicate-submission guard: one send per turn until it settles.
      if (sendLockRef.current) return
      sendLockRef.current = true

      const origin: MessageOrigin = voiceOriginRef.current ? 'voice' : 'typed'
      sttCancel()
      ttsStop()
      // Mark (or clear) the interrupted indicator for this turn so it never
      // lingers past a normal send.
      setInterrupted(event === 'interruption')
      sendMessage(trimmed, origin, event)
      setDraft('')
      voiceOriginRef.current = false
    },
    [sttCancel, ttsStop, sendMessage],
  )

  // Begin voice input for a participant; make them the active sender.
  const handleMicStart = useCallback(
    (speaker: Speaker) => {
      ttsStop()
      lastMessageIdRef.current = null
      setInterrupted(false)
      setSendAs(speaker)
      sttStart(speaker, speaker === 'you' ? youLang : themLang)
    },
    [sttStart, ttsStop, youLang, themLang],
  )

  // Reset the voice-origin flag when the composer is manually cleared, so text
  // typed from scratch after a dictation is treated as typed (no auto-speak).
  const handleDraftChange = useCallback((value: string) => {
    if (value.trim() === '') voiceOriginRef.current = false
    setDraft(value)
  }, [])

  const handleEndSession = useCallback(() => {
    ttsStop()
    sttCancel()
    controllersRef.current.forEach((c) => c.abort())
    controllersRef.current.clear()
    sendLockRef.current = false
    voiceOriginRef.current = false
    lastMessageIdRef.current = null
    setInterrupted(false)
    setSessionId(createSessionId())
    setMessages([])
    setPendingIds(new Set())
    setDraft('')
    setShowDemo(false)
    setConfirmOpen(false)
    notify('Session ended. Ready for a new conversation.')
  }, [ttsStop, sttCancel, notify])

  const isPending = pendingIds.size > 0

  const micUnavailableReason = !stt.supported
    ? 'Voice input not supported in this browser — type instead'
    : !stt.secure
      ? 'Voice input needs HTTPS — type instead'
      : undefined

  const lastMessage = messages.length ? messages[messages.length - 1] : undefined
  const phase = derivePhase({
    listening: stt.listening,
    translating: isPending,
    speaking: tts.speakingId !== null,
    error: lastMessage?.status === 'error',
    interrupted,
  })

  // A concise, truthful context clause for the status readout: who is speaking
  // and in which language, the translation direction, or the spoken language.
  const composerSource = sendAs === 'you' ? youLang : themLang
  const composerTarget = sendAs === 'you' ? themLang : youLang
  const speakingMessage = tts.speakingId
    ? messages.find((m) => m.id === tts.speakingId)
    : undefined
  let phaseDetail: string | undefined
  if (phase === 'listening') {
    const who = stt.listeningFor === 'other' ? 'Them' : 'You'
    const lang = getLanguage(stt.listeningFor === 'other' ? themLang : youLang)
    phaseDetail = `${who} · ${lang.label}`
  } else if (phase === 'translating') {
    const from = lastMessage ? lastMessage.originalLang : composerSource
    const to = lastMessage ? lastMessage.translatedLang : composerTarget
    phaseDetail = `${getLanguage(from).label} → ${getLanguage(to).label}`
  } else if (phase === 'speaking' && speakingMessage) {
    phaseDetail = getLanguage(speakingMessage.translatedLang).label
  }

  // Honest spoken-output capability per side, from the real installed-voice
  // list (not the selector). `ready` guards against a false "missing" before
  // the async voice list has loaded.
  const voicesReady = tts.voicesReady
  const voiceOutputFor = (lang: LanguageCode): VoiceOutput => ({
    supported: tts.supported,
    ready: voicesReady,
    hasVoice: tts.hasVoiceFor(lang),
  })

  // Text-to-speech wiring shared across the real conversation timeline. A
  // message speaks its translation in the receiver's language; starting one
  // cancels any other (handled inside the hook). This is the on-demand control;
  // voice turns also auto-speak once (see runTranslation).
  const timelineSpeech: TimelineSpeech = {
    supported: tts.supported,
    speakingId: tts.speakingId,
    hasVoiceFor: tts.hasVoiceFor,
    onSpeak: (message) => {
      const result = ttsSpeak(message.id, message.translatedText, message.translatedLang)
      if (!result.started && result.reason === 'no-voice') {
        notify(`No ${getLanguage(message.translatedLang).label} voice is installed on this device.`)
      }
    },
    onStop: ttsStop,
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">Skip to conversation</a>
      <Header sessionId={sessionId} onEndSession={() => setConfirmOpen(true)} />

      <BackendStatusBanner status={backendStatus} />

      <Hero onStart={handleStart} />

      <main id="workspace" className="workspace" tabIndex={-1}>
        {/* 01 — Participants */}
        <section aria-label="Participants" className="participants-section">
          <SectionHeading number="01" title="Choose your languages" />
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <ParticipantPanel
              speaker="you"
              language={youLang}
              onLanguageChange={(lang) => { sttCancel(); ttsStop(); setYouLang(lang) }}
              mic={{
                available: stt.available,
                unavailableReason: micUnavailableReason,
                listening: stt.listeningFor === 'you',
                busy: stt.listening && stt.listeningFor !== 'you',
                onStart: () => handleMicStart('you'),
                onStop: sttStop,
              }}
              voiceOutput={voiceOutputFor(youLang)}
            />
            <ParticipantPanel
              speaker="other"
              language={themLang}
              onLanguageChange={(lang) => { sttCancel(); ttsStop(); setThemLang(lang) }}
              mic={{
                available: stt.available,
                unavailableReason: micUnavailableReason,
                listening: stt.listeningFor === 'other',
                busy: stt.listening && stt.listeningFor !== 'other',
                onStart: () => handleMicStart('other'),
                onStop: sttStop,
              }}
              voiceOutput={voiceOutputFor(themLang)}
            />
          </div>
          {stt.supported && (
            <p className="mt-4 max-w-2xl font-mono text-[11px] leading-relaxed text-ink/65">
              Voice input uses your browser’s built-in speech recognition, which
              on most browsers (e.g. Chrome) sends audio to a third-party service
              and requires an internet connection. Dictated text appears in the
              composer for you to review and edit before sending.
            </p>
          )}
        </section>

        {/* 02 — The argument */}
        <section aria-label="The argument" className="transcript-section">
          <SectionHeading
            number="02"
            title="The conversation"
            aside={
              <button
                type="button"
                onClick={() => setShowDemo((prev) => !prev)}
                aria-pressed={showDemo}
                className="inline-flex items-center gap-1.5 border border-ink/20 px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60 transition-colors hover:border-ink hover:text-ink"
              >
                {showDemo ? (
                  <EyeOff className="size-3.5" aria-hidden />
                ) : (
                  <Eye className="size-3.5" aria-hidden />
                )}
                {showDemo ? 'Hide demo' : 'Demo preview'}
              </button>
            }
          />
          <div className="transcript-content">
            <Timeline
              messages={messages}
              onStart={handleStart}
              onRetry={handleRetry}
              speech={timelineSpeech}
            />
            {showDemo && <DemoPreview />}
          </div>
        </section>

        {/* 03 — Your turn */}
        <section aria-label="Your turn" className="composer-section">
          <SectionHeading number="03" title="Your turn" />
          <div className="mt-5">
            <ConversationStatus phase={phase} detail={phaseDetail} />
            <Composer
              inputRef={composerRef}
              draft={draft}
              onDraftChange={handleDraftChange}
              sendAs={sendAs}
              onSendAsChange={(speaker) => { sttCancel(); setSendAs(speaker) }}
              youLang={youLang}
              themLang={themLang}
              pending={isPending}
              maxLength={maxLength}
              listening={stt.listening}
              interim={stt.interim}
              onSend={(text) => handleSend(text)}
              onInterrupt={(text) => handleSend(text, 'interruption')}
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/15 py-8">
        <p className="max-w-2xl font-mono text-xs leading-relaxed text-ink/65">
          Say It Anyway / An independent ZERO build-challenge project, not an official ZERO product.
          Messages stay in this tab until you end the session or reload. Text is sent to a third-party
          translation service (MyMemory by default); voice input may send audio to your browser’s
          speech service. These services have their own data policies.
        </p>
      </footer>

      <ConfirmDialog
        open={confirmOpen}
        title="End this session?"
        description="This clears the current session and starts a new one. Your conversation and draft will be cleared from this tab."
        confirmLabel="End session"
        onConfirm={handleEndSession}
        onCancel={() => setConfirmOpen(false)}
      />

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  )
}

export default App
