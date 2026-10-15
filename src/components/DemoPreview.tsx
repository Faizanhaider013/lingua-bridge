import { FlaskConical } from 'lucide-react'
import { DEMO_MESSAGES } from '../data/demoMessages'
import { Timeline } from './Timeline'

/**
 * The clearly-labeled demo preview, kept visually and structurally separate
 * from the real conversation. It renders fabricated sample messages and is
 * never presented as a live exchange.
 */
export function DemoPreview() {
  return (
    <div className="mt-12 border-t border-dashed border-ink/20 pt-8">
      <p className="mb-6 flex items-center gap-2.5 border border-ink/15 bg-paper-2 px-4 py-2.5 font-mono text-xs text-ink/70">
        <FlaskConical className="size-4 shrink-0 text-rust" aria-hidden />
        <span>
          <strong className="font-semibold uppercase tracking-[0.1em]">
            Demo preview
          </strong>{' '}
          — fabricated sample messages, shown for illustration only. This is not
          a live conversation and is separate from your messages above.
        </span>
      </p>
      <Timeline messages={DEMO_MESSAGES} />
    </div>
  )
}
