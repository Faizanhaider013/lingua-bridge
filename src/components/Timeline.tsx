import type { LanguageCode, Message } from '../types'
import { MessageItem, type MessageSpeech } from './MessageItem'

/** Shared text-to-speech wiring for the real conversation timeline. */
export interface TimelineSpeech {
  supported: boolean
  /** Id of the message currently being spoken, or null. */
  speakingId: string | null
  hasVoiceFor: (langCode: LanguageCode) => boolean
  onSpeak: (message: Message) => void
  onStop: () => void
}

interface TimelineProps {
  messages: readonly Message[]
  /** Starts the argument (focuses the composer) from the empty state. */
  onStart?: () => void
  /** Retry a failed message's translation, by message id. */
  onRetry?: (id: string) => void
  /** Text-to-speech controls; omitted for the demo preview (not speakable). */
  speech?: TimelineSpeech
}

export function Timeline({ messages, onStart, onRetry, speech }: TimelineProps) {
  if (messages.length === 0) {
    return onStart ? <EmptyState onStart={onStart} /> : null
  }

  return (
    <ol className="flex flex-col gap-8" aria-label="Conversation transcript">
      {messages.map((message) => {
        const messageSpeech: MessageSpeech | undefined = speech
          ? {
              supported: speech.supported,
              hasVoice: speech.hasVoiceFor(message.translatedLang),
              speaking: speech.speakingId === message.id,
              onSpeak: () => speech.onSpeak(message),
              onStop: speech.onStop,
            }
          : undefined
        return (
          <li key={message.id}>
            <MessageItem
              message={message}
              onRetry={onRetry ? () => onRetry(message.id) : undefined}
              speech={messageSpeech}
            />
          </li>
        )
      })}
    </ol>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="empty-conversation">
      <p className="label text-[11px] text-ink/65">Nothing said yet</p>
      <p className="display mx-auto mt-4 max-w-[14ch] text-4xl text-ink sm:text-5xl">
        Someone has to go first.
      </p>
      <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ink/60">
        Your words and their translation will appear here.
        Choose who’s speaking and send your first thought.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-7 inline-flex items-center gap-2 bg-ink px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-paper transition-colors hover:bg-purple"
      >
        Write the first message
      </button>
    </div>
  )
}
