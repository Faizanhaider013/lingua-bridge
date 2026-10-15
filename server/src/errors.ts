/**
 * Structured API error.
 *
 * Every failure surfaced to a client is one of these: a machine-readable
 * `code`, an HTTP `status`, and a human-readable `message` that is safe to
 * show. Secrets (the API key, raw upstream payloads) are NEVER put in
 * `message` or server logs.
 */
export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** The JSON body shape returned to clients. */
  toBody(): { error: { code: string; message: string } } {
    return { error: { code: this.code, message: this.message } }
  }
}
