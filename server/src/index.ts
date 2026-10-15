import { createApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig()
const app = createApp(config)

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(
    `Say It Anyway server listening on 0.0.0.0:${config.port} ` +
      `(provider: ${config.provider}, max ${config.maxTextLength} chars/message)`,
  )
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
