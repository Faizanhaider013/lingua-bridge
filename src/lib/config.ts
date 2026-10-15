/**
 * Frontend runtime configuration.
 *
 * `VITE_API_BASE_URL` points the app at its translation backend. It is NOT a
 * secret — it is only a URL — so exposing it via a VITE_* variable is fine.
 * The translation API key lives solely on the server and is never referenced
 * here.
 *
 * - In local dev, leave it unset: the default `/api` is proxied to the backend
 *   by Vite (see `vite.config.ts`).
 * - In production, set it to the deployed backend origin, e.g.
 *   `https://api.say-it-anyway.example.com/api`.
 */
import { resolveApiBase } from './apiBase'

/** API base URL with any trailing slash removed. */
export const API_BASE_URL = resolveApiBase(import.meta.env.VITE_API_BASE_URL, import.meta.env.PROD)

/**
 * Fallback maximum message length used before the server's real limit has been
 * fetched (see `fetchTranslationInfo`). Defaults to the server's 2000-char limit —
 * the active provider's true limit replaces it at runtime.
 */
export const MAX_MESSAGE_LENGTH = 2000
