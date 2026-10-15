import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchProviderJson } from './upstream.ts'
import { translateWithMyMemory } from './mymemory.ts'

test('provider timeout includes a stalled response body', async () => {
  const fetchImpl = (async (_url, init) => ({
    json: () => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }),
  })) as typeof fetch
  await assert.rejects(fetchProviderJson('https://provider.example', {}, fetchImpl, 20), { code: 'upstream_timeout' })
})

test('pre-aborted work never reaches the provider', async () => {
  let called = false
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(fetchProviderJson('https://provider.example', {}, (async () => {
    called = true
    return new Response('{}')
  }) as typeof fetch, 20, controller.signal), { code: 'upstream_timeout' })
  assert.equal(called, false)
})

test('a whitespace-only chunk fails the complete translation', async () => {
  await assert.rejects(translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, {
    fetchImpl: async () => new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: '   ' } })),
  }), { code: 'upstream_error' })
})
