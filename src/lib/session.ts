/**
 * Generates a human-friendly, shareable session identifier.
 *
 * Phase 1 sessions are local-only; the ID is a label for the UI, not a key to
 * any backend. Format: `SIA-XXXX-XXXX` using an unambiguous character set.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0/I/1

export function createSessionId(): string {
  const randomChar = () =>
    ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  const block = () => Array.from({ length: 4 }, randomChar).join('')
  return `SIA-${block()}-${block()}`
}
