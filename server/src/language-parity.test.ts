import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { isSupportedLanguage, SUPPORTED_LANGUAGES, toGoogleCode } from './languages.ts'

/**
 * Drift guard for two intentionally *independent* language lists.
 *
 * The frontend (`src/data/languages.ts`) and backend (`server/src/languages.ts`)
 * each own their own list — the frontend stays decoupled from the backend, and
 * the backend validates codes on its own. This test is the cheap safety net
 * that catches the two falling out of sync, without a shared package or a
 * workspace refactor.
 *
 * It reads the frontend file as plain TEXT (not as a module) so the backend's
 * TypeScript project never reaches across the boundary — no build-time coupling,
 * just a parity check.
 */

function readFrontendLanguageCodes(): string[] {
  const path = fileURLToPath(new URL('../../src/data/languages.ts', import.meta.url))
  const source = readFileSync(path, 'utf8')
  // Each language entry looks like `{ code: 'en', label: ... }`. Pull the codes.
  const codes = [...source.matchAll(/\bcode:\s*'([a-z-]+)'/g)].map((m) => m[1])
  assert.ok(codes.length > 0, 'Could not parse any language codes from the frontend list.')
  return [...new Set(codes)].sort()
}

const frontendCodes = readFrontendLanguageCodes()
const backendCodes = [...SUPPORTED_LANGUAGES].sort()

test('frontend and backend offer exactly the same language codes', () => {
  const backendSet = new Set<string>(backendCodes)
  const frontendSet = new Set<string>(frontendCodes)
  const missingOnBackend = frontendCodes.filter((code) => !backendSet.has(code))
  const missingOnFrontend = backendCodes.filter((code) => !frontendSet.has(code))

  assert.deepEqual(
    { missingOnBackend, missingOnFrontend },
    { missingOnBackend: [], missingOnFrontend: [] },
    'Language lists have drifted. Update src/data/languages.ts and/or ' +
      'server/src/languages.ts so they offer the same codes.',
  )
})

test('every frontend code passes the backend validator', () => {
  for (const code of frontendCodes) {
    assert.ok(
      isSupportedLanguage(code),
      `Frontend offers "${code}" but the backend validator rejects it.`,
    )
  }
})

test('every backend code has a non-empty Google mapping', () => {
  for (const code of SUPPORTED_LANGUAGES) {
    const mapped = toGoogleCode(code)
    assert.ok(
      typeof mapped === 'string' && mapped.length > 0,
      `No Google code mapping for "${code}".`,
    )
  }
})
