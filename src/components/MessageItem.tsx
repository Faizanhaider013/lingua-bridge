import {
  AlertTriangle,
  Loader2,
  PencilLine,
  RefreshCw,
  RotateCw,
  Square,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { getLanguage } from '../data/languages'
import { formatTime } from '../lib/format'
import type { ConversationEvent, Message } from '../types'

/** Text-to-speech wiring for a single message's translation. */
export interface MessageSpeech {
  /** Whether the browser supports speech synthesis at all. */
  supported: boolean
  /** Whether an installed voice can speak this message's target language. */
  hasVoice: boolean
  /** Whether this message is the one currently being spoken. */
  speaking: boolean
  onSpeak: () => void
  onStop: () => void
}

interface EventStyle {
  label: string
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  /** Tailwind classes for the event chip (bg + text). */
  chip: string
  /** Tailwind left-rule color class. */
  rule: string
}

const EVENT_STYLES: Record<ConversationEvent, EventStyle> = {
  interruption: {
    label: 'Interrupted',
    Icon: Zap,
    chip: 'bg-rust text-paper',
    rule: 'bg-orange',
  },
  correction: {
    label: 'Correction',
    Icon: PencilLine,
    chip: 'bg-purple text-paper',
    rule: 'bg-purple',
  },
  'change-of-mind': {
    label: 'Changed their mind',
    Icon: RefreshCw,
    chip: 'bg-lime text-ink',
    rule: 'bg-lime',
  },
}

interface MessageItemProps {
  message: Message
  /** Retry handler for a failed translation; absent when retry isn't offered. */
  onRetry?: () => void
  /** Text-to-speech controls; absent for non-speakable contexts (e.g. demo). */
  speech?: MessageSpeech
}

export function MessageItem({ message, onRetry, speech }: MessageItemProps) {
  const isYou = message.speaker === 'you'
  const speakerLabel = isYou ? 'You' : 'Them'
  const originalLang = getLanguage(message.originalLang)
  const translatedLang = getLanguage(message.translatedLang)
  const eventStyle = message.event ? EVENT_STYLES[message.event] : null
  // Static data (the demo preview) carries no status and is treated as done.
  const status = message.status ?? 'done'

  // Left rule carries the speaker colour; an event, when present, overrides it
  // so the treatment is unmistakable.
  const ruleClass = eventStyle ? eventStyle.rule : isYou ? 'bg-lime' : 'bg-purple'
  const speakerChip = isYou ? 'bg-lime text-ink' : 'bg-purple text-paper'

  return (
    <article
      className={`message-item ${isYou ? 'message-you' : 'message-them'}`}
      aria-label={`${speakerLabel}${eventStyle ? `, ${eventStyle.label}` : ''}`}
    >
      {/* Speaker / event colour rule. */}
      <span
        className={`absolute inset-y-1 left-0 w-1 ${ruleClass}`}
        aria-hidden
      />

      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={`label px-2 py-0.5 text-[10px] font-semibold ${speakerChip}`}
        >
          {speakerLabel}
        </span>

        {eventStyle && (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${eventStyle.chip}`}
          >
            <eventStyle.Icon className="size-3" aria-hidden />
            {eventStyle.label}
          </span>
        )}

        <time
          className="ml-auto font-mono text-[11px] tabular-nums text-ink/65"
          dateTime={message.timestamp}
        >
          {formatTime(message.timestamp)}
        </time>
      </header>

      {message.supersedes && (
        <p className="mb-1.5 font-sans text-base text-ink/65 line-through decoration-ink/40">
          {message.supersedes}
        </p>
      )}

      <p className="eyebrow mb-2">{originalLang.label} · Original</p>
      <p
        className="font-display text-xl font-semibold leading-snug text-ink sm:text-2xl"
        lang={originalLang.code}
        dir={originalLang.dir}
      >
        {message.originalText}
      </p>

      {/* Translation — clearly secondary, marked with the target language. */}
      <div className="message-translation">
        <p className="label mb-1 text-[9px] text-ink/65">
          {translatedLang.label} translation
        </p>

        {status === 'translating' && (
          <p className="flex items-center gap-2 font-mono text-xs text-ink/65">
            <Loader2 className="size-3.5 animate-spin text-purple" aria-hidden />
            Translating…
          </p>
        )}

        {status === 'error' && (
          <div>
            <p className="flex items-center gap-2 font-mono text-xs text-rust">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              {message.error ?? 'Translation failed.'}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 inline-flex items-center gap-1.5 border border-ink/25 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/70 transition-colors hover:border-ink hover:text-ink"
              >
                <RotateCw className="size-3" aria-hidden />
                Retry
              </button>
            )}
          </div>
        )}

        {status === 'done' && (
          <>
            <p
              className="font-sans text-xl font-medium leading-relaxed text-ink"
              lang={translatedLang.code}
              dir={translatedLang.dir}
            >
              {message.translatedText}
            </p>
            {speech?.supported && (
              <SpeakControl speech={speech} languageLabel={translatedLang.label} />
            )}
          </>
        )}
      </div>
    </article>
  )
}

interface SpeakControlProps {
  speech: MessageSpeech
  languageLabel: string
}

/** Speak / Stop control for a translated message, or an honest no-voice note. */
function SpeakControl({ speech, languageLabel }: SpeakControlProps) {
  if (!speech.hasVoice) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-ink/65">
        <VolumeX className="size-3 shrink-0" aria-hidden />
        No {languageLabel} voice on this device
      </p>
    )
  }

  if (speech.speaking) {
    return (
      <button
        type="button"
        onClick={speech.onStop}
        aria-label={`Stop speaking the ${languageLabel} translation`}
        className="mt-2 inline-flex items-center gap-1.5 border border-purple bg-purple px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-paper transition-colors hover:bg-ink hover:border-ink"
      >
        <Square className="size-3 animate-pulse" aria-hidden />
        Stop
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={speech.onSpeak}
      aria-label={`Speak the ${languageLabel} translation aloud`}
      className="mt-2 inline-flex items-center gap-1.5 border border-ink/25 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/70 transition-colors hover:border-ink hover:text-ink"
    >
      <Volume2 className="size-3" aria-hidden />
      Speak
    </button>
  )
}
