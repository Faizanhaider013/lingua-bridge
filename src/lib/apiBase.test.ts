import { describe, expect, it } from 'vitest'
import { resolveApiBase } from './apiBase'

describe('production API configuration', () => {
  it('defaults to the same-origin API and normalizes whitespace and slashes', () => {
    expect(resolveApiBase(undefined, true)).toBe('/api')
    expect(resolveApiBase(' https://backend.example/api/ ', true)).toBe('https://backend.example/api')
  })
  it('rejects local, insecure, credentialed and malformed production targets', () => {
    for (const url of ['http://backend.example/api', 'https://localhost/api', 'https://127.0.0.1/api', 'https://[::1]/api', '//evil.example/api', 'https://user:secret@example.com/api', 'https://example.com', 'https://example.com/api?q=secret']) {
      expect(() => resolveApiBase(url, true)).toThrow()
    }
  })
  it('allows a local backend only in development', () => {
    expect(resolveApiBase('http://localhost:8787/api', false)).toBe('http://localhost:8787/api')
  })
})
