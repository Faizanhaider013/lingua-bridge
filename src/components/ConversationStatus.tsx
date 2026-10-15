import type { ConversationPhase } from '../lib/conversation'

interface PhaseStyle {
  label: string
  hint: string
  /** Tailwind classes for the status dot. */
  dot: string
  /** Whether the dot should pulse (active, ongoing phases). */
  pulse: boolean
}

const PHASE_STYLES: Record<ConversationPhase, PhaseStyle> = {
  idle: { label: 'Ready', hint: 'Dictate or type, then send.', dot: 'bg-ink/30', pulse: false },
  listening: {
    label: 'Listening',
    hint: 'Speak now — the transcript fills the composer to review before sending.',
    dot: 'bg-orange',
    pulse: true,
  },
  translating: {
    label: 'Translating',
    hint: 'Translating the message…',
    dot: 'bg-purple',
    pulse: true,
  },
  speaking: {
    label: 'Speaking',
    hint: 'Playing the translation aloud for the other side.',
    dot: 'bg-lime',
    pulse: true,
  },
  interrupted: {
    label: 'Interrupted',
    hint: 'Speech was cut off. Your turn.',
    dot: 'bg-orange',
    pulse: false,
  },
  error: {
    label: 'Translation failed',
    hint: 'Retry from the message, or type again.',
    dot: 'bg-orange',
    pulse: false,
  },
}

interface ConversationStatusProps {
  phase: ConversationPhase
  /**
   * Short contextual clause for the current phase — e.g. who is speaking and in
   * which language, the translation direction, or the language being spoken.
   * Kept concise and changing only on discrete transitions so the polite live
   * region announces state changes, not a stream of partial transcripts.
   */
  detail?: string
}

/**
 * A compact, honest readout of the voice loop's current phase. It mirrors real
 * recognition/translation/synthesis state (see {@link ConversationPhase}) rather
 * than guessing. The phase and its contextual detail are announced politely;
 * the longer hint is visual-only to avoid repeating guidance to screen readers.
 */
export function ConversationStatus({ phase, detail }: ConversationStatusProps) {
  const style = PHASE_STYLES[phase]
  return (
    <div
      role="status"
      aria-live="polite"
      data-phase={phase}
      className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 border border-ink/15 bg-paper-2 px-3 py-2"
    >
      <span
        className={`size-2 shrink-0 rounded-full ${style.dot} ${style.pulse ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      <span className="label text-[10px] text-ink/70">{style.label}</span>
      {detail && (
        <span className="font-mono text-[11px] font-semibold text-ink/60">{detail}</span>
      )}
      <span className="w-full font-mono text-[11px] text-ink/65 sm:w-auto" aria-hidden>
        {style.hint}
      </span>
    </div>
  )
}
