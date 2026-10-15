import { Info, X } from 'lucide-react'

interface ToastProps {
  message: string | null
  onDismiss: () => void
}

/**
 * A single transient notice, used throughout Phase 1 to be honest about what
 * is and isn't wired up yet. Announced politely to assistive technology.
 */
export function Toast({ message, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
    >
      {message && (
        <div className="pointer-events-auto flex max-w-md items-start gap-3 border border-ink bg-ink px-4 py-3 text-paper shadow-[4px_4px_0_0] shadow-lime">
          <Info className="mt-0.5 size-4 shrink-0 text-lime" aria-hidden />
          <p className="font-mono text-xs leading-snug text-paper/90">
            {message}
          </p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notice"
            className="-mr-1 ml-1 shrink-0 p-0.5 text-paper/60 transition-colors hover:text-paper"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
