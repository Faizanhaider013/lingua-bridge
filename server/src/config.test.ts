import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from './config.ts'

test('production requires an explicit HTTPS origin allowlist', () => {
  for (const origin of [undefined, '*', 'null', 'https://example.com/path', 'http://example.com', 'https://user:pass@example.com']) {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: origin }))
  }
  const config = loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'https://example.com,https://other.example' })
  assert.equal(config.provider, 'mymemory')
  assert.equal(config.maxTextLength, 2000)
})

test('invalid provider, port and numeric settings fail early', () => {
  assert.throws(() => loadConfig({ TRANSLATION_PROVIDER: 'typo' }))
  assert.throws(() => loadConfig({ PORT: '70000' }))
  assert.throws(() => loadConfig({ PORT: 'NaN' }))
  assert.throws(() => loadConfig({ REQUESTS_PER_MINUTE: '-1' }))
})
