import type { ServerConfig } from './config.ts'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'

// Make a startup misconfiguration explicit in the host's logs. Without this, a
// thrown config error (e.g. a missing/invalid CORS_ORIGIN in production) exits
// with a stack trace and the platform simply reports "no server" — the exact
// symptom seen when the deploy never becomes healthy. The message carries only
// the reason (never secrets).
let config: ServerConfig
try {
  config = loadConfig()
} catch (err) {
  console.error(`[startup] configuration error — server not started: ${(err as Error).message}`)
  process.exit(1)
}

const app = createApp(config)

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `Say It Anyway server listening on 0.0.0.0:${config.port} ` +
      `(provider: ${config.provider}, max ${config.maxTextLength} chars/message)`,
  )
  // Allowed origins are public URLs, not secrets — log them so a CORS/origin
  // mismatch is diagnosable from the deploy logs (see also the [cors] denial log).
  console.log(`[startup] allowed origins: ${config.corsOrigin}`)
  // Prove which build is actually live. Render injects RENDER_GIT_COMMIT; this
  // lets a log reader confirm the running commit instead of assuming it.
  console.log(`[startup] commit: ${process.env.RENDER_GIT_COMMIT ?? 'unknown'}`)
  if (config.provider === 'mymemory') {
    if (!config.myMemoryEmail) {
      console.log(
        'MyMemory: running anonymously (~5000 chars/day). Set MYMEMORY_EMAIL in .env to raise ' +
          'the daily limit (~50000 chars/day).',
      )
    }
  } else if (!config.googleApiKey) {
    console.warn(
      'WARNING: provider is "google" but GOOGLE_TRANSLATE_API_KEY is not set. Translate ' +
        'requests will return 503 (not_configured). See README.',
    )
  }
})

server.requestTimeout = 15_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(`[startup] listener failed (${error.code ?? 'unknown'})`)
  process.exitCode = 1
})

let closing = false
function shutdown() {
  if (closing) return
  closing = true
  console.log('[shutdown] draining active connections')
  // Provider deadlines are bounded; force-close before the host's grace period.
  const deadline = setTimeout(() => {
    server.closeAllConnections()
    process.exit(1)
  }, 25_000)
  deadline.unref()
  server.close(() => { clearTimeout(deadline); process.exitCode = 0 })
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
