import { Loader2, Volume2, VolumeX } from 'lucide-react'
import { getLanguage } from '../data/languages'
import type { LanguageCode, Speaker } from '../types'
import { LanguageSelector } from './LanguageSelector'
import { MicControl } from './MicControl'

/** Honest spoken-output capability for this participant's language. */
export interface VoiceOutput {
  /** Whether the browser supports speech synthesis at all. */
  supported: boolean
  /** Whether the installed-voice list has loaded yet (avoids a false "missing"). */
  ready: boolean
  /** Whether an installed voice can actually speak this language. */
  hasVoice: boolean
}

interface ParticipantPanelProps {
  speaker: Speaker
  language: LanguageCode
  onLanguageChange: (code: LanguageCode) => void
  /** Voice-input wiring for this participant's microphone. */
  mic: {
    available: boolean
    unavailableReason?: string
    listening: boolean
    busy: boolean
    onStart: () => void
    onStop: () => void
  }
  /** Spoken-output capability for this language, detected at runtime. */
  voiceOutput?: VoiceOutput
}

const PANEL_COPY: Record<
  Speaker,
  { tag: string; participant: string; selectorLabel: string }
> = {
  you: { tag: 'You', participant: 'Participant A', selectorLabel: 'Your language' },
  other: {
    tag: 'Them',
    participant: 'Participant B',
    selectorLabel: 'Their language',
  },
}

/** One participant's controls: identity, language choice, and mic status. */
export function ParticipantPanel({
  speaker,
  language,
  onLanguageChange,
  mic,
  voiceOutput,
}: ParticipantPanelProps) {
  const copy = PANEL_COPY[speaker]
  const isYou = speaker === 'you'
  const lang = getLanguage(language)

  // Each participant gets a distinct accent: lime for You, purple for Them.
  const tagClass = isYou
    ? 'bg-lime text-ink'
    : 'bg-purple text-paper'

  return (
    <section
      aria-label={`${copy.tag} panel`}
      className={`participant-panel ${isYou ? 'participant-you' : 'participant-them'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`label px-2.5 py-1 text-xs font-semibold ${tagClass}`}
        >
          {copy.tag}
        </span>
        <span className="label text-[10px] text-ink/65">
          {copy.participant}
        </span>
      </div>

      <div
        className="font-display text-4xl font-bold leading-none tracking-tight text-ink"
        lang={lang.code}
        dir={lang.dir}
      >
        {lang.endonym}
      </div>

      <LanguageSelector
        label={copy.selectorLabel}
        value={language}
        onChange={onLanguageChange}
      />

      <MicControl
        speakerLabel={copy.tag}
        available={mic.available}
        unavailableReason={mic.unavailableReason}
        listening={mic.listening}
        busy={mic.busy}
        onStart={mic.onStart}
        onStop={mic.onStop}
      />

      {voiceOutput && (
        <VoiceAvailabilityNote voiceOutput={voiceOutput} languageLabel={lang.label} />
      )}
    </section>
  )
}

/**
 * States spoken-output capability for this language honestly, detected from the
 * actual browser voice list — not inferred from the language selector. This is
 * distinct from microphone (recognition) support shown above: a device can
 * recognise a language it cannot speak, and vice versa. Common for Urdu, and
 * variable for Hindi and Arabic, on desktop.
 */
function VoiceAvailabilityNote({
  voiceOutput,
  languageLabel,
}: {
  voiceOutput: VoiceOutput
  languageLabel: string
}) {
  const base = 'flex items-start gap-1.5 font-mono text-[11px] leading-snug'

  if (!voiceOutput.supported) {
    return (
      <p className={`${base} text-ink/65`}>
        <VolumeX className="mt-0.5 size-3 shrink-0" aria-hidden />
        Spoken output isn’t supported in this browser — translations show as text.
      </p>
    )
  }

  if (!voiceOutput.ready) {
    return (
      <p className={`${base} text-ink/65`}>
        <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" aria-hidden />
        Checking installed {languageLabel} voices…
      </p>
    )
  }

  if (!voiceOutput.hasVoice) {
    return (
      <p className={`${base} text-ink/60`}>
        <VolumeX className="mt-0.5 size-3 shrink-0 text-rust" aria-hidden />
        No installed {languageLabel} voice — translations into {languageLabel} appear as
        text, not spoken.
      </p>
    )
  }

  return (
    <p className={`${base} text-ink/65`}>
      <Volume2 className="mt-0.5 size-3 shrink-0" aria-hidden />
      {languageLabel} can be spoken aloud on this device.
    </p>
  )
}
