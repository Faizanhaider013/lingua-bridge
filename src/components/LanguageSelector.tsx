import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import { LANGUAGES } from '../data/languages'
import type { LanguageCode } from '../types'

interface LanguageSelectorProps {
  /** Visible label, e.g. "Your language". */
  label: string
  value: LanguageCode
  onChange: (code: LanguageCode) => void
}

/**
 * A single participant's language picker. Each instance owns no state; the two
 * panels drive independent values from the parent, so changing one never
 * affects the other.
 */
export function LanguageSelector({
  label,
  value,
  onChange,
}: LanguageSelectorProps) {
  const id = useId()

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="label text-[10px] text-ink/65"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as LanguageCode)}
          className="w-full cursor-pointer appearance-none border-b-2 border-ink/20 bg-transparent py-2 pr-8 font-sans text-xl font-semibold text-ink transition-colors hover:border-ink/50 focus-visible:border-ink"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label} — {lang.endonym}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 text-ink/65"
          aria-hidden
        />
      </div>
    </div>
  )
}
