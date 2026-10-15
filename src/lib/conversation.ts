/**
 * Conversation-loop phase model for the voice conversation (Phase 3.3).
 *
 * The voice loop is turn-based: one participant dictates (or types), the message
 * is translated, and the translation is spoken to the recipient. At any instant
 * the loop is in exactly one observable phase. `derivePhase` computes that phase
 * from the independent signals the app already tracks (recognition, translation,
 * synthesis) plus two explicit flags, so the status shown to the user can never
 * drift out of sync with what is actually happening.
 *
 * It is a pure function with no React or browser dependency, which keeps the
 * state model unit-testable in isolation.
 */
export type ConversationPhase =
  | 'idle'
  | 'listening'
  | 'translating'
  | 'speaking'
  | 'interrupted'
  | 'error'

export interface PhaseInputs {
  /** Speech recognition is actively capturing (a mic is on). */
  listening: boolean
  /** A translation request is in flight. */
  translating: boolean
  /** Text-to-speech is currently playing a translation. */
  speaking: boolean
  /** The most recent turn failed to translate and is awaiting retry. */
  error: boolean
  /** A recipient just cut in with Interrupt, cancelling active speech. */
  interrupted: boolean
}

/**
 * Collapses the loop's signals into a single phase.
 *
 * Priority (highest first) reflects what is most immediate and actionable:
 *   listening  — the mic is live right now;
 *   translating — a request is in flight;
 *   speaking   — audio is playing;
 *   error      — the last turn failed and needs a retry;
 *   interrupted — speech was just cut off (a brief, trailing state);
 *   idle       — nothing is happening.
 *
 * Because the first four are mutually sequential in a normal turn
 * (listen → translate → speak), the ordering is unambiguous in practice; the
 * priorities only decide the rare overlaps (e.g. an error flag lingering while a
 * new turn begins — the new activity wins).
 */
export function derivePhase({
  listening,
  translating,
  speaking,
  error,
  interrupted,
}: PhaseInputs): ConversationPhase {
  if (listening) return 'listening'
  if (translating) return 'translating'
  if (speaking) return 'speaking'
  if (error) return 'error'
  if (interrupted) return 'interrupted'
  return 'idle'
}
