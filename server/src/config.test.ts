import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from './config.ts'

test('production requires an explicit HTTPS origin allowlist', () => {
  // Genuinely unusable values still fail closed (no wildcard, no credentials,
  // no plain HTTP in production, and CORS_ORIGIN cannot be omitted).
  for (const origin of [undefined, '', '*', 'null', 'http://example.com', 'https://user:pass@example.com', 'ftp://example.com']) {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: origin }))
  }
  const config = loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: 'https://example.com,https://other.example' })
  assert.equal(config.provider, 'mymemory')
  assert.equal(config.maxTextLength, 2000)
})

test('CORS_ORIGIN is normalised to canonical origins (the production 403 root cause)', () => {
  // A value pasted from the address bar with a trailing slash, a path, or mixed
  // case must NOT crash startup — it is normalised to the canonical origin that
  // the browser actually sends in the Origin header.
  for (const raw of [
    'https://lingua-bridge-q59l.onrender.com/',
    'https://lingua-bridge-q59l.onrender.com/api',
    'HTTPS://Lingua-Bridge-Q59L.onrender.com',
    '  https://lingua-bridge-q59l.onrender.com  ',
    'https://lingua-bridge-q59l.onrender.com.',
    'https://lingua-bridge-q59l.onrender.com./',
  ]) {
    const config = loadConfig({ NODE_ENV: 'production', CORS_ORIGIN: raw })
    assert.equal(config.corsOrigin, 'https://lingua-bridge-q59l.onrender.com')
  }
  // De-duplicates equivalent entries.
  const deduped = loadConfig({
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://a.example, https://a.example/, https://b.example',
  })
  assert.equal(deduped.corsOrigin, 'https://a.example,https://b.example')
})

test('invalid provider, port and numeric settings fail early', () => {
  assert.throws(() => loadConfig({ TRANSLATION_PROVIDER: 'typo' }))
  assert.throws(() => loadConfig({ PORT: '70000' }))
  assert.throws(() => loadConfig({ PORT: 'NaN' }))
  assert.throws(() => loadConfig({ REQUESTS_PER_MINUTE: '-1' }))
})
