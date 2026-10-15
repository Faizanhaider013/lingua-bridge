import { AlertTriangle } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A small, accessible confirmation dialog.
 *
 * Handles Escape to cancel, moves focus to the confirm button on open,
 * restores focus to the previously focused element on close, and keeps focus
 * from leaving the dialog while it is open.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    confirmRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key === 'Tab') {
        // Minimal focus trap across the dialog's focusable elements.
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (!focusable || focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-md border border-ink bg-paper p-6 shadow-[8px_8px_0_0] shadow-ink"
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center bg-rust text-paper"
            aria-hidden
          >
            <AlertTriangle className="size-5" />
          </span>
          <div>
            <h2
              id={titleId}
              className="font-display text-2xl font-bold tracking-tight text-ink"
            >
              {title}
            </h2>
            <p
              id={descId}
              className="mt-2 text-sm leading-relaxed text-ink/65"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="border border-ink/30 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-ink/70 transition-colors hover:border-ink hover:text-ink"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="bg-rust px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-paper transition-colors hover:bg-ink"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
