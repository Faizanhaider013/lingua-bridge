import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from './errors.ts'
import { parseTranslateRequest } from './validation.ts'

const MAX = 2000

function expectApiError(fn: () => unknown, code: string) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ApiError, 'expected an ApiError')
    assert.equal(err.code, code)
    assert.equal(err.status, 400)
    return true
  })
}

test('accepts a valid request and trims the text', () => {
  const result = parseTranslateRequest(
    { text: '  Hello  ', sourceLang: 'en', targetLang: 'es' },
    MAX,
  )
  assert.deepEqual(result, { text: 'Hello', sourceLang: 'en', targetLang: 'es' })
})

test('rejects a non-object body', () => {
  expectApiError(() => parseTranslateRequest('nope', MAX), 'invalid_request')
  expectApiError(() => parseTranslateRequest(null, MAX), 'invalid_request')
})

test('rejects missing or non-string text', () => {
  expectApiError(() => parseTranslateRequest({ sourceLang: 'en', targetLang: 'es' }, MAX), 'invalid_request')
  expectApiError(() => parseTranslateRequest({ text: 5, sourceLang: 'en', targetLang: 'es' }, MAX), 'invalid_request')
})

test('rejects empty / whitespace-only text', () => {
  expectApiError(() => parseTranslateRequest({ text: '   ', sourceLang: 'en', targetLang: 'es' }, MAX), 'empty_text')
})

test('rejects text longer than the limit', () => {
  const long = 'a'.repeat(MAX + 1)
  expectApiError(() => parseTranslateRequest({ text: long, sourceLang: 'en', targetLang: 'es' }, MAX), 'text_too_long')
})

test('accepts text exactly at the limit', () => {
  const atLimit = 'a'.repeat(MAX)
  const result = parseTranslateRequest({ text: atLimit, sourceLang: 'en', targetLang: 'es' }, MAX)
  assert.equal(result.text.length, MAX)
})

test('rejects unsupported source or target languages', () => {
  expectApiError(() => parseTranslateRequest({ text: 'hi', sourceLang: 'xx', targetLang: 'es' }, MAX), 'unsupported_language')
  expectApiError(() => parseTranslateRequest({ text: 'hi', sourceLang: 'en', targetLang: 'zz' }, MAX), 'unsupported_language')
})
