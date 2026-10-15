import { ApiError } from './errors.ts'
import { isSupportedLanguage, type SupportedLanguage } from './languages.ts'

export interface TranslateRequest {
  text: string
  sourceLang: SupportedLanguage
  targetLang: SupportedLanguage
}

/**
 * Validates and normalises an incoming translate request body.
 *
 * Throws an {@link ApiError} (status 400) describing the first problem found.
 * On success returns the cleaned request with `text` trimmed.
 */
export function parseTranslateRequest(
  body: unknown,
  maxTextLength: number,
): TranslateRequest {
  if (typeof body !== 'object' || body === null) {
    throw new ApiError(400, 'invalid_request', 'Request body must be a JSON object.')
  }

  const { text, sourceLang, targetLang } = body as Record<string, unknown>

  if (typeof text !== 'string') {
    throw new ApiError(400, 'invalid_request', 'Field "text" is required and must be a string.')
  }

  const trimmed = text.trim()
  if (trimmed.length === 0) {
    throw new ApiError(400, 'empty_text', 'Message text must not be empty.')
  }
  if (trimmed.length > maxTextLength) {
    throw new ApiError(
      400,
      'text_too_long',
      `Message text must be ${maxTextLength} characters or fewer.`,
    )
  }

  if (!isSupportedLanguage(sourceLang)) {
    throw new ApiError(400, 'unsupported_language', 'Field "sourceLang" is not a supported language code.')
  }
  if (!isSupportedLanguage(targetLang)) {
    throw new ApiError(400, 'unsupported_language', 'Field "targetLang" is not a supported language code.')
  }

  return { text: trimmed, sourceLang, targetLang }
}
