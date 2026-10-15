import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
// Select a free local port; no fixed port or external translation calls.
const reservation = createServer().listen(0, '127.0.0.1')
await new Promise((resolve) => reservation.once('listening', resolve))
const port = reservation.address().port
await new Promise((resolve) => reservation.close(resolve))
const child = spawn(process.execPath, ['src/index.ts'], {
  cwd: fileURLToPath(new URL('server/', root)),
  env: {
    ...process.env, NODE_ENV: 'production', PORT: String(port), SERVE_FRONTEND: 'true',
    CORS_ORIGIN: 'https://app.example', TRANSLATION_PROVIDER: 'mymemory',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let diagnostics = ''
child.stdout.on('data', (data) => { diagnostics += data })
child.stderr.on('data', (data) => { diagnostics += data })
const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
const base = `http://127.0.0.1:${port}`
try {
  let healthy = false
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${diagnostics}`)
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })
      const health = await response.json()
      if (response.ok && health.translationReady) { healthy = true; break }
    } catch { /* Retry startup, not a translation. */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(healthy, 'Production server must become healthy')
  const page = await fetch(base)
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('x-frame-options'), 'DENY')
  assert.ok(page.headers.get('content-security-policy'))
  const html = await page.text()
  assert.match(html, /Say It Anyway/)
  for (const asset of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
    const response = await fetch(`${base}${asset[1]}`)
    assert.equal(response.status, 200, asset[1])
    assert.doesNotMatch(response.headers.get('content-type') ?? '', /text\/html/, asset[1])
  }
  assert.equal((await fetch(`${base}/conversation`, { headers: { Accept: 'text/html' } })).status, 200)
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404)
  const missing = await fetch(`${base}/api/missing`)
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).error.code, 'not_found')
  const identity = await fetch(`${base}/api/translate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.example' },
    body: JSON.stringify({ text: 'Smoke check', sourceLang: 'en', targetLang: 'en' }),
  })
  assert.equal(identity.status, 200)
  assert.equal((await identity.json()).identity, true)
  assert.equal(identity.headers.get('access-control-allow-origin'), 'https://app.example')
  const denied = await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.example' } })
  assert.equal(denied.status, 403)
  for (const asset of await readdir(new URL('dist/assets/', root))) {
    if (!asset.endsWith('.js')) continue
    const bundle = await readFile(new URL(`dist/assets/${asset}`, root), 'utf8')
    assert.doesNotMatch(bundle, /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?\/api/, 'No local API URL in production output')
  }
  console.log('PASS: production startup, health, HTML/assets, refresh, API errors, identity route, CORS, headers and bundle API URL scan.')
  console.log('No external provider request made; live translation and browser speech remain manual checks.')
} finally {
  child.kill('SIGTERM')
  const timeout = setTimeout(() => child.kill('SIGKILL'), 28_000)
  const code = await exited
  clearTimeout(timeout)
  if (process.platform !== 'win32') assert.equal(code, 0, 'Graceful SIGTERM shutdown')
  else console.log('Windows terminates the child directly; graceful signal draining requires a Linux deployment check.')
}
