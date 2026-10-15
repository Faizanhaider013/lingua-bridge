import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from './config.ts'
import { ApiError } from './errors.ts'
import { createTranslator } from './translate.ts'

test('defaults to MyMemory and is always ready (no credentials needed)', () => {
  const translator = createTranslator(loadConfig({}))
  assert.equal(translator.name, 'mymemory')
  assert.equal(translator.ready, true)
})

test('selects MyMemory explicitly', () => {
  const translator = createTranslator(loadConfig({ TRANSLATION_PROVIDER: 'mymemory' }))
  assert.equal(translator.name, 'mymemory')
})

test('selects Google when configured, and reports not-ready without a key', () => {
  const translator = createTranslator(loadConfig({ TRANSLATION_PROVIDER: 'google' }))
  assert.equal(translator.name, 'google')
  assert.equal(translator.ready, false)
})

test('Google provider without a key throws not_configured when called', async () => {
  const translator = createTranslator(loadConfig({ TRANSLATION_PROVIDER: 'google' }))
  await assert.rejects(
    translator.translate({ text: 'Hello', source: 'en', target: 'es' }),
    (err: unknown) => err instanceof ApiError && err.code === 'not_configured' && err.status === 503,
  )
})

test('Google provider is ready when a key is present', () => {
  const translator = createTranslator(
    loadConfig({ TRANSLATION_PROVIDER: 'google', GOOGLE_TRANSLATE_API_KEY: 'k' }),
  )
  assert.equal(translator.ready, true)
})

test('MyMemory default max message length is 2000 (chunking handles the 500-byte/request limit)', () => {
  const config = loadConfig({ TRANSLATION_PROVIDER: 'mymemory' })
  assert.equal(config.maxTextLength, 2000)
})

test('max message length honours the configured value for both providers', () => {
  assert.equal(loadConfig({ TRANSLATION_PROVIDER: 'mymemory', MAX_TEXT_LENGTH: '5000' }).maxTextLength, 5000)
  assert.equal(loadConfig({ TRANSLATION_PROVIDER: 'google', MAX_TEXT_LENGTH: '5000' }).maxTextLength, 5000)
})
