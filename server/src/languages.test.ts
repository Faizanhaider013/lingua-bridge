import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSupportedLanguage, toGoogleCode } from './languages.ts'

test('isSupportedLanguage accepts known codes', () => {
  assert.equal(isSupportedLanguage('en'), true)
  assert.equal(isSupportedLanguage('zh'), true)
  assert.equal(isSupportedLanguage('ur'), true)
})

test('isSupportedLanguage rejects unknown, empty, and non-string input', () => {
  assert.equal(isSupportedLanguage('xx'), false)
  assert.equal(isSupportedLanguage('EN'), false) // codes are lowercase
  assert.equal(isSupportedLanguage(''), false)
  assert.equal(isSupportedLanguage(undefined), false)
  assert.equal(isSupportedLanguage(42), false)
})

test('toGoogleCode maps Chinese to a region-qualified code', () => {
  assert.equal(toGoogleCode('zh'), 'zh-CN')
})

test('toGoogleCode passes through codes that need no override', () => {
  assert.equal(toGoogleCode('en'), 'en')
  assert.equal(toGoogleCode('es'), 'es')
  assert.equal(toGoogleCode('ar'), 'ar')
})
