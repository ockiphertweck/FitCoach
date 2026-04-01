# FitCoach

A self-hosted, open-source AI training coach. Connects to Strava via OAuth 2.0 and real-time webhooks, stores all athlete data locally in PostgreSQL, and uses the Anthropic Claude API (bring-your-own-key) to deliver personalised rest/train recommendations, an interactive coaching chat, and weekly training trend reports — all rendered as streaming markdown in the browser.

---

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [System Architecture](#system-architecture)
3. [Monorepo Structure](#monorepo-structure)
4. [Tech Stack & Design Decisions](#tech-stack--design-decisions)
5. [Data Model](#data-model)
6. [API Reference](#api-reference)
7. [AI & Training Science](#ai--training-science)
8. [Security Design](#security-design)
9. [Authentication Flow](#authentication-flow)
10. [Strava Integration](#strava-integration)
11. [Observability](#observability)
12. [Prerequisites](#prerequisites)
13. [Quickstart](#quickstart)
14. [Environment Variables](#environment-variables)
15. [Local Development](#local-development)
16. [Database Migrations](#database-migrations)
17. [Running Tests](#running-tests)

---

## Feature Overview

| Feature                       | Details                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Activities**                | Paginated, filterable list of all Strava activities synced automatically via webhook                            |
| **AI Recommendation**         | One-click "train or rest today?" answer, streamed in real time from Claude                                      |
| **AI Coach Chat**             | Persistent multi-turn conversation with Claude, aware of recent activities and training load                    |
| **Weekly Reports**            | AI-generated weekly summary with distance, duration, HR, and training load metrics                              |
| **Analytics**                 | Interactive Recharts graphs — weekly distance, duration, and heart-rate trends                                  |
| **Training Load**             | ATL / CTL / TSB computed from TRIMP (see [AI & Training Science](#ai--training-science))                        |
| **Self-hosted**               | All data stays on your machine; no activity data leaves your server                                             |
| **BYOK (Bring Your Own Key)** | Claude API key stored AES-256-GCM encrypted in Postgres; can be entered via the Settings UI without redeploying |
| **Single-user**               | Designed for personal use; the first account registered locks the instance                                      |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              docker compose                              │
│                                                                          │
│  ┌────────────────┐   HTTP/SSE   ┌─────────────────┐   SQL (postgres)  │
│  │   Frontend     │ ──────────▶  │      API         │ ────────────────▶ │
│  │  Next.js 15    │              │  Fastify v5      │  ┌─────────────┐  │
│  │  React 19      │ ◀── stream ─ │  Zod + Drizzle   │  │ PostgreSQL  │  │
│  │  port 3001     │              │  port 3000       │  │ pg16 +      │  │
│  └────────────────┘              └────────┬─────────┘  │ pgvector    │  │
│                                           │             └─────────────┘  │
│                                ┌──────────┴──────────┐                   │
│                                ▼                     ▼                   │
│                       ┌──────────────┐     ┌──────────────┐             │
│                       │  Strava API  │     │  Claude API  │             │
│                       │  OAuth 2.0   │     │  (BYOK)      │             │
│                       │  Webhooks    │     │  Streaming   │             │
│                       └──────────────┘     └──────────────┘             │
│                                                                          │
│  (optional dev overlay)                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Tailscale container (network_mode: service:api)                 │   │
│  │  Exposes https://fitcoach-dev.<tailnet>.ts.net → API port 3000   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Request lifecycle (AI stream)**

1. Browser `POST /ai/recommendation` with credentials cookie.
2. API middleware validates the JWT, resolves the user's encrypted Claude key, decrypts it with AES-256-GCM.
3. API queries Postgres for the last 42 days of activities, computes ATL/CTL/TSB, and builds a structured training-context prompt.
4. API opens an Anthropic streaming request and immediately begins forwarding `data:` Server-Sent Events (SSE) chunks on the same HTTP response.
5. Frontend reads the SSE stream via `ReadableStream`, appending each delta to React state for live rendering by `react-markdown`.
6. After the stream ends, the API writes the full response + token counts to `chat_history` (fire-and-forget).

---

## Monorepo Structure

```
fitcoach/
├── apps/
│   ├── api/               # Fastify REST + SSE API
│   │   ├── src/
│   │   │   ├── db/        # Drizzle ORM client & schema
│   │   │   ├── middleware/ # JWT auth hook
│   │   │   ├── routes/    # activities · ai · auth · settings · strava
│   │   │   └── services/  # ai-context · atl-ctl · encryption · strava-client
│   │   └── drizzle/       # SQL migration files
│   └── frontend/          # Next.js 15 App Router
│       └── src/
│           ├── app/       # Route segments: activities · analytics · coach · settings · setup
│           ├── components/ # UI primitives (shadcn/ui) + layout
│           └── lib/       # Typed API client + SSE streaming helper
├── packages/
│   └── shared/            # Zod schemas shared between API and frontend
├── db/
│   └── init.sql           # pgvector / pgcrypto extension bootstrap
├── docker-compose.yml     # Production-like compose stack
├── docker-compose.override.yml  # Dev Tailscale Funnel overlay
└── biome.json             # Lint + format config (replaces ESLint + Prettier)
```

The `packages/shared` workspace package publishes Zod schemas and TypeScript types that are imported directly by both `apps/api` and `apps/frontend`, enforcing a single source of truth for the activity data shape across the network boundary without any code generation step.

---

## Tech Stack & Design Decisions

### Backend — Fastify v5

**Why Fastify over Express?** Fastify provides schema-first request validation via its built-in JSON Schema plugin, first-class TypeScript support, and measurably lower latency. Version 5 uses native `async/await` throughout and drops legacy callback-based lifecycle hooks.

`fastify-type-provider-zod` bridges Fastify's schema system with Zod, so the same validators that define the TypeScript types also validate incoming JSON at runtime — no duplication.

### Database — PostgreSQL 16 + Drizzle ORM

**Why Drizzle over Prisma?** Drizzle generates SQL from TypeScript definitions without a separate schema language, ships zero runtime overhead (it is just a query builder that returns plain SQL strings), and produces type-safe result objects without a code-generation step. The schema lives in `apps/api/src/db/schema.ts` and is the single source of truth — Drizzle Kit infers migrations from it.

`pgvector` is included in the Postgres image for potential future semantic search over activity descriptions. `pgcrypto` is bootstrapped via `db/init.sql`.

### Frontend — Next.js 15 App Router + React 19

The App Router enables React Server Components by default. The coach page, activities list, and analytics are all **Client Components** (`"use client"`) because they need real-time state updates (SSE streaming, pagination, chart interaction). Pages that are entirely static — like the login and setup forms — don't include a directive and render on the server by default.

**TanStack Query** manages server-state caching. Every API call is wrapped in a `useQuery` or `useMutation` hook so the UI automatically re-renders on data change and benefits from background refetching and stale-while-revalidate without custom loading state management.

**shadcn/ui** (`@radix-ui/*` primitives + Tailwind CSS) provides accessible, unstyled component foundations. Components are copied into `src/components/ui/` and owned by the project, which means they can be customised freely without fighting a third-party design system.

**Recharts** renders the analytics charts server-side compatible (no canvas dependency) and is tree-shakeable by each chart type.

### Monorepo tooling — pnpm workspaces + Biome

`pnpm` workspaces link `packages/shared` to both app packages as `workspace:*`, so a single `pnpm install` at the root wires everything up. The `--filter` flag in root scripts (`pnpm --filter api dev`) runs sub-package scripts without `cd`-ing into subdirectories.

**Biome** replaces both ESLint and Prettier with a single Rust-based tool that is significantly faster and has zero configuration conflicts between the two tools. One `biome.json` in the root applies to all packages.

### Type safety — Zod everywhere

All environment variables are validated with `@t3-oss/env-core` + Zod at startup (`apps/api/src/env.ts`). The process exits immediately if a required variable is missing or malformed, rather than failing at first use. The same Zod schemas in `packages/shared` are used for API response validation on the frontend.

### Streaming (SSE over HTTP/1.1)

The AI recommendation and chat endpoints use **Server-Sent Events** rather than WebSockets because:

- SSE is unidirectional (server → client), which matches the LLM streaming pattern exactly.
- It works over plain HTTP/1.1 and through most proxies without upgrade negotiation.
- The `fetch` + `ReadableStream` SSE client in `apps/frontend/src/lib/api.ts` (`streamPost`) is ~40 lines with no external dependencies.

The API sets `X-Accel-Buffering: no` to disable nginx/proxy response buffering when deployed behind a reverse proxy.

---

## Data Model

```
users
├── id            uuid PK
├── email         text UNIQUE
├── passwordHash  text
└── createdAt     timestamp

apiKeys
├── id            uuid PK
├── userId        → users.id (cascade delete)
├── provider      text          ("anthropic", etc.)
├── encryptedKey  text          (AES-256-GCM ciphertext)
└── UNIQUE (userId, provider)

stravaTokens
├── id            uuid PK
├── userId        → users.id (cascade delete)
├── accessToken   text          (AES-256-GCM encrypted)
├── refreshToken  text          (AES-256-GCM encrypted)
├── expiresAt     timestamp
├── athleteId     bigint        (Strava athlete ID for webhook routing)
└── UNIQUE (userId)

activities
├── id            uuid PK
├── userId        → users.id (cascade delete)
├── externalId    text          (Strava activity ID)
├── source        text          default "strava"
├── sportType     text          (Run, Ride, Swim, …)
├── startDate     timestamp
├── durationSeconds, distanceMeters, elevationMeters
├── averageHeartRate, maxHeartRate
├── averagePaceSecondsPerKm
├── sufferScore, perceivedExertion (RPE 1–10), calories
├── rawData       jsonb         (full Strava payload preserved)
└── UNIQUE (userId, externalId, source)

chatHistory
├── id            uuid PK
├── userId        → users.id (cascade delete)
├── role          text          ("user" | "assistant")
├── content       text
├── tokensUsed    int
└── createdAt     timestamp

weeklyReports
├── id            uuid PK
├── userId        → users.id (cascade delete)
├── weekStart     date
├── summary       text          (AI-generated markdown)
├── metrics       jsonb         (distance, duration, avgHR, sessions, atl, ctl)
└── UNIQUE (userId, weekStart)
```

**Design notes:**

- The `rawData jsonb` column on `activities` stores the complete Strava API response. This means new fields can be surfaced in the UI without a schema migration — the normalised columns exist for querying and indexing, but no data is discarded.
- OAuth tokens (Strava access + refresh) and user-supplied API keys are **always** stored encrypted. The encryption key is never stored in the database; it exists only as an environment variable.
- `UNIQUE (userId, externalId, source)` on activities enables safe upsert semantics: both the initial OAuth sync and every subsequent webhook event use `INSERT … ON CONFLICT DO UPDATE`.

---

## API Reference

All routes except `/auth/*` and the public Strava webhook endpoint require a valid `fitcoach_token` HTTP-only cookie.

### Auth

| Method | Path           | Description                                                                                    |
| ------ | -------------- | ---------------------------------------------------------------------------------------------- |
| `GET`  | `/auth/status` | Returns `{ setup: boolean }` — tells the frontend whether first-run account creation is needed |
| `POST` | `/auth/setup`  | Creates the single user account; sets the session cookie                                       |
| `POST` | `/auth/login`  | Validates email/password; sets the session cookie                                              |
| `POST` | `/auth/logout` | Clears the session cookie                                                                      |
| `GET`  | `/auth/me`     | Returns the authenticated user's id and email                                                  |

### Activities

| Method | Path                | Query params                             | Description                                       |
| ------ | ------------------- | ---------------------------------------- | ------------------------------------------------- |
| `GET`  | `/activities`       | `limit`, `offset`, `sport`, `from`, `to` | Paginated, filterable activity list               |
| `GET`  | `/activities/stats` | —                                        | Returns current `{ atl, ctl, tsb }` training load |
| `GET`  | `/activities/:id`   | —                                        | Single activity detail                            |

### AI

| Method   | Path                 | Description                                                                                    |
| -------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `POST`   | `/ai/recommendation` | Streams a "train or rest today?" recommendation as SSE                                         |
| `POST`   | `/ai/chat`           | Streams a chat reply as SSE; saves both the user message and assistant reply to `chat_history` |
| `GET`    | `/ai/chat/history`   | Returns stored chat messages                                                                   |
| `DELETE` | `/ai/chat/history`   | Clears all chat history for the user                                                           |
| `POST`   | `/ai/weekly-report`  | Generates (or returns cached) a weekly report for the current week                             |
| `GET`    | `/ai/weekly-reports` | Lists all past weekly reports                                                                  |

### Strava

| Method   | Path                 | Description                                                                                             |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `GET`    | `/strava/webhook`    | Webhook verification handshake (public, used by Strava during subscription setup)                       |
| `POST`   | `/strava/webhook`    | Receives real-time activity events from Strava (public); 200 acknowledged immediately, processing async |
| `GET`    | `/strava/auth-url`   | Returns the OAuth 2.0 authorisation URL to redirect the user to Strava                                  |
| `GET`    | `/strava/callback`   | Handles the OAuth redirect, exchanges code for tokens, runs initial activity backfill                   |
| `GET`    | `/strava/status`     | Returns whether Strava is connected for the current user                                                |
| `DELETE` | `/strava/disconnect` | Revokes and deletes stored tokens                                                                       |

### Settings

| Method   | Path                         | Description                                                      |
| -------- | ---------------------------- | ---------------------------------------------------------------- |
| `GET`    | `/settings/apikey`           | Lists which API key providers have been configured               |
| `POST`   | `/settings/apikey`           | Stores (or updates) an API key for a provider, encrypted at rest |
| `DELETE` | `/settings/apikey/:provider` | Removes an API key                                               |

---

## AI & Training Science

### Training Load — ATL / CTL / TSB (TRIMP)

FitCoach models training load using concepts from **Training Impulse (TRIMP)** theory, the methodology behind platforms like TrainingPeaks.

**Session load** is computed per activity:

```
sessionLoad = durationHours × intensity
```

where `intensity` is (in priority order):

1. **RPE** (Perceived Exertion, 1–10) if the user logged it
2. **Average heart rate ÷ 10** if available from Strava
3. **5** (neutral default) if neither is present

**ATL and CTL** are Exponentially Weighted Moving Averages (EWMA) of daily load:

| Metric                            | Window    | Alpha (EWMA weight)    | Meaning            |
| --------------------------------- | --------- | ---------------------- | ------------------ |
| **ATL** — Acute Training Load     | 7 days    | 2 ÷ (7+1) = **0.25**   | Short-term fatigue |
| **CTL** — Chronic Training Load   | 42 days   | 2 ÷ (42+1) ≈ **0.046** | Long-term fitness  |
| **TSB** — Training Stress Balance | CTL − ATL | —                      | Form / freshness   |

The 42-day history is walked day-by-day (not activity-by-activity) so rest days correctly decay both averages. A TSB > +5 indicates the athlete is fresh; TSB < −10 indicates accumulating fatigue.

### AI Prompt Construction

Before each Claude request, `buildRecommendationContext()` assembles a structured markdown document containing:

- Today's date
- Current ATL, CTL, TSB with a plain-language freshness label
- Every activity from the last 14 days (date, type, duration, distance, avg HR, pace, RPE)
- The last 3 coaching chat messages (for contextual continuity)

This context is prepended to the user message and passed to Claude along with a system prompt that establishes the coaching persona. The full context is capped at ~12 000 characters (≈3 000 tokens) to keep API costs predictable.

The same approach applies to the chat endpoint: `buildChatContext()` reconstructs the full `MessageParam[]` array from `chat_history`, so Claude sees the conversation as a native multi-turn exchange rather than a summarised context injection.

---

## Security Design

### Credential Storage

All sensitive values written to the database are encrypted with **AES-256-GCM** before insertion:

- Strava `access_token` and `refresh_token`
- User-supplied API keys (Claude, etc.)

The encryption service (`apps/api/src/services/encryption.ts`) derives a fixed-length 32-byte key by SHA-256 hashing the `API_KEY_ENCRYPTION_KEY` environment variable. Each `encrypt()` call generates a fresh random 12-byte IV; the output format is `iv:authTag:ciphertext` (base64 segments joined by `:`). GCM's authentication tag ensures any tampered ciphertext is rejected at decryption time.

### Session Management

Authentication uses **JWT stored in an HTTP-only cookie** (`fitcoach_token`):

- `httpOnly: true` — inaccessible to JavaScript; prevents XSS token theft
- `secure: true` in production — transmitted only over HTTPS
- `sameSite: "lax"` — blocks cross-site POST requests (CSRF protection)
- 30-day expiry; algorithm is HS256 signed with `JWT_SECRET`

The JWT is verified on every protected request using `jose` (`jwtVerify`), not `jsonwebtoken`, because `jose` is ESM-native and works without `node:crypto` shims in edge runtimes.

### Password Hashing

Passwords are hashed with **bcrypt at cost 12** before storage. The login route compares with `bcrypt.compare()` — timing-safe by definition.

### Input Validation

Every route declares a Zod schema. `fastify-type-provider-zod` compiles these schemas into Fastify's validation pipeline, so invalid input is rejected with a 400 before the handler function is ever called. Environment variables are validated identically at startup via `@t3-oss/env-core`.

### CORS

The API only accepts credentials from the exact origin specified by `FRONTEND_URL`, preventing any other origin from making authenticated cross-origin requests.

---

## Authentication Flow

```
Browser                          API                        DB
  │                               │                          │
  │  GET /auth/status             │                          │
  │ ─────────────────────────────▶│  SELECT * FROM users     │
  │                               │ ────────────────────────▶│
  │  { setup: false }             │  []                      │
  │ ◀─────────────────────────────│ ◀────────────────────────│
  │                               │                          │
  │  (redirect to /setup)         │                          │
  │                               │                          │
  │  POST /auth/setup             │                          │
  │  { email, password }          │                          │
  │ ─────────────────────────────▶│  bcrypt.hash(pw, 12)     │
  │                               │  INSERT INTO users       │
  │                               │ ────────────────────────▶│
  │  Set-Cookie: fitcoach_token   │  sign JWT (30d)          │
  │ ◀─────────────────────────────│                          │
  │                               │                          │
  │  GET /activities (cookie)     │                          │
  │ ─────────────────────────────▶│  jwtVerify()             │
  │                               │  → req.user.sub = userId │
  │  { items: [...] }             │  SELECT from activities  │
  │ ◀─────────────────────────────│                          │
```

Subsequent requests simply present the cookie; no token refresh is required within the 30-day window.

---

## Strava Integration

### OAuth 2.0 Flow

1. User clicks "Connect Strava" → frontend calls `GET /strava/auth-url`.
2. API constructs the Strava authorisation URL with scopes `read,activity:read_all` and redirects the browser.
3. Strava redirects back to `STRAVA_REDIRECT_URI` (`/strava/callback`) with a short-lived `code`.
4. API exchanges the code for `access_token` + `refresh_token` at Strava's token endpoint, encrypts both, and persists them to `strava_tokens`.
5. API performs an initial backfill: fetches all activities from the last 90 days via the Strava Activities API and upserts them into `activities`.

### Token Refresh

Access tokens expire after 6 hours. `ensureFreshToken()` in `strava-client.ts` checks the expiry before every API call and transparently refreshes within a 5-minute buffer, updating both the encrypted access token and `expires_at` in the database.

### Webhook Events

Strava delivers `POST /strava/webhook` events when:

- A new activity is created
- An existing activity is updated

The handler acknowledges immediately with `200 OK`, then processes asynchronously to stay within Strava's 2-second acknowledgement window. Processing: look up the user by `athleteId`, fetch the full activity via the API, upsert into `activities`. This keeps the local database always in sync without polling.

**Webhook verification** (one-time setup): Strava performs a `GET /strava/webhook?hub.mode=subscribe&hub.challenge=…&hub.verify_token=…` handshake. The API responds with `{ "hub.challenge": "…" }` only if the `verify_token` matches `STRAVA_WEBHOOK_VERIFY_TOKEN`.

### Tailscale Funnel (local development)

Strava webhooks require a public HTTPS endpoint. FitCoach uses **Tailscale Funnel** instead of ngrok because:

- No third-party account or rate limits
- The Tailscale container shares the API's network namespace (`network_mode: service:api`), so the Funnel endpoint directly reaches the API process on localhost
- Auth keys can be reusable + ephemeral — no persistent daemon on the host machine

The overlay is in `docker-compose.override.yml`, which is applied automatically by `docker compose up` in development. The production `docker-compose.yml` contains no Tailscale references.

---

## Observability

FitCoach emits structured events to **PostHog** (EU instance by default) when `POSTHOG_API_KEY` is set:

| Event                     | Properties                              |
| ------------------------- | --------------------------------------- |
| `ai_recommendation`       | `userId`, `inputTokens`, `outputTokens` |
| `ai_chat`                 | `userId`, `inputTokens`, `outputTokens` |
| `weekly_report_generated` | `userId`, `weekStart`                   |

Both `posthog-node` (API) and `posthog-js` (frontend) are initialised only when the key is present, so the app runs cleanly without it.

API logs are structured JSON in production (via Fastify's built-in pino) and pretty-printed in development via `pino-pretty`.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 4.x — runs all services
- [pnpm](https://pnpm.io/installation) ≥ 9 — `npm install -g pnpm`
- [Node.js 22 LTS](https://nodejs.org/) — or `nvm use` in the repo root (`.nvmrc` not required; `engines` field in `package.json` enforces the version)

---

## Quickstart

```bash
git clone https://github.com/your-username/fitcoach
cd fitcoach
chmod +x setup.sh
./setup.sh
```

The setup script:

1. Verifies Docker and pnpm are installed
2. Copies `.env.example` → `.env` on first run — **fill in the required values and re-run**
3. Runs `docker compose up -d --build` (postgres, api, frontend)
4. Waits for PostgreSQL to pass its health check
5. Installs all pnpm workspace dependencies
6. Runs Drizzle Kit migrations (`pnpm --filter api db:migrate`)

After setup, open **http://localhost:3001** and create your account.

---

## Environment Variables

| Variable                      | Required | Description                                                                          |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `JWT_SECRET`                  | ✅       | Random secret for JWT signing — `openssl rand -base64 32`                            |
| `API_KEY_ENCRYPTION_KEY`      | ✅       | Key for AES-256-GCM encryption (≥32 chars) — `openssl rand -base64 24 \| head -c 32` |
| `DB_PASSWORD`                 | ✅       | PostgreSQL password                                                                  |
| `STRAVA_CLIENT_ID`            | ✅       | From [strava.com/settings/api](https://www.strava.com/settings/api)                  |
| `STRAVA_CLIENT_SECRET`        | ✅       | From [strava.com/settings/api](https://www.strava.com/settings/api)                  |
| `STRAVA_REDIRECT_URI`         | ✅       | Full callback URL, e.g. `http://localhost:3000/strava/callback`                      |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | optional | Any random string; required to register Strava webhooks                              |
| `CLAUDE_API_KEY`              | optional | Default Claude key; can be entered per-user in the Settings UI instead               |
| `POSTHOG_API_KEY`             | optional | From [posthog.com](https://posthog.com) — telemetry is disabled if omitted           |
| `POSTHOG_HOST`                | optional | Defaults to `https://eu.i.posthog.com`                                               |
| `FRONTEND_URL`                | optional | Defaults to `http://localhost:3001`; must match the origin in production             |
| `TS_AUTHTOKEN`                | optional | Tailscale auth key — only needed for local Strava webhook dev                        |

---

## Local Development

Running the full stack with hot-reload (outside Docker):

```bash
# Terminal 1 — start postgres only
docker compose up postgres -d

# Terminal 2 — API with tsx watch
pnpm --filter api dev

# Terminal 3 — Next.js dev server
pnpm --filter frontend dev

# Or simply run both together
pnpm dev
```

Or run everything in Docker (slower rebuilds, but matches production):

```bash
docker compose up -d --build
```

With Tailscale Funnel for local webhook development:

```bash
# Add TS_AUTHTOKEN to .env first
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

Your public Funnel URL:

```
https://fitcoach-dev.<tailnet>.ts.net
```

Register the webhook with Strava once (replace placeholders):

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://fitcoach-dev.<tailnet>.ts.net/strava/webhook \
  -F verify_token=YOUR_STRAVA_WEBHOOK_VERIFY_TOKEN
```

---

## Database Migrations

Migrations are managed by Drizzle Kit. The SQL files live in `apps/api/drizzle/`.

```bash
# Generate a new migration after editing apps/api/src/db/schema.ts
pnpm --filter api db:generate

# Apply pending migrations
pnpm --filter api db:migrate

# Open Drizzle Studio (visual DB browser)
pnpm --filter api db:studio
```

---

## Running Tests

```bash
# All packages
pnpm test

# API only (Vitest)
pnpm --filter api test

# Watch mode
pnpm --filter api test -- --watch
```

---

## Connecting Strava

1. Register an app at [strava.com/settings/api](https://www.strava.com/settings/api)
   - Set **Authorization Callback Domain** to `localhost` (dev) or your production domain
2. Copy `Client ID` and `Client Secret` into `.env`
3. Open FitCoach → **Settings** → **Connect Strava**
4. Authorise on Strava — you'll be redirected back and the last 90 days of activities will sync automatically

> **Note:** The Tailscale container hostname `fitcoach-dev` is set in `docker-compose.override.yml`. If you change it, update `tailscale/ts-serve.json` to match.

## Data privacy (DSGVO / GDPR)

FitCoach is **fully self-hosted** — all data (activities, chat history, credentials) is stored in your local PostgreSQL database. No data is stored on any external server except:

- **Claude API**: Your recent activities and chat messages are sent to Anthropic's Claude API to generate AI responses. Anthropic's [privacy policy](https://www.anthropic.com/privacy) applies.
- **PostHog**: Optional usage analytics (no personal health data) sent to PostHog EU servers.
- **Strava**: Activity data is fetched from Strava's API and stored locally.

### Deleting your data

- **Chat history**: `DELETE /ai/chat/history` or via the Settings UI
- **Activities**: Connect to the database (`docker compose exec postgres psql -U fitcoach`) and run `DELETE FROM activities;`
- **Full account deletion**: Stop containers, run `docker compose down -v` to remove all data volumes

## Development tools

- **pgAdmin** (database UI): `http://localhost:5050` — start with `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d`
- **Tailscale Funnel status**: `docker compose -f docker-compose.yml -f docker-compose.override.yml logs tailscale`
- **Drizzle Studio**: `pnpm --filter api db:studio`
