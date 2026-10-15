import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byteLength, chunkText } from './chunk.ts'

const bytes = (s: string) => Buffer.byteLength(s, 'utf8')
const words = (s: string) => s.split(/\s+/).filter(Boolean)

function assertAllWithin(chunks: string[], max: number) {
  for (const c of chunks) assert.ok(bytes(c) <= max, `chunk "${c}" is ${bytes(c)} > ${max} bytes`)
}

test('byteLength counts UTF-8 bytes', () => {
  assert.equal(byteLength('abc'), 3)
  assert.equal(byteLength('ا'), 2) // Urdu alif
  assert.equal(byteLength('你'), 3)
  assert.equal(byteLength('👍'), 4)
})

test('short text returns a single trimmed chunk', () => {
  assert.deepEqual(chunkText('Hello world', 500), ['Hello world'])
  assert.deepEqual(chunkText('  padded  ', 500), ['padded'])
})

test('text exactly at the limit is one chunk', () => {
  assert.deepEqual(chunkText('abcde', 5), ['abcde'])
})

test('prefers sentence boundaries', () => {
  const text = 'aaaaaaaa. bbbbbbbb. cccccccc.'
  const chunks = chunkText(text, 12)
  assertAllWithin(chunks, 12)
  for (const c of chunks) assert.ok(/[.!?]$/.test(c), `"${c}" should end at a sentence boundary`)
  assert.deepEqual(words(chunks.join(' ')), words(text)) // nothing lost or duplicated
})

test('falls back to word boundaries within a long sentence', () => {
  const text = 'one two three four five six seven eight nine ten'
  const chunks = chunkText(text, 13)
  assertAllWithin(chunks, 13)
  // Every source word appears, in order, intact (no word split).
  assert.deepEqual(words(chunks.join(' ')), words(text))
})

test('preserves order across many chunks', () => {
  const text = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')
  const chunks = chunkText(text, 10)
  assert.deepEqual(words(chunks.join(' ')), words(text))
})

test('hard-splits a single word longer than the limit without losing characters', () => {
  const word = 'a'.repeat(100)
  const chunks = chunkText(word, 30)
  assertAllWithin(chunks, 30)
  assert.ok(chunks.length >= 4)
  assert.equal(chunks.join(''), word) // no whitespace to lose → exact reconstruction
})

test('never splits a multi-byte character across chunks (Urdu)', () => {
  // 400 × 2-byte alif = 800 bytes, no spaces → hard split on code points.
  const text = 'ا'.repeat(400)
  const chunks = chunkText(text, 101) // odd limit to probe boundary handling
  assertAllWithin(chunks, 101)
  assert.equal(chunks.join(''), text)
  // Each chunk must be whole alifs (even byte length), never a split byte.
  for (const c of chunks) assert.equal(bytes(c) % 2, 0)
})

test('keeps a ZWJ emoji sequence intact in exactly one chunk', () => {
  const family = '👨‍👩‍👧‍👦' // 25 bytes
  const text = `${family}${family}${family}`
  const chunks = chunkText(text, 30)
  assertAllWithin(chunks, 30)
  assert.equal(chunks.length, 3)
  for (const c of chunks) assert.equal(c, family) // each emoji whole, never fragmented
})

test('keeps emoji intact amid text', () => {
  const thumbs = '👍'
  const text = `okay ${thumbs} sounds good ${thumbs} done`
  const chunks = chunkText(text, 8)
  assertAllWithin(chunks, 8)
  assert.deepEqual(words(chunks.join(' ')), words(text))
  assert.equal(chunks.join(' ').match(/👍/gu)?.length, 2) // both emoji survive
})

test('mixed Hindi sentences split on the danda and stay within bytes', () => {
  const text = 'यह एक वाक्य है। यह दूसरा वाक्य है। यह तीसरा है।'
  const chunks = chunkText(text, 60)
  assertAllWithin(chunks, 60)
  assert.deepEqual(words(chunks.join(' ')), words(text))
})
