import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import type { Server } from 'node:http'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { ApiError } from './errors.ts'
import type { TranslateParams } from './translate.ts'

// A stub translator: records calls and echoes a deterministic result, so the
// route can be tested end-to-end with no network and no API key.
const calls: TranslateParams[] = []
let translateImpl: (params: TranslateParams) => Promise<string> = async (params) => {
  calls.push(params)
  return `[${params.source}->${params.target}] ${params.text}`
}

const config = { ...loadConfig({}), maxTextLength: 50 }
const app = createApp(config, { translate: (p) => translateImpl(p) })

let server: Server
let baseUrl = ''

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${port}`
      resolve()
    })
  })
})

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function postTranslate(body: unknown, raw = false) {
  return fetch(`${baseUrl}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
}

// Response.json() is typed `unknown`; tests assert against loose shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response): Promise<any> {
  return res.json()
}

test('health endpoint reports provider, readiness, and max length', async () => {
  const res = await fetch(`${baseUrl}/api/health`)
  assert.equal(res.status, 200)
  const json = await readJson(res)
  assert.equal(json.status, 'ok')
  assert.equal(json.provider, 'mymemory')
  assert.equal(json.translationReady, true)
  assert.equal(json.maxTextLength, 50)
})

test('translates both directions through the route', async () => {
  const forward = await postTranslate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' })
  assert.equal(forward.status, 200)
  const forwardBody = await readJson(forward)
  assert.equal(forwardBody.translatedText, '[en->es] Hello')
  assert.equal(forwardBody.sourceLang, 'en')
  assert.equal(forwardBody.targetLang, 'es')
  assert.equal(forwardBody.provider, 'mymemory')

  const reverse = await postTranslate({ text: 'Hola', sourceLang: 'es', targetLang: 'en' })
  const reverseBody = await readJson(reverse)
  assert.equal(reverseBody.translatedText, '[es->en] Hola')
  assert.equal(reverseBody.sourceLang, 'es')
  assert.equal(reverseBody.targetLang, 'en')
})

test('short-circuits same-language requests without calling the provider', async () => {
  const before = calls.length
  const res = await postTranslate({ text: 'Same', sourceLang: 'en', targetLang: 'en' })
  const json = await readJson(res)
  assert.equal(json.translatedText, 'Same')
  assert.equal(json.identity, true)
  assert.equal(calls.length, before, 'translate() should not have been called')
})

test('rejects empty text with a structured 400 error', async () => {
  const res = await postTranslate({ text: '   ', sourceLang: 'en', targetLang: 'es' })
  assert.equal(res.status, 400)
  const json = await readJson(res)
  assert.equal(json.error.code, 'empty_text')
})

test('rejects over-long text', async () => {
  const res = await postTranslate({ text: 'a'.repeat(51), sourceLang: 'en', targetLang: 'es' })
  assert.equal(res.status, 400)
  assert.equal((await readJson(res)).error.code, 'text_too_long')
})

test('rejects unsupported languages', async () => {
  const res = await postTranslate({ text: 'hi', sourceLang: 'en', targetLang: 'xx' })
  assert.equal(res.status, 400)
  assert.equal((await readJson(res)).error.code, 'unsupported_language')
})

test('rejects malformed JSON bodies', async () => {
  const res = await postTranslate('{not json', true)
  assert.equal(res.status, 400)
  assert.equal((await readJson(res)).error.code, 'invalid_json')
})

test('surfaces provider ApiErrors with their status and code', async () => {
  const original = translateImpl
  translateImpl = async () => {
    throw new ApiError(502, 'upstream_error', 'The translation service returned an error.')
  }
  try {
    const res = await postTranslate({ text: 'Hello', sourceLang: 'en', targetLang: 'es' })
    assert.equal(res.status, 502)
    assert.equal((await readJson(res)).error.code, 'upstream_error')
  } finally {
    translateImpl = original
  }
})
