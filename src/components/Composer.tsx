import { Hand, Loader2, Mic, SendHorizontal } from 'lucide-react'
import { useId, type KeyboardEvent, type RefObject } from 'react'
import { getLanguage } from '../data/languages'
import type { LanguageCode, Speaker } from '../types'

interface ComposerProps {
  /** Current draft text (owned by the parent so voice input can fill it too). */
  draft: string
  onDraftChange: (draft: string) => void
  /** Sends the draft as a normal message. */
  onSend: (draft: string) => void
  /** Sends the draft flagged as an interruption. */
  onInterrupt: (draft: string) => void
  /** Who the draft will be attributed to. */
  sendAs: Speaker
  onSendAsChange: (speaker: Speaker) => void
  /** Language each side is writing in, used for the direction hint. */
  youLang: LanguageCode
  themLang: LanguageCode
  /** True while a translation is in flight — blocks duplicate submissions. */
  pending: boolean
  /** Max message length the active backend accepts (provider-dependent). */
  maxLength: number
  /** True while voice input is dictating into the draft. */
  listening?: boolean
  /** Live (not-yet-committed) speech transcript, shown while listening. */
  interim?: string
  /** Lets the Start action move focus here. */
  inputRef?: RefObject<HTMLTextAreaElement | null>
}

/**
 * Message composer. The sender toggle lets a single device drive both sides of
 * the conversation; Send and Interrupt both post a real message (Interrupt
 * flags it as an interruption event) and trigger a live translation.
 *
 * The draft is owned by the parent so speech-to-text (Phase 3.2) can dictate
 * into it; the user can still freely edit before sending. Typing always works,
 * independent of voice input.
 */
export function Composer({
  draft,
  onDraftChange,
  onSend,
  onInterrupt,
  sendAs,
  onSendAsChange,
  youLang,
  themLang,
  pending,
  maxLength,
  listening = false,
  interim = '',
  inputRef,
}: ComposerProps) {
  const id = useId()

  const trimmed = draft.trim()
  const tooLong = draft.length > maxLength
  const canSend = trimmed.length > 0 && !tooLong && !pending

  const sourceLang = sendAs === 'you' ? youLang : themLang
  const targetLang = sendAs === 'you' ? themLang : youLang
  const source = getLanguage(sourceLang)
  const target = getLanguage(targetLang)

  function submit(kind: 'send' | 'interrupt') {
    if (!canSend) return
    if (kind === 'send') onSend(trimmed)
    else onInterrupt(trimmed)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit('send')
    }
  }

  return (
    <div className="composer">
      {/* Who is speaking — lets one device test both directions. */}
      <div className="mb-3 flex flex-col gap-2">
        <span className="label text-[10px] text-ink/65">Sending as</span>
        <div className="flex gap-2" role="group" aria-label="Choose who is sending">
          {(['you', 'other'] as const).map((speaker) => {
            const active = sendAs === speaker
            const isYou = speaker === 'you'
            const activeClass = isYou ? 'bg-lime text-ink' : 'bg-purple text-paper'
            return (
              <button
                key={speaker}
                type="button"
                onClick={() => onSendAsChange(speaker)}
                aria-pressed={active}
                className={`flex-1 border px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? `${activeClass} border-transparent`
                    : 'border-ink/20 text-ink/65 hover:border-ink hover:text-ink'
                }`}
              >
                {isYou ? 'You' : 'Them'}
              </button>
            )
          })}
        </div>
        <p className="translation-direction" aria-label={`Translation direction: ${source.label} to ${target.label}`}>
          {source.label}
          <span className="mx-1.5 text-ink/30" aria-hidden>
            →
          </span>
          {target.label}
        </p>
      </div>


      <div className="mt-3 border border-ink/20 bg-paper">
        <label htmlFor={id} className="sr-only">
          Type a message
        </label>
        <textarea
          id={id}
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          dir={source.dir}
          lang={source.code}
          aria-invalid={tooLong || undefined}
          aria-describedby={`${id}-hint`}
          placeholder="Say your piece…"
          className="w-full resize-none bg-transparent px-4 py-3.5 font-sans text-lg text-ink placeholder:text-ink/65 focus-visible:outline-2 focus-visible:outline-purple focus-visible:-outline-offset-2"
        />

        {/* Live speech transcript — shown while dictating, before it commits.
            Not an ARIA live region: the partial transcript changes on every
            recognized word, so announcing it would flood screen readers. The
            status readout above already announces that recognition is active;
            the committed text lands in the textarea, which is accessible. */}
        {listening && (
          <div
            className="flex items-start gap-2 border-t border-ink/15 bg-paper-2 px-4 py-2"
            aria-hidden
          >
            <Mic className="mt-0.5 size-3.5 shrink-0 animate-pulse text-rust" aria-hidden />
            <span className="font-mono text-[11px] text-ink/65">
              {interim ? (
                <span className="text-ink/70" dir={source.dir}>
                  {interim}
                </span>
              ) : (
                'Listening… speak now, then review before sending.'
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-ink/15 px-4 py-2.5">
          <span
            id={`${id}-hint`}
            className={`font-mono text-[11px] ${tooLong ? 'text-rust' : 'text-ink/65'}`}

          >
            {tooLong
              ? `Too long by ${draft.length - maxLength} — max ${maxLength}`
              : draft.length > maxLength * 0.75
                ? `${draft.length} / ${maxLength}`
                : `Enter to send · Shift+Enter for a new line`}
          </span>
          <button
            type="button"
            onClick={() => submit('send')}
            disabled={!canSend}
            className="inline-flex items-center gap-2 bg-ink px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-paper transition-colors hover:bg-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Translating
              </>
            ) : (
              <>
                <SendHorizontal className="size-4" aria-hidden />
                Send
              </>
            )}
          </button>
        </div>
      </div>
      {/* Interrupt — the loud, unmistakable control. */}
      <button
        type="button"
        onClick={() => submit('interrupt')}
        disabled={!canSend}
        className="interrupt-action"
      >
        <span className="flex items-center gap-3">
          <Hand className="size-5" aria-hidden />
          <span className="label text-sm font-semibold">Interrupt</span>
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink/65">
          Send as a cut-in
        </span>
      </button>

      <p className="composer-note">Interrupt sends your draft and stops current speech. Voice messages play automatically when a matching voice is available.</p>
    </div>
  )
}
