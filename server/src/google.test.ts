import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from './errors.ts'
import { translateWithGoogle } from './google.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('returns the provider-translated text on success', async () => {
  const fetchImpl = (async () =>
    jsonResponse(200, {
      data: { translations: [{ translatedText: 'Hola' }] },
    })) as unknown as typeof fetch

  const result = await translateWithGoogle(
    { text: 'Hello', source: 'en', target: 'es' },
    { apiKey: 'test-key', fetchImpl },
  )
  assert.equal(result, 'Hola')
})

test('sends the mapped Google code for Chinese and does not leak the key into errors', async () => {
  let capturedUrl = ''
  let capturedBody: Record<string, unknown> = {}
  const fetchImpl = (async (url: string, init: RequestInit) => {
    capturedUrl = url
    capturedBody = JSON.parse(String(init.body))
    return jsonResponse(200, { data: { translations: [{ translatedText: '你好' }] } })
  }) as unknown as typeof fetch

  const result = await translateWithGoogle(
    { text: 'Hello', source: 'en', target: 'zh' },
    { apiKey: 'secret-key', fetchImpl },
  )
  assert.equal(result, '你好')
  assert.equal(capturedBody.target, 'zh-CN')
  assert.ok(capturedUrl.includes('key='))
})

test('maps an upstream 400 to an invalid_language_pair ApiError (no secret leak)', async () => {
  const fetchImpl = (async () =>
    jsonResponse(400, { error: { message: 'Bad language pair' } })) as unknown as typeof fetch

  await assert.rejects(
    translateWithGoogle({ text: 'Hello', source: 'en', target: 'es' }, { apiKey: 'secret-key', fetchImpl }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.code, 'invalid_language_pair')
      assert.equal(err.status, 400)
      assert.ok(!err.message.includes('secret-key'))
      return true
    },
  )
})

test('maps a 403 to a provider_auth_error', async () => {
  const fetchImpl = (async () =>
    jsonResponse(403, { error: { message: 'API key invalid' } })) as unknown as typeof fetch

  await assert.rejects(
    translateWithGoogle({ text: 'Hello', source: 'en', target: 'es' }, { apiKey: 'k', fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'provider_auth_error',
  )
})

test('maps an aborted (timed-out) request to upstream_timeout', async () => {
  const fetchImpl = (async (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      // Never resolves on its own; reject when the abort signal fires.
      init.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    })) as unknown as typeof fetch

  await assert.rejects(
    translateWithGoogle({ text: 'Hello', source: 'en', target: 'es' }, { apiKey: 'k', fetchImpl, timeoutMs: 10 }),
    (err: unknown) => err instanceof ApiError && err.code === 'upstream_timeout' && err.status === 504,
  )
})

test('maps a malformed success payload to upstream_error', async () => {
  const fetchImpl = (async () => jsonResponse(200, { data: {} })) as unknown as typeof fetch

  await assert.rejects(
    translateWithGoogle({ text: 'Hello', source: 'en', target: 'es' }, { apiKey: 'k', fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'upstream_error',
  )
})
