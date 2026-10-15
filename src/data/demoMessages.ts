import type { Message } from '../types'

/**
 * Sample argument used only by the DEMO PREVIEW toggle.
 *
 * This data is fabricated for illustration. It is never presented as a live
 * conversation — the UI labels it explicitly whenever it is shown. It exists
 * so reviewers can see how speakers, translations, timestamps, and the three
 * event treatments (interruption, correction, change-of-mind) render.
 *
 * The exchange runs English (You) ↔ Spanish (Them) to match the default
 * language pairing.
 */
export const DEMO_MESSAGES: readonly Message[] = [
  {
    id: 'demo-1',
    speaker: 'you',
    originalText: "We agreed the deposit was split down the middle. Half each.",
    originalLang: 'en',
    translatedText: 'Acordamos que el depósito se dividía por la mitad. Mitad cada uno.',
    translatedLang: 'es',
    timestamp: '2026-10-14T18:02:04',
  },
  {
    id: 'demo-2',
    speaker: 'other',
    originalText: 'No, dijimos que yo pagaba el depósito y tú el primer mes.',
    originalLang: 'es',
    translatedText: 'No, we said I paid the deposit and you paid the first month.',
    translatedLang: 'en',
    timestamp: '2026-10-14T18:02:29',
  },
  {
    id: 'demo-3',
    speaker: 'you',
    originalText: "That's not what — hold on, let me finish, because the message said—",
    originalLang: 'en',
    translatedText: 'Eso no es lo que — espera, déjame terminar, porque el mensaje decía—',
    translatedLang: 'es',
    timestamp: '2026-10-14T18:02:41',
    event: 'interruption',
  },
  {
    id: 'demo-4',
    speaker: 'other',
    originalText: '¡Déjame hablar a mí también! Tú siempre hablas por encima.',
    originalLang: 'es',
    translatedText: 'Let me talk too! You always talk over me.',
    translatedLang: 'en',
    timestamp: '2026-10-14T18:02:44',
    event: 'interruption',
  },
  {
    id: 'demo-5',
    speaker: 'you',
    originalText: 'Fine. The message said the deposit was shared.',
    originalLang: 'en',
    translatedText: 'Bien. El mensaje decía que el depósito era compartido.',
    translatedLang: 'es',
    timestamp: '2026-10-14T18:03:15',
    event: 'correction',
    supersedes: 'The message clearly said you were paying the whole deposit.',
  },
  {
    id: 'demo-6',
    speaker: 'other',
    originalText: 'Vale… mirándolo otra vez, tienes razón. Lo dividimos.',
    originalLang: 'es',
    translatedText: "Okay… looking at it again, you're right. We split it.",
    translatedLang: 'en',
    timestamp: '2026-10-14T18:03:58',
    event: 'change-of-mind',
    supersedes: 'I am completely sure you agreed to pay all of it.',
  },
]
