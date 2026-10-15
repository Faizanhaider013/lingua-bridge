# Say It Anyway

A shared-device conversation app for two people who speak different languages.
React, TypeScript, Vite and Tailwind provide the editorial UI; Express translates
through MyMemory by default, without a required account or key.

- 15 languages, native labels, Arabic/Urdu right-to-left rendering.
- Typed messages, original/translated text, recoverable failure and Retry.
- Optional browser dictation, review before sending, translated speech when a
  matching voice exists, Stop and Interrupt controls.
- No saved conversation database, login or multi-device transport. A session ID
  identifies this tab's conversation; it is not a shareable room or access token.

See [design notes](REDESIGN.md) and [deployment audit](DEPLOYMENT_AUDIT.md).
No public deployment has been performed or verified.

## Prerequisites

Use **Node.js 24 LTS, at least 24.13.1 and below 25**, and **npm 11**.
Validation was performed with Node 24.13.1 and npm 11.8.0. `.node-version` selects
24 on Render; use the latest patched 24.x runtime for deployment. `packageManager`
records npm 11.8.0; npm 11 is the supported package-manager major.

The server runs erasable TypeScript directly using Node's native type stripping.
Node 20 is not supported. Type stripping does not type-check; run the checks below.
Both package-lock.json files are required. No global Vite, ts-node or TypeScript
installation is needed. [Node TypeScript documentation](https://nodejs.org/api/typescript.html).

## Clean installation and development

From the repository root:

```sh
npm run setup
npm run dev:all
```

`setup` runs `npm ci --include=dev` in both packages using their lockfiles. Stop
running development/test processes before reinstalling; Windows can lock native
Vite binaries. `dev:all` starts both processes and stops them together. Open
http://localhost:5173. Vite proxies `/api` to http://localhost:8787. Port 5173 is
fixed so the default development origin allowlist stays correct.

Existing individual commands still work in separate terminals:

```sh
npm run dev
npm --prefix server run dev
```

No environment files are required locally. For overrides, copy `.env.example` to
`.env.local` and `server/.env.example` to `server/.env`. Restart after changing
backend settings; rebuild after changing production frontend settings.

## Commands

| Command from root | Purpose |
| --- | --- |
| `npm run setup` | Clean install both packages from lockfiles |
| `npm run dev:all` | Frontend plus watched backend |
| `npm test` | Frontend tests |
| `npm --prefix server test` | Backend tests |
| `npm run test:all` | Both suites |
| `npm run lint` | Repository lint |
| `npm run typecheck` | Frontend and backend checks |
| `npm run build` | Type-check frontend and build `dist/` |
| `npm run check` | Lint, both type checks, both test suites, frontend build |
| `npm run smoke` | Start production server locally; verify assets, routes, health and API |
| `npm start` | Start backend; serve built frontend when `SERVE_FRONTEND=true` |
| `npm run build:deploy` | Clean build dependencies, production-only backend dependencies, build frontend |

Smoke checks use the real server and same-language identity route, without sending
text to an external provider. They do not prove live translation or speech works.
On Windows the child is terminated by the OS; graceful SIGTERM draining still
needs a Linux/hosting check. The backend has no compilation/build step.

## Recommended deployment: one Render web service

Express serves `dist/` and `/api` on one HTTPS origin. This avoids a second service,
CORS coordination between platforms and a second deployment. No database or Docker
is needed. Render terminates HTTPS and forwards to the server bound to `0.0.0.0`
and its supplied `PORT`. [Render web services](https://render.com/docs/web-services).

**These are manual deployment steps, not actions already performed:**

1. Review the changes and put the project in your Git repository. Commit both
   package files, both lockfiles, `.node-version`, `render.yaml`, scripts and source.
   Do not commit environment files. The supplied local folder had no `.git`, so
   this audit could not verify history or make a repository commit.
2. In Render, choose **New > Web Service**, connect that repository, choose Node,
   and leave Root Directory empty (repository root).
3. Set Build Command to `npm run build:deploy`, Start Command to `npm start`, and
   Health Check Path to `/api/health`. Set the environment values below. The
   supplied `render.yaml` describes the same setup for an optional Blueprint.
4. Set `CORS_ORIGIN` to the exact HTTPS origin Render assigns this service, with
   no trailing slash. Select Free only if its limits are suitable. Creating the
   service starts a deployment; review all configuration and plan details first.
   No paid plan has been selected by this audit.
5. Deploy after your approval. Once ready, open `/api/health` and the app URL.
   Send a short English-to-Spanish message and reverse direction. Reload the page,
   test mobile, mic permissions, Stop, Interrupt, missing voices and failed Retry.
6. If adding a custom domain, configure DNS/TLS in Render and add its exact HTTPS
   origin to `CORS_ORIGIN`. Keep the Render origin only if you intend to use it.

| Variable | Where | Recommended value / meaning |
| --- | --- | --- |
| `NODE_ENV` | Render runtime/build | `production` |
| `SERVE_FRONTEND` | Backend runtime | `true` for the combined service; `false` for API-only |
| `VITE_API_BASE_URL` | Frontend build | `/api` for one service; public HTTPS backend URL ending in `/api` for split hosting |
| `PORT` | Backend runtime | Provided by Render; do not hardcode. Local fallback is `8787` |
| `CORS_ORIGIN` | Backend runtime | Required in production: comma-separated exact HTTPS frontend origins, no paths, wildcard or trailing slash |
| `TRANSLATION_PROVIDER` | Backend runtime | `mymemory` (default) |
| `TRANSLATE_TIMEOUT_MS` | Backend runtime, optional | Default 10000, maximum 10000 per chunk |
| `MAX_TEXT_LENGTH` | Backend runtime, optional | Default 2000 UTF-16 code units; body/chunk caps still apply |
| `MAX_CONCURRENT_TRANSLATIONS` | Backend runtime, optional | Default 4, maximum 20, shared by all callers |
| `REQUESTS_PER_MINUTE` | Backend runtime, optional | Default 30, maximum 300, shared by all callers |
| `MYMEMORY_EMAIL` | Backend runtime, optional | Your real contact email; provider may grant a higher allowance |
| `MYMEMORY_API_KEY` | Backend secret, optional | Existing optional MyMemory credential; not needed for anonymous use |
| `GOOGLE_TRANSLATE_API_KEY` | Backend secret, optional | Only for the existing paid `google` provider if explicitly selected |
| `VITE_DEV_API_PROXY` | Local Vite configuration only | Optional local proxy target; not used in production |

All `VITE_*` values are public. Never put API keys, tokens or credentials there.
Production builds reject local/insecure absolute API URLs. Missing/blank API config
uses same-origin `/api`, which is appropriate only when the API is served there.
Use `.node-version`/bounded engines instead of relying on a host's changing default.
[Render Node version selection](https://render.com/docs/node-version).

## Optional split hosting: Vercel frontend, Render API

The combined service above is preferred. If you deliberately choose separate hosts:

- Render: same repository/root, Build Command `npm --prefix server ci --omit=dev`,
  Start Command `npm start`, Health Check `/api/health`, `NODE_ENV=production`,
  `SERVE_FRONTEND=false`, `TRANSLATION_PROVIDER=mymemory`. Let Render supply PORT.
- Vercel: Vite project, root directory empty, Install Command `npm ci --include=dev`,
  Build Command `npm run build`, Output Directory `dist`, Node 24.x.
  Set `VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com/api` before building.
- Set backend `CORS_ORIGIN=https://YOUR-FRONTEND.vercel.app` (your actual production
  URL). Add preview origins individually only if wanted; no wildcard. Redeploy
  frontend after any API URL change and backend after any allowlist change.
- The app currently has only the `/` page and no client router. Root refresh works
  as a static index. If adding client routes later, configure Vercel SPA rewrites;
  don't rewrite API requests to HTML. The combined Express host already supports
  document-navigation fallback and keeps missing assets/API endpoints as 404s.

## Translation limits and failure behavior

MyMemory remains the free default. No key or account is mandatory. It is a shared,
quota-limited external dependency, not an unlimited production SLA. Previous
provider guidance was roughly 5,000 characters/day anonymously and 50,000 with a
contact email; confirm current terms before public use at the official
[usage limits](https://mymemory.translated.net/doc/usagelimits.php) and
[API specification](https://mymemory.translated.net/doc/spec.php). Those pages could
not be retrieved during this audit, so these figures were not reverified.
Hosted services can share outbound IPs, which may affect available quota.

MyMemory queries are split into at most 25 chunks of 500 UTF-8 bytes, with at most
3 chunks active per message. Order is preserved; any chunk failure rejects the
whole message and cancels siblings. Blank results, warnings and quota errors are
not displayed as successful translations. No automatic translation retries run.
The user keeps the original and explicitly chooses Retry. Chunk boundaries can
reduce translation context; verify important meaning with the other participant.

The server limits uncompressed JSON to 16KiB, bounds concurrent translations and
requests per minute, cancels disconnected work, and applies a 30-second overall
translation deadline. The browser waits at most 35 seconds for translation and
5 seconds for health. Health checking polls every 15 seconds but uses no provider
quota. Health indicates server/config readiness, not live provider availability.

Rate/concurrency limits are in-memory and per process: they reset on restart,
are shared by legitimate visitors, and do not aggregate across replicas. CORS is
not authentication and can be bypassed by non-browser callers. These controls
reduce bursts but cannot guarantee protection against quota exhaustion or abuse.
Use one instance initially and evaluate host-level protection before broader use.

## Browser voice and privacy

Typing works without speech support. Microphone use requires localhost or HTTPS,
a compatible browser, explicit user action and permission. Recognition-language
support varies, and cannot be inferred from the 15 translation choices. Missing
microphones, blocked permissions, insecure contexts and unsupported recognition
have typed-input fallbacks.

Spoken output uses actual installed browser/OS voices; Hindi/Arabic vary and Urdu
may be unavailable. Dictation is reviewed before sending. Voice-origin messages
play their translation when possible; typed translations play on demand. Browser
policies may restrict automatic speech. Test on target browsers/devices.

Messages live in this tab's React state and are cleared on reload/session end.
The application has no conversation database or message logging. Text is sent to
our backend and the selected translation provider (MyMemory by default). Browser
speech recognition may send audio to a third-party speech service, and some voices
may use network services. Google Fonts receives font requests. Hosting and
providers may retain their own logs under their own policies. There is no claim
of end-to-end encryption, wholly on-device processing or regulatory compliance.
Avoid entering sensitive information you do not want sent to those services.

## Troubleshooting

- **npm ci EPERM on Windows:** stop this project's running Vite/test processes,
  then rerun setup. OneDrive/antivirus can also temporarily lock files.
- **Unknown .ts extension / syntax error:** use supported Node 24, not Node 20.
- **Frontend build missing:** run `npm run build` before starting with
  `SERVE_FRONTEND=true`. The server fails startup rather than returning a broken UI.
- **Production startup rejects CORS_ORIGIN:** supply exact HTTPS origins, without
  a path or trailing slash. A wildcard is intentionally refused.
- **Port 5173 in use:** stop the other local preview or deliberately adjust Vite's
  port and the backend origin allowlist together.
- **Translation offline:** check `/api/health`, backend logs and build-time API URL.
  On split hosting also verify the frontend's exact origin is allowed. A provider
  outage may occur while health is still OK; inspect the message's error.
- **Cold start:** Render Free services can spin down after inactivity. Initial
  requests may time out; wait for the service, then retry the failed message.
  See [Render Free limitations](https://render.com/docs/free). Free hosting is not
  suitable for guaranteed always-on availability.
- **429 or busy:** wait before manually retrying. Increasing local request limits
  does not increase MyMemory's quota.
- **No spoken output:** inspect each participant's voice availability and install
  an OS voice if available; read/type otherwise. Do not repeatedly request mic
  permission to solve a missing output voice.

Before sharing a public URL, verify the deployed HTTPS page on desktop and mobile,
translate both directions, test Arabic/Urdu, denial of microphone access, unavailable
voices, interruption, reset during an in-flight request, failure/retry and reload.
