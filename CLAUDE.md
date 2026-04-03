# CLAUDE.md

See @README.md for project overview and @package.json for available scripts.

---

## Commands

```bash
# Dev
pnpm dev                           # api + frontend with hot reload
docker compose up postgres -d      # database only

# Database
pnpm --filter api db:generate      # generate migration after schema change
pnpm --filter api db:migrate       # apply pending migrations
pnpm --filter api db:studio        # Drizzle Studio at localhost:4983

# Tests
pnpm --filter api test             # unit tests
pnpm --filter api test:coverage    # unit tests + coverage
pnpm --filter frontend test:e2e    # Playwright E2E
pnpm --filter frontend test:e2e:ui # Playwright UI mode (visual)

# Quality
pnpm lint                          # Biome check
pnpm lint:fix                      # Biome autofix
pnpm --filter api tsc --noEmit     # TypeScript type check

# Docker
docker compose up -d --build       # full stack
docker compose down -v             # stop + wipe volumes (full reset)
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d  # with pgAdmin
```

---

## Architecture

```
apps/api/src/
  routes/      # Fastify plugins — orchestration only, no business logic
  services/    # All business logic lives here
  db/          # Drizzle client + schema.ts (single source of truth)
  middleware/  # JWT preHandler auth hook

apps/frontend/src/
  app/         # Next.js App Router pages
  components/  # shadcn/ui + custom components
  lib/         # API client + SSE streaming helper

packages/shared/  # Zod schemas shared between api and frontend
```

---

## Non-negotiable rules

### Before implementing anything

- Search the codebase for similar existing code before writing new code
- If a Zod schema already exists in `packages/shared`, use it — never duplicate
- If a service function already does this, extend it — never copy-paste

### Challenge requests that seem wrong

If a request would introduce an antipattern, name it explicitly before offering an alternative. Do not silently implement something questionable. Say: _"This would introduce [X problem]. Here's a better approach: ..."_

Antipatterns to always flag:

- Business logic in a route handler (belongs in `services/`)
- N+1 queries — fetching in a loop instead of one query with IN or a join
- `any` type — use `unknown` and narrow it, or define a proper type
- Swallowing errors silently in a catch block
- Raw SQL when Drizzle already models the table
- `useEffect` + `fetch` for data fetching — use TanStack Query
- New `'use client'` without a real reason — Server Components are the default

### Security — always check

- Every route touching user data must have the JWT `preHandler` hook — verify this before finishing
- Never return `passwordHash` in any response — always explicitly exclude it from selects
- Use the existing `encrypt()`/`decrypt()` in `services/encryption.ts` — never reimplement AES
- Never log decrypted values, tokens, passwords, or API keys
- Every request body, query param, and route param must have a Zod schema via `@fastify/type-provider-zod`

### GDPR

- Never log PII — no emails, activity content, or chat messages in logs
- Strava tokens and API keys are always stored encrypted — never plaintext even temporarily
- Do not send `rawData` jsonb to the Claude API — extract only the fields needed for context
- If a new flow sends user data somewhere external, flag it before implementing

### Testing

- Every new service function or utility gets a unit test
- Every bug fix gets a regression test first — write the failing test, then fix, then confirm it passes
- Prefer unit tests for service/utility bugs, E2E tests for user flow bugs
- Tests go in `apps/api/src/**/*.test.ts` (Vitest) or `apps/frontend/e2e/**/*.spec.ts` (Playwright)

### Database

- Never write migrations by hand — change `schema.ts` then run `drizzle-kit generate`
- Use `db.transaction()` for operations that must be atomic
- Always use parameterised queries — never interpolate user input into SQL

---

## When context gets long

When compacting, always preserve:

- The full list of modified files
- Any failing test output
- Current migration state
- Decisions made about approach (especially if we rejected an alternative)

---

## Subagents

Use subagents for:

- Security review: _"Use a subagent to review this for security issues"_
- Codebase investigation: _"Use a subagent to find all places that call encrypt() and verify they use the service correctly"_
- Code review after implementing: _"Use a subagent to review this for edge cases and antipatterns"_
