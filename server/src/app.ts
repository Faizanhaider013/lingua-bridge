import cors from 'cors'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import express, { type ErrorRequestHandler, type Request, type Response } from 'express'
import type { ServerConfig } from './config.ts'
import { ApiError } from './errors.ts'
import { createTranslator, type TranslateParams } from './translate.ts'
import { parseTranslateRequest } from './validation.ts'

/** The one dependency the route needs; injectable so tests can stub it. */
export interface AppDeps {
  translate: (params: TranslateParams) => Promise<string>
}

export function createApp(config: ServerConfig, deps?: Partial<AppDeps>) {
  const translator = createTranslator(config)
  const translate = deps?.translate ?? translator.translate

  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    })
    if (config.production) res.set('Strict-Transport-Security', 'max-age=31536000')
    next()
  })
  const allowedOrigins = new Set(config.corsOrigin.split(',').map((origin) => origin.trim()))
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) {
      throw new ApiError(403, 'origin_denied', 'This website is not allowed to access the translation service.')
    }
    next()
  }, cors({ origin: [...allowedOrigins], methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }))

  // Global, per-process bounds avoid trusting spoofable proxy/IP headers.
  // CORS is not authentication: requests without Origin still share these limits.
  let windowStart = Date.now()
  let requests = 0
  let active = 0
  app.post('/api/translate', (_req, res, next) => {
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0 }
    if (++requests > config.requestsPerMinute) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((60_000 - (Date.now() - windowStart)) / 1000))))
      throw new ApiError(429, 'rate_limited', 'Too many translation requests. Please wait a minute before retrying.')
    }
    next()
  })
  app.use(express.json({ limit: '16kb', inflate: false }))

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(translator.ready ? 200 : 503).json({
      status: 'ok',
      provider: translator.name,
      translationReady: translator.ready,
      maxTextLength: config.maxTextLength,
    })
  })

  app.post('/api/translate', async (req: Request, res: Response) => {
    // Validation throws ApiError(400) on bad input; parsed text is trimmed.
    const { text, sourceLang, targetLang } = parseTranslateRequest(req.body, config.maxTextLength)

    // Same-language request: a genuine identity result, no provider call.
    if (sourceLang === targetLang) {
      res.json({ translatedText: text, sourceLang, targetLang, identity: true })
      return
    }

    if (active >= config.maxConcurrentTranslations) {
      res.set('Retry-After', '5')
      throw new ApiError(503, 'busy', 'Translation is busy. Please wait a few seconds and retry.')
    }
    const disconnected = new AbortController()
    const onClose = () => { if (!res.writableEnded) disconnected.abort() }
    res.on('close', onClose)
    const signal = AbortSignal.any([disconnected.signal, AbortSignal.timeout(30_000)])
    active++
    try {
      const translatedText = await translate({ text, source: sourceLang, target: targetLang, signal })
      if (signal.aborted) throw new ApiError(504, 'upstream_timeout', 'Translation took too long. Please retry.')
      res.json({ translatedText, sourceLang, targetLang, provider: translator.name })
    } finally {
      active--
      res.off('close', onClose)
    }
  })

  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'not_found', 'API endpoint not found.')))
  if (config.serveFrontend) {
    const dist = fileURLToPath(new URL('../../dist/', import.meta.url))
    if (!existsSync(join(dist, 'index.html'))) throw new Error('Frontend build missing. Run npm run build from the project root.')
    app.use('/assets', express.static(join(dist, 'assets'), { immutable: true, maxAge: '1y' }))
    app.use(express.static(dist, { maxAge: 0 }))
    // Real document navigations may use SPA fallback; missing assets must stay 404.
    app.get('/{*path}', (req, res, next) => {
      if (!req.path.includes('.') && req.accepts('html')) {
        res.set('Cache-Control', 'no-cache')
        res.sendFile(join(dist, 'index.html'))
      } else next()
    })
  }

  // Centralised error handler — always returns the structured error shape.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (res.headersSent || res.destroyed) return
    if (err instanceof ApiError) {
      res.status(err.status).json(err.toBody())
      return
    }
    // Malformed JSON body from express.json() lands here.
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).json(new ApiError(400, 'invalid_json', 'Request body is not valid JSON.').toBody())
      return
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json(new ApiError(413, 'body_too_large', 'Request body is too large. Please shorten your message.').toBody())
      return
    }
    if (err?.status === 415) {
      res.status(415).json(new ApiError(415, 'unsupported_encoding', 'Send an uncompressed UTF-8 JSON request.').toBody())
      return
    }
    console.error('[app] unexpected request failure')
    res.status(500).json(new ApiError(500, 'internal_error', 'An unexpected server error occurred.').toBody())
  }
  app.use(errorHandler)

  return app
}
