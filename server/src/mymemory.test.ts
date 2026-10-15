import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from './errors.ts'
import { translateWithMyMemory } from './mymemory.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A fetch stub that echoes each `q` through a transform and records calls. */
function echoFetch(transform: (q: string) => string, calls: string[] = []) {
  const fetchImpl = (async (url: string) => {
    const q = new URL(url).searchParams.get('q') ?? ''
    calls.push(q)
    return jsonResponse({ responseData: { translatedText: transform(q) }, responseStatus: 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

// --- Fast path (short messages, single request) ---------------------------

test('returns the translated text and sends a correctly formatted request', async () => {
  let capturedUrl = ''
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return jsonResponse({
      responseData: { translatedText: 'Hola mundo', match: 0.9 },
      responseStatus: 200,
    })
  }) as unknown as typeof fetch

  const result = await translateWithMyMemory(
    { text: 'Hello world', source: 'en', target: 'es' },
    { fetchImpl },
  )
  assert.equal(result, 'Hola mundo')

  const parsed = new URL(capturedUrl)
  assert.equal(parsed.origin + parsed.pathname, 'https://api.mymemory.translated.net/get')
  assert.equal(parsed.searchParams.get('q'), 'Hello world')
  assert.equal(parsed.searchParams.get('langpair'), 'en|es')
})

test('short message takes the single-request fast path', async () => {
  const { fetchImpl, calls } = echoFetch((q) => `[${q}]`)
  const result = await translateWithMyMemory({ text: 'Short one.', source: 'en', target: 'es' }, { fetchImpl })
  assert.equal(calls.length, 1)
  assert.equal(result, '[Short one.]')
})

test('maps Chinese to the zh-CN langpair code', async () => {
  let capturedUrl = ''
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return jsonResponse({ responseData: { translatedText: '你好' }, responseStatus: 200 })
  }) as unknown as typeof fetch

  await translateWithMyMemory({ text: 'Hello', source: 'en', target: 'zh' }, { fetchImpl })
  assert.equal(new URL(capturedUrl).searchParams.get('langpair'), 'en|zh-CN')
})

test('includes the de (email) and key params only when provided', async () => {
  let capturedUrl = ''
  const fetchImpl = (async (url: string) => {
    capturedUrl = url
    return jsonResponse({ responseData: { translatedText: 'x' }, responseStatus: 200 })
  }) as unknown as typeof fetch

  await translateWithMyMemory(
    { text: 'Hi', source: 'en', target: 'es' },
    { fetchImpl, email: 'ops@example.com', apiKey: 'abc' },
  )
  const sp = new URL(capturedUrl).searchParams
  assert.equal(sp.get('de'), 'ops@example.com')
  assert.equal(sp.get('key'), 'abc')
})

// --- Chunked path (long messages) -----------------------------------------

test('splits a long message into multiple requests and joins them in order', async () => {
  // Three sentences, each well under 500 bytes but together over it.
  const filler = 'word '.repeat(40).trim() // ~199 bytes
  const text = `${filler}. ${filler}! ${filler}?`
  assert.ok(Buffer.byteLength(text, 'utf8') > 500)

  const { fetchImpl, calls } = echoFetch((q) => `<${q}>`)
  const result = await translateWithMyMemory({ text, source: 'en', target: 'es' }, { fetchImpl })

  assert.ok(calls.length > 1, 'should issue more than one request')
  // Every chunk is within the byte limit.
  for (const q of calls) assert.ok(Buffer.byteLength(q, 'utf8') <= 500)
  // Result is the chunk translations joined, in request order.
  assert.equal(result, calls.map((q) => `<${q}>`).join(' '))
  // No source words dropped or duplicated.
  const srcWords = text.split(/\s+/).filter(Boolean)
  const gotWords = calls.join(' ').split(/\s+/).filter(Boolean)
  assert.deepEqual(gotWords, srcWords)
})

test('preserves order even when later chunks resolve first (bounded concurrency)', async () => {
  const text = `${'a'.repeat(300)}. ${'b'.repeat(300)}. ${'c'.repeat(300)}.`
  const order: string[] = []
  let dispatch = 0
  const fetchImpl = (async (url: string) => {
    const q = new URL(url).searchParams.get('q') ?? ''
    const myDispatch = dispatch++
    // Earlier-dispatched requests resolve later, forcing out-of-order completion.
    await new Promise((r) => setTimeout(r, (3 - myDispatch) * 8))
    order.push(q)
    return jsonResponse({ responseData: { translatedText: q.toUpperCase() }, responseStatus: 200 })
  }) as unknown as typeof fetch

  const result = await translateWithMyMemory({ text, source: 'en', target: 'es' }, { fetchImpl, maxConcurrency: 3 })
  // Completed out of dispatch order…
  assert.notEqual(order[0], 'a'.repeat(300) + '.')
  // …but the result is still in source order.
  assert.equal(result, `${'A'.repeat(300)}. ${'B'.repeat(300)}. ${'C'.repeat(300)}.`)
})

test('handles multi-byte Urdu by byte length, keeping each chunk within the limit', async () => {
  // Urdu letter "ا" (U+0627) is 2 bytes; 400 of them = 800 bytes > 500.
  const text = 'ا'.repeat(400)
  const { fetchImpl, calls } = echoFetch((q) => q)
  await translateWithMyMemory({ text, source: 'ur', target: 'en' }, { fetchImpl })
  assert.ok(calls.length >= 2, 'multi-byte text over 500 bytes must split')
  for (const q of calls) assert.ok(Buffer.byteLength(q, 'utf8') <= 500)
})

test('does not split an emoji (grapheme) across chunk boundaries', async () => {
  const family = '👨‍👩‍👧‍👦' // ZWJ sequence, 25 bytes
  const text = `${'x'.repeat(480)} ${family} ${'y'.repeat(480)}`
  const { fetchImpl, calls } = echoFetch((q) => q)
  await translateWithMyMemory({ text, source: 'en', target: 'es' }, { fetchImpl })

  // The whole family emoji must appear intact inside exactly one chunk.
  const chunksWithFamily = calls.filter((q) => q.includes(family))
  assert.equal(chunksWithFamily.length, 1)
  // And no chunk contains a broken piece of it.
  for (const q of calls) assert.ok(Buffer.byteLength(q, 'utf8') <= 500)
})

test('rejects when the message would exceed the chunk-count safety limit', async () => {
  const { fetchImpl, calls } = echoFetch((q) => q)
  const text = `${'word '.repeat(60)}. `.repeat(10) // many chunks
  await assert.rejects(
    translateWithMyMemory({ text, source: 'en', target: 'es' }, { fetchImpl, maxChunks: 2 }),
    (err: unknown) => err instanceof ApiError && err.code === 'text_too_long' && err.status === 400,
  )
  assert.equal(calls.length, 0, 'must not call the provider when over the chunk limit')
})

// --- Partial failures during chunking -------------------------------------

test('fails the whole translation if any chunk hits the quota (no partial result)', async () => {
  const text = `${'a'.repeat(300)}. ${'b'.repeat(300)}. ${'c'.repeat(300)}.`
  const fetchImpl = (async (url: string) => {
    const q = new URL(url).searchParams.get('q') ?? ''
    if (q.startsWith('b')) {
      return jsonResponse({
        responseData: { translatedText: 'warning' },
        responseStatus: '403',
        responseDetails: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.',
        quotaFinished: true,
      })
    }
    return jsonResponse({ responseData: { translatedText: q.toUpperCase() }, responseStatus: 200 })
  }) as unknown as typeof fetch

  await assert.rejects(
    translateWithMyMemory({ text, source: 'en', target: 'es' }, { fetchImpl, maxConcurrency: 1 }),
    (err: unknown) => err instanceof ApiError && err.code === 'quota_exceeded' && err.status === 429,
  )
})

test('fails the whole translation if a chunk times out', async () => {
  const text = `${'a'.repeat(300)}. ${'b'.repeat(300)}.`
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const q = new URL(url).searchParams.get('q') ?? ''
    if (q.startsWith('b')) {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        )
      })
    }
    return jsonResponse({ responseData: { translatedText: q.toUpperCase() }, responseStatus: 200 })
  }) as unknown as typeof fetch

  await assert.rejects(
    translateWithMyMemory({ text, source: 'en', target: 'es' }, { fetchImpl, maxConcurrency: 1, timeoutMs: 15 }),
    (err: unknown) => err instanceof ApiError && err.code === 'upstream_timeout' && err.status === 504,
  )
})

// --- Fast-path error handling (unchanged behaviour) -----------------------

test('maps an exhausted quota (quotaFinished flag) to a 429 quota_exceeded', async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.' },
      responseStatus: 403,
      responseDetails: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN 05:00:00',
      quotaFinished: true,
    })) as unknown as typeof fetch

  await assert.rejects(
    translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, { fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'quota_exceeded' && err.status === 429,
  )
})

test('never returns the warning body as a translation', async () => {
  const warning = 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.'
  const fetchImpl = (async () =>
    jsonResponse({
      responseData: { translatedText: warning },
      responseStatus: '403',
      responseDetails: warning,
      quotaFinished: true,
    })) as unknown as typeof fetch

  const result = await translateWithMyMemory(
    { text: 'Hello', source: 'en', target: 'es' },
    { fetchImpl },
  ).then(
    () => 'RESOLVED',
    (err) => (err instanceof ApiError ? err.code : 'OTHER'),
  )
  assert.equal(result, 'quota_exceeded')
})

test('maps an in-body 429 rate-limit (HTTP 200) to a recoverable quota_exceeded', async () => {
  // MyMemory short-term rate limiting: HTTP 200 with responseStatus 429 and a
  // message that does NOT contain the daily "MYMEMORY WARNING" wording.
  const fetchImpl = (async () =>
    jsonResponse({
      responseData: { translatedText: 'TOO MANY REQUESTS. PLEASE WAIT.' },
      responseStatus: 429,
      responseDetails: 'TOO MANY REQUESTS. PLEASE WAIT AND TRY AGAIN.',
    })) as unknown as typeof fetch

  await assert.rejects(
    translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, { fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'quota_exceeded' && err.status === 429,
  )
})

test('maps a generic in-body 403 usage error (not invalid-language) to quota_exceeded', async () => {
  const fetchImpl = (async () =>
    jsonResponse({
      responseData: { translatedText: 'DAILY LIMIT REACHED' },
      responseStatus: '403',
      responseDetails: 'YOU HAVE REACHED YOUR DAILY USAGE LIMIT.',
    })) as unknown as typeof fetch

  await assert.rejects(
    translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, { fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'quota_exceeded' && err.status === 429,
  )
})

test('maps a string "403" invalid-language response to invalid_language_pair', async () => {
  const detail = "'ZZ' IS AN INVALID TARGET LANGUAGE . EXAMPLE: LANGPAIR=EN|IT USING 2 LETTER ISO OR RFC3066 LIKE ZH-CN."
  const fetchImpl = (async () =>
    jsonResponse({
      responseData: { translatedText: detail },
      responseStatus: '403',
      responseDetails: detail,
    })) as unknown as typeof fetch

  await assert.rejects(
    translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, { fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'invalid_language_pair' && err.status === 400,
  )
})

test('maps an HTTP 429 to quota_exceeded', async () => {
  const fetchImpl = (async () => jsonResponse({}, 429)) as unknown as typeof fetch
  await assert.rejects(
    translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, { fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'quota_exceeded',
  )
})

test('maps a timeout (abort) to upstream_timeout', async () => {
  const fetchImpl = (async (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    })) as unknown as typeof fetch

  await assert.rejects(
    translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, { fetchImpl, timeoutMs: 10 }),
    (err: unknown) => err instanceof ApiError && err.code === 'upstream_timeout' && err.status === 504,
  )
})

test('maps a malformed success payload to upstream_error', async () => {
  const fetchImpl = (async () =>
    jsonResponse({ responseStatus: 200, responseData: {} })) as unknown as typeof fetch
  await assert.rejects(
    translateWithMyMemory({ text: 'Hello', source: 'en', target: 'es' }, { fetchImpl }),
    (err: unknown) => err instanceof ApiError && err.code === 'upstream_error',
  )
})
