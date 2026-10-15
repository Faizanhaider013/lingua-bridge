# Deployment-readiness audit

A static and local-runtime audit of the server, build, and deployment
configuration. **No public deployment, live external translation, real-browser
speech, or Linux signal shutdown has been performed or verified here.** Where a
guarantee can only be confirmed on the live platform, it is called out below.

Last run on Windows with the frontend built and the backend started locally.

## What was verified (locally / by test)

- **Provider timeout covers the whole fetch, including body read/parse.**
  `server/src/upstream.ts` keeps one `AbortController` + timer live until after
  `response.json()` resolves (cleared only in `finally`), and composes it with
  the caller's signal via `AbortSignal.any`. A timeout aborts the body stream and
  maps to `504 upstream_timeout`. Covered by `upstream.test.ts` ("provider timeout
  includes a stalled response body", "pre-aborted work never reaches the provider").
- **Timed-out / failed requests release their concurrency slot.** `app.ts`
  increments `active` and decrements it in a `finally`, so any rejection (timeout
  included) frees the slot. Covered by `security.test.ts` ("concurrency is bounded
  and capacity returns after completion", and the added "a failed or timed-out
  translation releases its concurrency slot").
- **Request/rate/concurrency limits.** 16 KB JSON body limit (`413`), compressed
  bodies rejected (`415`), fixed-window per-minute rate limit (`429` + `Retry-After`),
  and a concurrency ceiling (`503 busy`). Covered by `security.test.ts`. The rate
  limiter runs before body parsing. The 60s window reset is simple arithmetic in
  `app.ts`; the limiting behaviour is tested, the timed reset is by inspection.
- **CORS / Origin allowlist.** `config.ts` accepts only exact, comma-separated
  origins (HTTPS in production) and rejects `*`, `null`, paths, trailing slashes,
  credentials, and non-HTTPS in production. Covered by `config.test.ts`. The
  server also enforces an explicit Origin allowlist on `/api` (`403 origin_denied`),
  tested in `security.test.ts` and `scripts/smoke.mjs`.
- **Single-service production startup.** `scripts/smoke.mjs` boots the real server
  with `NODE_ENV=production SERVE_FRONTEND=true`, then asserts: `/api/health` 200,
  HTML + hashed assets served, SPA refresh (`/conversation` → 200), `404` for
  missing assets and unknown `/api/*`, the identity route, Origin allow/deny,
  security headers, and that no localhost API URL leaks into the production bundle.
- **Native TypeScript execution with runtime-only deps.** The server runs
  `node src/index.ts` (Node 24 type stripping; `erasableSyntaxOnly` enforced), so
  `npm --prefix server ci --omit=dev` is sufficient at runtime (only `express`,
  `cors`). The frontend build is produced separately by `npm run build:deploy`.
- **Lint, type checks, both test suites, production build** all pass
  (`npm run check`).

## What was NOT verified (and cannot be here)

- Public HTTPS behaviour on Render (TLS termination, real `PORT`/host binding).
- Live external translation (MyMemory/Google) — no external request is made by
  tests or the smoke script.
- Real browser microphone / speech recognition / speech synthesis.
- **Graceful SIGTERM/SIGINT draining on Linux.** The handlers in
  `server/src/index.ts` are correct by inspection (stop accepting new connections
  via `server.close`, 25s force-close deadline), but Windows terminates the child
  directly, so the smoke script does not assert the graceful exit code — this
  needs a Linux check on the deployed host.

## Render settings (single web service, frontend + `/api`)

| Setting | Value |
|---|---|
| Runtime | Node (`.node-version` = `24`; `engines` requires `>=24.13.1 <25`, npm `>=11 <12`) |
| Root directory | repository root |
| Build command | `npm run build:deploy` |
| Start command | `npm start` |
| Health check path | `/api/health` |

### Environment variables

| Key | Set by | Value |
|---|---|---|
| `NODE_ENV` | you / `render.yaml` | `production` |
| `SERVE_FRONTEND` | you / `render.yaml` | `true` |
| `VITE_API_BASE_URL` | you / `render.yaml` | `/api` (build-time; same origin) |
| `TRANSLATION_PROVIDER` | you / `render.yaml` | `mymemory` |
| `CORS_ORIGIN` | **you (dashboard, `sync:false`)** | the exact HTTPS origin Render assigns, e.g. `https://say-it-anyway.onrender.com` — no path/trailing slash |
| `PORT` | Render | provided automatically; do not hardcode |
| `MYMEMORY_EMAIL` | optional | raises the free daily quota |

Same-origin note: a browser does not require CORS for same-origin calls, but this
server still enforces an Origin allowlist as defense-in-depth, and `config.ts`
fails startup in production if `CORS_ORIGIN` is unset. So for the single-service
deploy you must set `CORS_ORIGIN` to the service's own public origin.

## Known risks / limitations (not defects)

- **Render Free** services cold-start after inactivity; the first request is slow.
- The rate limiter is a per-process fixed window; a burst straddling the window
  boundary can briefly allow up to 2× the limit. Acceptable for this app.
- During shutdown draining, existing keep-alive connections may still issue
  requests until they close (bounded by `keepAliveTimeout` and the force-close
  deadline); new connections are refused by `server.close`.
- `.node-version` floats to the latest `24.x`; keep it at or above `24.13.1`.
