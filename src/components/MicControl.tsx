import { Mic, MicOff } from 'lucide-react'

interface MicControlProps {
  /** Who this control belongs to, for the accessible label. */
  speakerLabel: string
  /** Whether voice input can be used (supported + secure context). */
  available: boolean
  /** Why voice input is unavailable, shown when `available` is false. */
  unavailableReason?: string
  /** True while THIS participant's mic is actively listening. */
  listening: boolean
  /** True when the OTHER participant is currently listening (one at a time). */
  busy: boolean
  onStart: () => void
  onStop: () => void
}

/**
 * Microphone control for a participant. When voice input is unavailable
 * (unsupported browser or insecure context) it says so honestly and never
 * captures audio; the typed composer remains the way to contribute.
 */
export function MicControl({
  speakerLabel,
  available,
  unavailableReason,
  listening,
  busy,
  onStart,
  onStop,
}: MicControlProps) {
  if (!available) {
    return (
      <div className="flex items-center gap-2.5 border border-ink/15 bg-paper-2 px-3 py-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center border border-ink/20 bg-paper text-ink/65"
          aria-hidden
        >
          <MicOff className="size-4" />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="label text-[10px] text-ink/65">Microphone</span>
          <span className="font-mono text-[11px] text-ink/65">
            {unavailableReason ?? 'Voice input unavailable — type instead'}
          </span>
        </span>
      </div>
    )
  }

  const statusLabel = listening ? 'Listening…' : 'Off'

  return (
    <button
      type="button"
      onClick={listening ? onStop : onStart}
      disabled={busy && !listening}
      aria-pressed={listening}
      aria-label={listening ? `Stop voice input for ${speakerLabel}` : `Start voice input for ${speakerLabel}`}
      className="flex w-full items-center justify-between gap-3 border border-ink/15 bg-paper-2 px-3 py-2.5 text-left transition-colors hover:border-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-center gap-2.5">
        <span
          className={`flex size-8 items-center justify-center border ${
            listening
              ? 'animate-pulse border-orange bg-orange text-paper'
              : 'border-ink/20 bg-paper text-ink/60'
          }`}
          aria-hidden
        >
          {listening ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="label text-[10px] text-ink/65">Microphone</span>
          <span className="font-mono text-xs font-semibold uppercase tracking-wide text-ink">
            {statusLabel}
          </span>
        </span>
      </span>
      <span
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65 underline decoration-ink/25 underline-offset-4"
      >
        {listening ? 'Stop' : 'Speak'}
      </span>
    </button>
  )
}
