/**
 * UTF-8-safe text chunking for providers with a per-request byte limit
 * (MyMemory caps `q` at 500 bytes).
 *
 * Guarantees:
 * - Every returned chunk is at most `maxBytes` bytes when UTF-8 encoded.
 * - No multi-byte character — and, where the platform supports grapheme
 *   segmentation, no emoji / combining sequence — is split across a boundary.
 * - The chunks are an ordered partition of the source: concatenating the
 *   *untrimmed* atoms reproduces the original, so nothing is dropped or
 *   duplicated. (Returned chunks are trimmed for translation; see note below.)
 *
 * Splitting preference: sentence boundaries first, then word boundaries, then —
 * only for a single word longer than the limit — grapheme/codepoint boundaries.
 *
 * NOTE on whitespace: returned chunks are individually trimmed, so whitespace
 * that fell exactly on a chunk boundary is not inside either chunk. Callers that
 * translate chunks separately rejoin the results with a single space. Whitespace
 * *within* a chunk is preserved.
 */

export function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/** Sentence-ending punctuation across the scripts this app supports. */
const SENTENCE_TERMINATORS = new Set([
  '.', '!', '?', // Latin
  '۔', '؟', // Urdu / Arabic (full stop, question mark)
  '。', '！', '？', // CJK
  '…', // ellipsis
  '।', // Devanagari danda (Hindi)
])

/**
 * Splits text into sentences, keeping each terminator and the whitespace that
 * follows it attached to its sentence. Concatenation of the result === input.
 */
function splitSentences(text: string): string[] {
  const codepoints = Array.from(text)
  const pieces: string[] = []
  let buffer: string[] = []

  for (let i = 0; i < codepoints.length; i++) {
    const ch = codepoints[i]
    buffer.push(ch)
    if (SENTENCE_TERMINATORS.has(ch)) {
      // Absorb any trailing whitespace so the next sentence starts clean.
      while (i + 1 < codepoints.length && /\s/u.test(codepoints[i + 1])) {
        buffer.push(codepoints[i + 1])
        i++
      }
      pieces.push(buffer.join(''))
      buffer = []
    }
  }
  if (buffer.length > 0) pieces.push(buffer.join(''))
  return pieces
}

/**
 * Splits text into words, keeping trailing whitespace attached to each word.
 * Concatenation of the result === input.
 */
function splitWords(text: string): string[] {
  const pieces: string[] = []
  let lastIndex = 0
  for (const match of text.matchAll(/\s*\S+\s*/gu)) {
    pieces.push(match[0])
    lastIndex = match.index + match[0].length
  }
  // Whitespace-only remainder (or whitespace-only input).
  if (lastIndex < text.length) pieces.push(text.slice(lastIndex))
  return pieces.length > 0 ? pieces : [text]
}

/** Grapheme clusters when available (keeps emoji intact), else code points. */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Segmenter) {
    const seg = new Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(seg.segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

/** Last-resort split of a single over-long token along grapheme boundaries. */
function hardSplit(token: string, maxBytes: number): string[] {
  const out: string[] = []
  let current = ''
  for (const g of graphemes(token)) {
    if (byteLength(current + g) > maxBytes) {
      if (current) out.push(current)
      // A single grapheme larger than the limit is pathological at 500 bytes,
      // but fall back to code points so we still never break a codepoint.
      if (byteLength(g) > maxBytes) {
        let cp = ''
        for (const c of Array.from(g)) {
          if (byteLength(cp + c) > maxBytes) {
            if (cp) out.push(cp)
            cp = c
          } else {
            cp += c
          }
        }
        current = cp
      } else {
        current = g
      }
    } else {
      current += g
    }
  }
  if (current) out.push(current)
  return out
}

/**
 * Chunks `text` into pieces each ≤ `maxBytes` bytes, trimmed and non-empty,
 * preferring sentence then word then grapheme boundaries.
 */
export function chunkText(text: string, maxBytes: number): string[] {
  if (maxBytes <= 0) throw new Error('maxBytes must be positive')

  // Build atoms that are each individually ≤ maxBytes.
  const atoms: string[] = []
  for (const sentence of splitSentences(text)) {
    if (byteLength(sentence) <= maxBytes) {
      atoms.push(sentence)
      continue
    }
    for (const word of splitWords(sentence)) {
      if (byteLength(word) <= maxBytes) atoms.push(word)
      else atoms.push(...hardSplit(word, maxBytes))
    }
  }

  // Greedily pack adjacent atoms to minimise the number of requests.
  const chunks: string[] = []
  let current = ''
  for (const atom of atoms) {
    if (current === '') {
      current = atom
    } else if (byteLength(current + atom) <= maxBytes) {
      current += atom
    } else {
      chunks.push(current)
      current = atom
    }
  }
  if (current !== '') chunks.push(current)

  return chunks.map((c) => c.trim()).filter((c) => c.length > 0)
}
