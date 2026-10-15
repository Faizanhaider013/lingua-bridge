/**
 * Shared domain types for Say It Anyway.
 *
 * Phase 1 is a UI-only prototype: there is no real translation, speech
 * recognition, backend, or transport. These types describe the shape the
 * interface renders, and are written to accommodate the live data that later
 * phases will produce.
 */

/**
 * ISO 639-1 language codes the interface offers in Phase 1.
 *
 * These are UI configuration only — see `data/languages.ts`. The union is kept
 * in sync with that config so a code can never be used without an entry.
 */
export type LanguageCode =
  | 'en'
  | 'es'
  | 'fr'
  | 'hi'
  | 'ar'
  | 'de'
  | 'pt'
  | 'zh'
  | 'ja'
  | 'ur'
  | 'it'
  | 'bn'
  | 'ko'
  | 'tr'
  | 'ru'

export interface Language {
  code: LanguageCode
  /** English name of the language, e.g. "English". */
  label: string
  /** The language's own name, e.g. "اردو". */
  endonym: string
  /** Text direction for rendering content in this language. */
  dir: 'ltr' | 'rtl'
}

/** Which participant produced a message. */
export type Speaker = 'you' | 'other'

/**
 * How a message's text was entered. Drives the voice loop: a `voice` turn has
 * its translation spoken aloud automatically once it succeeds, while a `typed`
 * turn is only spoken on demand via the message's Speak control. Omitted on
 * static data (e.g. the demo preview).
 */
export type MessageOrigin = 'voice' | 'typed'

/**
 * Lifecycle of a real (translated) message.
 *
 * - `translating` — the translation request is in flight.
 * - `done` — the translation arrived (or none was needed).
 * - `error` — the request failed; the original text is retained for retry.
 *
 * Demo-preview messages carry no status and are treated as `done`.
 */
export type MessageStatus = 'translating' | 'done' | 'error'

/**
 * Conversational events that receive a distinct visual treatment in the
 * timeline.
 */
export type ConversationEvent = 'interruption' | 'correction' | 'change-of-mind'

export interface Message {
  id: string
  speaker: Speaker
  /** What the speaker actually said, in their own language. */
  originalText: string
  originalLang: LanguageCode
  /** The rendering of that utterance in the listener's language. */
  translatedText: string
  translatedLang: LanguageCode
  /** ISO 8601 timestamp of when the utterance occurred. */
  timestamp: string
  /** Optional event classification driving the message's visual treatment. */
  event?: ConversationEvent
  /**
   * For `correction` / `change-of-mind` events, the earlier phrasing this
   * message revises. Shown struck-through above the new text.
   */
  supersedes?: string
  /**
   * Translation lifecycle state for real messages. Omitted on static data
   * (e.g. the demo preview), which the UI treats as already `done`.
   */
  status?: MessageStatus
  /** Human-readable error shown when `status` is `error`. */
  error?: string
  /**
   * How the message was entered (`voice` vs `typed`). Determines whether its
   * translation auto-speaks when it completes. Omitted on static data.
   */
  origin?: MessageOrigin
}
