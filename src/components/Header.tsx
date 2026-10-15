import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { copyToClipboard } from '../lib/clipboard'

interface HeaderProps {
  sessionId: string
  onEndSession: () => void
}

type CopyState = 'idle' | 'copied' | 'error'

/**
 * Minimal top bar: the wordmark on the left, and the session status / ID /
 * end-session controls kept deliberately small and secondary on the right.
 */
export function Header({ sessionId, onEndSession }: HeaderProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [copyState])

  async function handleCopy() {
    const ok = await copyToClipboard(sessionId)
    setCopyState(ok ? 'copied' : 'error')
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-ink/15 py-4">
      <div className="brand-lockup">
        <span className="brand-reference" aria-label="ZERO build challenge">ZERO<span>BUILD CHALLENGE</span></span>
        <span className="product-wordmark">Say It Anyway<span>A little understanding goes a long way.</span></span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-ink/65">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-1.5 rounded-full bg-lime ring-2 ring-lime/30"
            aria-hidden
          />
          <span className="uppercase tracking-[0.14em]">Session in this tab</span>
        </span>

        <span className="inline-flex items-center gap-2">
          <span className="sr-only">Session ID</span>
          <span className="tracking-wide text-ink/75">{sessionId}</span>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy session ID"
            className="inline-flex items-center gap-1 uppercase tracking-[0.1em] text-ink/65 transition-colors hover:text-ink"
          >
            {copyState === 'copied' ? (
              <>
                <Check className="size-3" aria-hidden /> Copied
              </>
            ) : copyState === 'error' ? (
              <span className="text-rust">Copy failed</span>
            ) : (
              <>
                <Copy className="size-3" aria-hidden /> Copy
              </>
            )}
          </button>
        </span>

        <button
          type="button"
          onClick={onEndSession}
          className="uppercase tracking-[0.12em] text-ink/65 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-rust hover:decoration-orange"
        >
          End session
        </button>
      </div>
    </header>
  )
}
