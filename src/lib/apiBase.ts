/** Shared by Vite's build validation and the browser; contains no secrets. */
export function resolveApiBase(value: string | undefined, production: boolean): string {
  const base = (value?.trim() || '/api').replace(/\/+$/, '')
  if (base === '/api') return base
  let url: URL
  try { url = new URL(base) } catch {
    throw new Error('VITE_API_BASE_URL must be /api or an absolute backend URL ending in /api.')
  }
  const local = url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
    url.hostname.startsWith('127.') || url.hostname === '[::1]' || url.hostname === '0.0.0.0'
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/api' ||
      (production && (url.protocol !== 'https:' || local))) {
    throw new Error('Production VITE_API_BASE_URL must be /api or a public HTTPS backend URL ending in /api, without credentials, query or fragment.')
  }
  return base
}
