import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { ApiError } from './errors.ts'
import type { TranslateParams } from './translate.ts'

async function withApp(env: NodeJS.ProcessEnv, translate: (p: TranslateParams) => Promise<string>, run: (base: string) => Promise<void>) {
  const server = createApp(loadConfig(env), { translate }).listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`) } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
async function errorCode(response: Response): Promise<string> {
  const payload = await response.json() as { error: { code: string } }
  return payload.error.code
}
const body = JSON.stringify({ text: 'Hello', sourceLang: 'en', targetLang: 'es' })
const post = (base: string, origin?: string) => fetch(`${base}/api/translate`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body,
})

test('CORS allowlist, preflight and headers prevent unintended browser origins', async () => {
  let calls = 0
  await withApp({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example' }, async () => { calls++; return 'Hola' }, async (base) => {
    const allowed = await post(base, 'https://app.example')
    assert.equal(allowed.status, 200)
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example')
    assert.equal(allowed.headers.get('cache-control'), 'no-store')
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(allowed.headers.get('x-powered-by'), null)
    const rejected = await post(base, 'https://attacker.example')
    assert.equal(rejected.status, 403)
    assert.equal(calls, 1)
    const preflight = await fetch(`${base}/api/translate`, { method: 'OPTIONS', headers: { Origin: 'https://app.example', 'Access-Control-Request-Method': 'POST' } })
    assert.equal(preflight.status, 204)
  })
})

test('a CORS_ORIGIN with a trailing slash still admits the deployed origin (production 403 regression)', async () => {
  let reached = 0
  // Reproduces the reported production misconfiguration: the env var carried a
  // trailing slash. The server must normalise it, admit the exact browser
  // origin, reach the provider, and still reject other origins.
  await withApp(
    { NODE_ENV: 'production', CORS_ORIGIN: 'https://lingua-bridge-q59l.onrender.com/' },
    async () => { reached++; return 'Hola' },
    async (base) => {
      const origin = 'https://lingua-bridge-q59l.onrender.com'
      const ok = await post(base, origin)
      assert.equal(ok.status, 200)
      assert.equal(ok.headers.get('access-control-allow-origin'), origin)
      assert.equal(((await ok.json()) as { translatedText: string }).translatedText, 'Hola')
      assert.equal(reached, 1, 'the request must reach the translation provider')

      const denied = await post(base, 'https://attacker.example')
      assert.equal(denied.status, 403)
      assert.equal(await errorCode(denied), 'origin_denied')
    },
  )
})

test('body limit and global rate limit fail with structured errors', async () => {
  await withApp({ REQUESTS_PER_MINUTE: '2' }, async () => 'Hola', async (base) => {
    const large = await fetch(`${base}/api/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'a'.repeat(20_000) }) })
    assert.equal(large.status, 413)
    assert.equal(await errorCode(large), 'body_too_large')
    assert.equal((await post(base)).status, 200)
    const limited = await post(base)
    assert.equal(limited.status, 429)
    assert.ok(limited.headers.get('retry-after'))
    assert.equal(await errorCode(limited), 'rate_limited')
    assert.equal((await fetch(`${base}/api/health`)).status, 200)
  })
})

test('concurrency is bounded and capacity returns after completion', async () => {
  let resolve!: (s: string) => void
  let started!: () => void
  const ready = new Promise<void>((r) => { started = r })
  let first = true
  await withApp({ MAX_CONCURRENT_TRANSLATIONS: '1' }, async () => {
    if (!first) return 'Hola'
    first = false
    started()
    return new Promise<string>((r) => { resolve = r })
  }, async (base) => {
    const pending = post(base)
    await ready
    try {
      const busy = await post(base)
      assert.equal(busy.status, 503)
      assert.equal(await errorCode(busy), 'busy')
    } finally { resolve('Hola') }
    assert.equal((await pending).status, 200)
    assert.equal((await post(base)).status, 200)
  })
})

test('a failed or timed-out translation releases its concurrency slot', async () => {
  let attempt = 0
  await withApp({ MAX_CONCURRENT_TRANSLATIONS: '1' }, async () => {
    attempt++
    // First call simulates an upstream timeout (the failure path); the slot it
    // held must be returned so the next request is not stuck reporting "busy".
    if (attempt === 1) throw new ApiError(504, 'upstream_timeout', 'The translation service took too long.')
    return 'Hola'
  }, async (base) => {
    const failed = await post(base)
    assert.equal(failed.status, 504)
    assert.equal(await errorCode(failed), 'upstream_timeout')
    const recovered = await post(base)
    assert.equal(recovered.status, 200)
  })
})

test('health signals an unconfigured optional provider and API misses remain JSON', async () => {
  await withApp({ TRANSLATION_PROVIDER: 'google' }, async () => 'unused', async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 503)
    const missing = await fetch(`${base}/api/missing`)
    assert.equal(missing.status, 404)
    assert.equal(await errorCode(missing), 'not_found')
  })
})
