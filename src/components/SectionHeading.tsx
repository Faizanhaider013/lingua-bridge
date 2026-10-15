import type { ReactNode } from 'react'

interface SectionHeadingProps {
  /** Two-digit section index, e.g. "01". */
  number: string
  title: string
  /** Optional controls rendered on the right (e.g. a toggle). */
  aside?: ReactNode
}

/**
 * A numbered section header with a thin rule beneath it — the editorial
 * device that gives the page its indexed, ZERO-like rhythm.
 */
export function SectionHeading({ number, title, aside }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/15 pb-3">
      <h2 className="flex items-baseline gap-3">
        <span className="label text-xs text-ink/65">{number}</span>
        <span className="font-mono text-sm font-semibold uppercase tracking-[0.1em] text-ink">
          {title}
        </span>
      </h2>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  )
}
