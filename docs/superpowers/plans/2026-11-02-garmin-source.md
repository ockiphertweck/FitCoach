# Garmin Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Strava with the Garmin Personal API (activities + daily recovery data), redesign the Summary around recovery, shorten the German coach recap, and widen the desktop layout.

**Architecture:** A small Garmin client (`services/garmin/*`) exchanges the owner's encrypted personal key for a cached 24h token and GETs JSON. A sync service upserts `activities` and a new `daily_wellness` table, gated to once per 15 minutes and triggered by the Summary page before the recap check. The recap gets its own short German prompt and a staleness hash that includes only *settled* recovery values. Strava code and tables are removed; old data is purged by an explicit command.

**Tech Stack:** Fastify v5 + Zod + Drizzle/Postgres (api), Next.js 15 + Tailwind + TanStack Query + recharts (frontend), Vitest, Playwright, Biome. New deps: `@garmin/fitsdk` and `fflate` (api, FIT ZIP parsing), `@mapbox/polyline` (api; already used by frontend).

**Spec:** `docs/superpowers/specs/2026-11-02-garmin-source-design.md`

## Global Constraints

- Branch `feat/garmin` (contains `feat/ui-refresh`). Commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Migrations only via `schema.ts` + `pnpm --filter api db:generate`; never hand-written.
- Every new route: JWT preHandler (`fastify.addHook("preHandler", authMiddleware)` pattern used in existing routes) and Zod for body/query/params.
- Never log the Garmin key, access token, Garmin response bodies, or any health value. Log only `{ userId, code }`.
- Garmin key stored only via `encrypt()` in `api_keys` with `provider = "garmin"`.
- `rawData` is never sent to Claude.
- Sync never calls Claude (no automatic activity insights — owner: "only on click").
- Initial import: activities **365 days**, wellness **90 days**. Incremental: activities since `lastSyncedAt − 2 days`, wellness last **3 days**. Sync gate **15 minutes** unless `force`.
- Recap: German, `max_tokens: 300`, format = `### <verdict>` line, 1–2 sentences, one line starting with `→ `; ≤ ~60 words.
- Recap hash must NOT change with today's calories, current Body Battery, today's stress or today's resting HR.
- UI labels stay English (i18n is a later project); coach output is German.
- Desktop container ~1150px at `lg`; Settings stays ~640px; phone layout unchanged.
- Tests: `pnpm test` (api unit), `pnpm lint`, `pnpm --filter frontend test:e2e` must pass at the end of every task that touches their area.

## Review Focus

1. **No sleep yet today** (watch not synced) → Sleep/HRV tiles show "—"/"No data", recap is still written from the rest, and is redone once when the night arrives. Pinned in Task 6 (prompt + hash with no today row) and Task 7 (E2E no-data tiles).
2. **Key expires or is revoked after connecting** → sync stores `key_invalid`, Summary shows a one-line notice with a Settings link, stored data and recap keep working. Pinned in Task 4 (401 → `key_invalid`, data untouched) and Task 7 (E2E notice).
3. **Dates around midnight / time zones** → wellness rows keyed by Garmin's `calendarDate` string verbatim, never via `new Date()`→UTC; activities' `startDate` from Garmin's GMT start time. Pinned in Task 3 (mapper keeps `calendarDate`; activity at 23:30 local maps to the right UTC instant).
4. **Double trigger** (two tabs, React StrictMode) → exactly one Garmin sync and one recap stream. Pinned in Task 4 (lock test) and Task 7 (E2E counts one `/garmin/sync` POST and one `/ai/recommendation` POST).
5. **Activity without GPS/HR or FIT download failing** (strength, indoor, 404) → detail page shows stats without map/charts, no error. Pinned in Task 5 (empty streams on no-record FIT and on download error).

---

### Task 1: Garmin client + probe script

**Files:**
- Create: `apps/api/src/services/garmin/client.ts`, `apps/api/src/services/garmin/client.test.ts`, `apps/api/scripts/garmin-probe.ts`
- Modify: `apps/api/package.json` (script `"garmin:probe": "tsx scripts/garmin-probe.ts"`)

**Interfaces:**
- Produces:
  - `type GarminErrorCode = "key_invalid" | "rate_limited" | "garmin_unavailable"`
  - `class GarminError extends Error { code: GarminErrorCode }`
  - `GARMIN_TOKEN_URL = "https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token"`
  - `GARMIN_API_BASE: string` — take the base URL the official client uses (read `github.com/garmin/connect-personal-api-python` source; record it in a one-line comment with the source file).
  - `exchangeKey(key: string): Promise<{ accessToken: string; expiresAt: Date; keyExpiresAt: Date | null }>` — `POST` with `Authorization: ApiKey <key>`; `keyExpiresAt` only if the response carries it, else null.
  - `createGarminClient(key: string): { get<T>(path: string, params?: Record<string, string | number>): Promise<T>; getBytes(path: string): Promise<Uint8Array> }` — token cached in a module-level `Map` keyed by sha256(key), reused until 1h before `expiresAt`; on a 401 from an API call, drops the cached token, re-exchanges once, retries once.
  - `clearGarminTokenCache(): void` (tests).

- [ ] **Step 1: Write failing tests** (`fetch` mocked with `vi.stubGlobal`):
  - `exchangeKey sends ApiKey header and returns token + expiry`
  - `exchangeKey maps 401 and 403 to GarminError code "key_invalid"`
  - `get maps 429 to "rate_limited" and 5xx / network error to "garmin_unavailable"`
  - `get reuses the cached token for a second call (token endpoint called once)`
  - `get re-exchanges after token is within 1h of expiry`
  - `get retries once after a 401 with a fresh token`
  - `error messages never contain the key or token` (assert `String(err)` excludes both).
- [ ] **Step 2:** `pnpm --filter api test -- garmin/client` → FAIL (module missing).
- [ ] **Step 3:** Implement `client.ts`.
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5: Probe script** `scripts/garmin-probe.ts`: reads `GARMIN_API_KEY` via the existing dotenv load (import `../src/env.js` is NOT used — it would require all app env vars; call `dotenv.config({ path: <repo>/.env })` directly), calls with the client: activity search (last 30 days, limit 5), `activity/{firstId}`, `download-service/files/activity/{firstId}` (print byte length and ZIP entry names via `fflate.unzipSync`), `dailySleep?date=<yesterday>`, `dailySleepSummariesByDate` (last 7 days), `hrv/{yesterday}`, `hrv/daily/{7d}`, `bodyBattery/reports/daily` (7d), `stats/stress/daily/{7d}`, `v2/dailysummaries` (7d), plus the token response. For each prints HTTP status, rate-limit-looking headers, and the **shape only**: a recursive key→type tree (`string`/`number`/`boolean`/`null`/`array<…>`), arrays summarised by their first element. **No values are printed.** Exits non-zero with a clear message if `GARMIN_API_KEY` is unset.
- [ ] **Step 6:** Add `fflate` and `@garmin/fitsdk` to api dependencies (`pnpm --filter api add fflate @garmin/fitsdk`). `pnpm lint` clean.
- [ ] **Step 7: Commit** `feat(api): Garmin personal API client and shape probe`

### Task 2: Remove Strava, new schema, purge command

**Files:**
- Delete: `apps/api/src/routes/strava.ts`, `apps/api/src/services/strava-client.ts`, `apps/api/src/services/strava-client.test.ts`
- Create: `apps/api/src/services/streams.ts` + `streams.test.ts`, `apps/api/src/services/purge.ts` + `purge.test.ts`, `apps/api/scripts/purge-legacy-data.ts`
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/index.ts`, `apps/api/src/env.ts`, `apps/api/src/routes/activities.ts` (streams route: drop the Strava-only branch; return stored `streamData` or `{ points: [], hrZones: null, maxHrUsed: null, polyline: null }` until Task 5), `packages/shared/src/index.ts` (`source` default `"garmin"`), `.env.example`, `docker-compose.override.yml` (remove `tailscale` service + volume), `README.md` (remove Strava/Tailscale sections; add "Upgrading from Strava" with the purge command; API table without `/strava/*`), frontend: remove the Strava section from `settings/page.tsx`, remove the Sync Strava button + mutation from `(app)/page.tsx`, the activity detail page reads the map polyline from the streams response (`streams.polyline`) instead of `rawData.map.summary_polyline`; update E2E mocks/fixtures that mention Strava (`MOCK_ACTIVITY.source = "garmin"`, remove Strava settings tests).
- Generated: new migration under `apps/api/drizzle/`.

**Interfaces:**
- Produces (schema):
  - `garminSync` table `garmin_sync`: `userId uuid PK → users cascade`, `status text not null default 'idle'`, `lastSyncedAt timestamp null`, `lastError text null`, `keyExpiresAt timestamp null`, `importedAt timestamp null`, `updatedAt timestamp defaultNow`. Type `GarminSync`.
  - `dailyWellness` table `daily_wellness`: `id uuid PK`, `userId → users cascade`, `date date not null`, int-null columns `sleepScore, sleepSeconds, deepSleepSeconds, remSleepSeconds, lightSleepSeconds, awakeSeconds, hrvLastNight, hrvWeeklyAvg, bodyBatteryCharged, bodyBatteryAtWake, bodyBatteryCurrent, stressAvg, restingHeartRate, caloriesTotal, caloriesActive, caloriesResting`, `sleepStart/sleepEnd timestamp null`, `hrvStatus text null`, `updatedAt timestamp defaultNow`; `UNIQUE(userId, date)`. Types `DailyWellness`, `NewDailyWellness`.
  - `activities.source` default `"garmin"`; `stravaTokens` + `StravaToken` removed.
- Produces (services):
  - `StreamPoint`, `HrZones` (moved verbatim from strava-client)
  - `buildStreams(input: { distanceM: number[]; heartrate: number[] | null; speedMs: number[] | null; altitudeM: number[] | null }, maxHr: number | null): { points: StreamPoint[]; hrZones: HrZones | null; maxHrUsed: number | null }` — the exact zone + 500-point downsampling logic from `getActivityStreams`.
  - `purgeLegacyData(db: DB): Promise<{ activities: number; chatSessions: number; chatHistory: number; recaps: number; weeklyReports: number }>` — one `db.transaction()`: delete `activities where source = 'strava'`, all `chat_history`, all `chat_sessions`, all `daily_recommendations`, all `weekly_reports`; returns counts. Never touches `users`, `api_keys`, `user_profiles`.
  - `apps/api` script `"purge-legacy-data": "tsx scripts/purge-legacy-data.ts"` — prints what will be deleted (counts via `select count(*)`), asks `Type "yes" to delete` on stdin unless `--yes`, then calls `purgeLegacyData` and prints counts.

- [ ] **Step 1: Failing tests**
  - `streams.test.ts`: zones bucket at 60/70/80/90 % of maxHr; `maxHrUsed` = round(max/0.95) when maxHr null; downsampling keeps ≤ 500 points; empty distance → `{points: [], hrZones: null, maxHrUsed: null}`.
  - `purge.test.ts` (db + tx mocked with `vi.fn` chains): deletes from exactly `activities` (with the `source = 'strava'` condition), `chatHistory`, `chatSessions`, `dailyRecommendations`, `weeklyReports`, inside `transaction`; never calls delete on `users`, `apiKeys`, `userProfiles`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement services, script, schema; delete Strava files; remove `STRAVA_*` from `env.ts`/`.env.example`; `pnpm --filter api db:generate` and commit the generated SQL (it must drop `strava_tokens`, create the two tables, change the default).
- [ ] **Step 4:** `pnpm test`, `pnpm lint`, `pnpm --filter frontend test:e2e` all PASS; `grep -ri strava apps packages --include=*.ts --include=*.tsx` returns only the purge code/tests and the `"strava"` literal in the overlap logic placeholder (none yet).
- [ ] **Step 5: Commit** `feat!: remove Strava; add garmin_sync and daily_wellness; purge-legacy-data command`

### Checkpoint A (controller, needs owner)

Owner has put `GARMIN_API_KEY` in the root `.env`. Controller runs `pnpm --filter api db:migrate`, then the purge for the owner (`pnpm --filter api purge-legacy-data`, after telling the owner the printed counts and getting a "yes"), then `pnpm --filter api garmin:probe > docs/superpowers/notes/2026-11-02-garmin-shapes.md`, checks the file contains no values, commits it. The shapes file is the source of field names for Tasks 3–5. If sleep score, calories or FIT GPS are absent, apply the spec's Fallbacks and note it in the ledger.

### Task 3: Garmin → DB mappers

**Files:**
- Create: `apps/api/src/services/garmin/mappers.ts`, `mappers.test.ts`, `apps/api/src/services/garmin/__fixtures__/*.json` (built from the shapes note with invented values)

**Interfaces:**
- Consumes: shapes note; `NewActivity`, `NewDailyWellness` (Task 2).
- Produces:
  - `mapSportType(typeKey: string): SportType` — `running|trail_running|treadmill_running|track_running → run`, `cycling|road_biking|mountain_biking|gravel_cycling|indoor_cycling|virtual_ride → ride`, `lap_swimming|open_water_swimming → swim`, `walking → walk`, `hiking → hike`, `yoga|pilates → yoga`, `strength_training|fitness_equipment|hiit|cardio|indoor_cardio → workout`, anything else `other`.
  - `mapGarminActivity(raw: unknown, userId: string): NewActivity` — `source "garmin"`, `externalId String(activityId)`, `startDate` from the GMT start field, duration/distance/elevation gain/avg+max HR/calories, pace (s/km) only for run/walk/hike with distance > 0, `rawData` = raw. Zod-parse the fields used (unknown extra keys allowed).
  - `mapWellnessDay(date: string, parts: { sleep?: unknown; hrv?: unknown; bodyBattery?: unknown; stress?: unknown; summary?: unknown }): NewDailyWellness` minus `userId` — missing parts → null columns; `bodyBatteryAtWake` = value at `sleepEnd` if derivable, else null; `bodyBatteryCurrent` = latest value of the day.
- [ ] **Step 1: Failing tests:** each mapping row of `mapSportType` + unknown → `other`; activity fixture maps every column; an activity starting 23:30 Europe/Berlin keeps the correct UTC instant; swim gets no pace; wellness: full fixture maps every column, empty parts → all-null row with the `date` kept verbatim (`"2026-11-01"` stays `"2026-11-01"`); malformed fixture (missing required id) throws.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(api): map Garmin activities and wellness to DB rows`

### Task 4: Sync service + `/garmin/*` routes

**Files:**
- Create: `apps/api/src/services/garmin/sync.ts`, `sync.test.ts`, `apps/api/src/routes/garmin.ts`
- Modify: `apps/api/src/index.ts` (register), `README.md` (API table)

**Interfaces:**
- Consumes: Task 1 client, Task 3 mappers, Task 2 tables.
- Produces:
  - `SYNC_GATE_MS = 15 * 60_000`
  - `isSyncDue(lastSyncedAt: Date | null, now: Date, force: boolean): boolean`
  - `syncWindows(now: Date, lastSyncedAt: Date | null): { activitiesFrom: Date; wellnessFrom: string; wellnessTo: string }` (dates `YYYY-MM-DD`; initial = 365 / 90 days; incremental = lastSyncedAt − 2 days / last 3 days incl. today)
  - `dateChunks(from: string, to: string, maxDays: number): Array<[string, string]>` (chunk size from the shapes note's limits; default 28)
  - `withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T | "busy">` — in-process; a second caller gets `"busy"` immediately.
  - `runGarminSync(db: DB, userId: string, opts: { initial: boolean }): Promise<void>` — sets status `importing`/`syncing`, pages activities (limit 100), upserts on `(userId, externalId, source)`; per upserted activity deletes a `source = 'strava'` row of the same user with `startDate` within ±2 min; upserts wellness per day on `(userId, date)`; on success `status idle, lastSyncedAt now, lastError null` (+ `importedAt` when initial); on `GarminError` `status error, lastError code`, data untouched; other errors → `garmin_unavailable`.
  - `garminStatusSchema = z.object({ connected: z.boolean(), status: z.enum(["idle","importing","syncing","error"]), lastSyncedAt: z.string().nullable(), lastError: z.enum(["key_invalid","rate_limited","garmin_unavailable"]).nullable(), keyExpiresAt: z.string().nullable() })`
  - Routes (all JWT): `POST /garmin/connect` body `{ key: z.string().trim().min(10).max(4000) }` → validates via `exchangeKey` (400 `{ error: "key_invalid" }` on failure), stores encrypted key, upserts `garmin_sync` (`keyExpiresAt`), starts `runGarminSync(initial: true)` without awaiting, returns status; `GET /garmin/status`; `POST /garmin/sync` body `{ force: z.boolean().default(false) }` → if not connected 400; if importing or busy → current status; if not due → current status without calling Garmin; else awaits incremental sync, returns status; `DELETE /garmin/key` → deletes key + `garmin_sync` row, keeps data.
- [ ] **Step 1: Failing tests:** `isSyncDue` (null → true; 14 min → false; 16 min → true; force → true); `syncWindows` initial and incremental values for a fixed `now`; `dateChunks` covers range without gaps/overlaps; `withUserLock` second concurrent call returns `"busy"` and the lock frees after rejection; `runGarminSync` with mocked client + db: 401 → status error/`key_invalid`, no deletes on activities/wellness; strava duplicate within ±2 min is deleted, one at +3 min is kept; never imports `anthropic-client` (assert module not called).
- [ ] **Step 2–4:** FAIL → implement → PASS. Business logic stays in `sync.ts`; the route file only orchestrates.
- [ ] **Step 5: Commit** `feat(api): Garmin sync service and routes`

### Task 5: Activity streams from FIT + Garmin insight fields

**Files:**
- Create: `apps/api/src/services/garmin/fit.ts`, `fit.test.ts` (fixture: a tiny FIT file generated in the test with `@garmin/fitsdk`'s Encoder, zipped with `fflate`)
- Modify: `apps/api/src/routes/activities.ts` (streams route), `apps/api/src/services/activity-insight.ts` (`computeInsightHash`), `apps/api/src/prompts/activity-insight.ts`, frontend `activities/[id]/page.tsx` (types: `polyline: string | null` on streams)

**Interfaces:**
- Consumes: `buildStreams` (Task 2), client `getBytes` (Task 1).
- Produces:
  - `parseFitActivity(zip: Uint8Array, maxHr: number | null): { points: StreamPoint[]; hrZones: HrZones | null; maxHrUsed: number | null; polyline: string | null }` — first `.fit` entry; records → `buildStreams`; lat/long semicircles → degrees → `@mapbox/polyline.encode` (downsample to ≤ 1000 coords); no records → empty result.
  - Streams response schema gains `polyline: z.string().nullable()`. Route: stored `streamData` returned as-is; else for `source "garmin"` download once (`/download-service/files/activity/{externalId}`), parse, store into `streamData`, return; any Garmin/parse error → empty result (not stored, not 500).
  - Insight hash/prompt use Garmin `rawData` fields for power/training effect/indoor per the shapes note instead of Strava keys.
- [ ] **Step 1: Failing tests:** FIT with HR+distance+GPS → points, zones, non-null polyline; FIT without records → empty; non-ZIP bytes → empty (no throw); insight hash changes when Garmin avg power changes and not when an unrelated raw key changes.
- [ ] **Step 2–4:** FAIL → implement → PASS. E2E `activities.spec.ts`: detail with `polyline: null` shows no map and no error.
- [ ] **Step 5: Commit** `feat: activity streams and map from Garmin FIT files`

### Task 6: Recovery-aware short German recap, wellness API, privacy mode

**Files:**
- Create: `apps/api/src/services/wellness.ts` + `wellness.test.ts`, `apps/api/src/prompts/recap-system.ts`, `apps/api/src/routes/wellness.ts`
- Modify: `apps/api/src/services/daily-recap.ts` (+ test), `apps/api/src/prompts/recommendation.ts`, `apps/api/src/prompts/chat.ts`, `apps/api/src/routes/ai.ts` (recap call: `system: RECAP_SYSTEM_PROMPT`, `max_tokens: 300`), `apps/api/src/services/anthropic-client.ts` (privacy mode), `README.md` (Data Privacy: recovery data goes to Anthropic; PostHog gets no prompt content)

**Interfaces:**
- Produces:
  - `loadWellness(db: DB, userId: string, date: string, days = 7): Promise<DailyWellness[]>` (dates `date−days+1 … date`, ascending)
  - `type RecapWellness = { date: string; sleepScore; sleepSeconds; deepSleepSeconds; remSleepSeconds; lightSleepSeconds; awakeSeconds; hrvLastNight; hrvWeeklyAvg; hrvStatus; bodyBatteryCharged; bodyBatteryAtWake; stressAvg?; restingHeartRate? }`
  - `settledWellness(rows: DailyWellness[], date: string): RecapWellness[]` — for `row.date === date` omits `stressAvg`, `restingHeartRate`, `bodyBatteryCurrent`, calories; for earlier days keeps `stressAvg`, `restingHeartRate`; never includes calories or `bodyBatteryCurrent`.
  - `computeRecapHash({ date, activities, profile, wellness: RecapWellness[] })`; `loadRecapInputs` also returns `wellness` (via `settledWellness(await loadWellness(...))`).
  - `formatRecoverySection(w: RecapWellness[]): string[]` — markdown lines: last night (score, duration, stages), HRV (last night, weekly avg, status), Body Battery at wake + charged, yesterday's stress + resting HR, 7-day line of sleep score / HRV. Used by the recap prompt and the chat system prompt.
  - `RECAP_SYSTEM_PROMPT` (exact copy):
    ```
    Du bist FitCoach, ein erfahrener Ausdauer-Coach. Du gibst eine kurze Tagesempfehlung auf Deutsch.
    Antworte GENAU in diesem Format und mit nichts anderem:
    ### <Urteil in 2–3 Wörtern, z. B. "Lockerer Tag", "Harte Einheit", "Ruhetag">
    <1–2 Sätze Begründung aus Schlaf, HRV, Body Battery und Trainingsbelastung>
    → <eine konkrete Einheit mit Dauer und Intensität (HF-Bereich aus Max-HF bzw. Watt aus FTP, falls angegeben) – oder was stattdessen an einem Ruhetag>
    Höchstens 60 Wörter. Keine Einleitung, keine Aufzählungen, keine Rückfragen.
    Fehlen Erholungsdaten, entscheide anhand der Trainingsbelastung und erwähne das nicht.
    ```
  - `GET /wellness?date=YYYY-MM-DD` (JWT, Zod `recapDateSchema`) → `{ today: WellnessDay | null; days: WellnessDay[] }` where `WellnessDay` is the full `daily_wellness` row minus `id`/`userId`/`updatedAt`, `days` = last 7 incl. today.
  - Anthropic client: `new Anthropic({ apiKey, posthog, privacyMode: true })` — check the `@posthog/ai` 7.13 option name in its typings; if it is per-call (`posthogPrivacyMode: true`), set it on every `messages.create` instead.
- [ ] **Step 1: Failing tests:** `settledWellness` drops today's stress/RHR/current BB/calories and keeps yesterday's stress/RHR; **recap hash unchanged** when today's `caloriesTotal`, `bodyBatteryCurrent`, `stressAvg`, `restingHeartRate` change; **changes** when today's `sleepScore` or `hrvLastNight` appears, when an activity is added, when the profile changes; no today row → hash computable and prompt still built; `formatRecoverySection([])` → `[]`; recap prompt contains no `rawData` keys; `RECAP_SYSTEM_PROMPT` contains `###` and `→`.
  - `buildRecapRequest(userMessage: string): { model: string; max_tokens: number; system: string; messages: [{ role: "user"; content: string }] }` in `prompts/recommendation.ts`; the route spreads it into `messages.create` (+ `stream: true`, `posthogDistinctId`).
- [ ] **Step 2–4:** FAIL → implement → PASS. Test: `buildRecapRequest("x")` has `max_tokens: 300` and `system: RECAP_SYSTEM_PROMPT`.
- [ ] **Step 5: Commit** `feat: short German recap using Garmin recovery data; PostHog privacy mode`

### Task 7: Summary redesign (mockup A v2)

**Files:**
- Create: `apps/frontend/src/components/summary/recovery-tiles.tsx`, `apps/frontend/src/lib/garmin.ts`
- Modify: `apps/frontend/src/app/(app)/page.tsx`, `apps/frontend/src/components/summary/coach-tile.tsx`, `apps/frontend/src/app/globals.css` + `tailwind.config.ts` (tokens `--metric-sleep` indigo, `--metric-hrv` teal, `--metric-battery` mint, `--metric-stress` orange-red, `--metric-calories` pink, light + dark), `apps/frontend/e2e/summary.spec.ts`
- Reference mockup: `.superpowers/brainstorm/60829-1793623354/content/summary-desktop-v2.html`

**Interfaces:**
- Consumes: `GET /wellness`, `POST /garmin/sync`, `GET /garmin/status` (Tasks 4, 6).
- Produces:
  - `useGarminSync(): { status: GarminStatus | undefined; settled: boolean }` — on first mount per page load POSTs `/garmin/sync` `{ force: false }` once (module-level guard, StrictMode-safe); `settled` = POST finished (success or error) or not connected; afterwards invalidates `stats`, `recent-activities`, `wellness`, `recap`. Polls `GET /garmin/status` every 5 s while `status === "importing"`.
  - `syncNow()` for the button → POST `{ force: true }`.
  - `CoachTile({ enabled }: { enabled: boolean })` — no recap GET/stream until `enabled`; while importing shows "Waiting for Garmin import…". Recap heading (`###`) rendered large/bold; the `→` line bold.
  - `RecoveryTiles({ data, loading })` — Sleep (score + Garmin label if present, duration, stage bar), HRV (ms, status, 7-day sparkline), Body Battery (current /100, "+N charged overnight"), Stress (today's average), Calories (total kcal, "Active X · Resting Y", split bar); missing value → "—" + "No data".
- Layout: `lg:` five tiles in one row; below `grid lg:grid-cols-[2fr_1fr]`: left Coach + Recent, right Fatigue / Fitness / Form + "Sync now" button. Phone: one column, recovery tiles `grid-cols-2`. No key → single tile "Connect Garmin in Settings" linking `/settings`; `lastError` → one-line notice ("Garmin key invalid or expired — update it in Settings" / "Garmin is busy, try again later").
- [ ] **Step 1: Failing E2E tests** (mocked API, existing fixtures): five tiles with mocked values at 1280px and two columns (Coach box left of Fatigue box via bounding boxes); one column at 390px; no wellness → "No data" on Sleep and HRV; importing → "Waiting for Garmin import…" and **no** `/ai/recommendation` POST; order: `/garmin/sync` request completes before the first `/ai/recommendation` GET; exactly one `/garmin/sync` POST and one recap POST per load; `lastError: "key_invalid"` → notice with Settings link; not connected → "Connect Garmin in Settings".
- [ ] **Step 2–4:** FAIL → implement → PASS; update the existing summary tests that assumed the old layout.
- [ ] **Step 5: Commit** `feat(frontend): recovery-first Summary with Garmin sync`

### Task 8: Settings — Garmin section

**Files:**
- Modify: `apps/frontend/src/app/(app)/settings/page.tsx`, `apps/frontend/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `/garmin/connect`, `/garmin/status`, `/garmin/sync`, `/garmin/key`.
- Produces: Garmin section: how-to line with link `https://connect.garmin.com/app/settings/personalApiToken`, password input + "Connect" (shows "Key invalid" on 400), status line (Connected · last sync relative time · "Importing…" · "Key invalid or expired"), key expiry date when present, "Sync now", "Remove key".
- [ ] **Step 1: Failing E2E:** connect with valid key → status shows "Importing…" then "Connected"; 400 → "Key invalid" and input kept; remove key → back to connect form; key input is `type="password"`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(frontend): Garmin connection settings`

### Task 9: Desktop widths on the other pages

**Files:**
- Modify: `apps/frontend/src/app/(app)/layout.tsx` (`max-w-[640px] lg:max-w-[1150px]`), `settings/page.tsx` (`lg:max-w-[640px] lg:mx-auto` wrapper), `trends/page.tsx` (charts `lg:grid-cols-2`, weekly report `lg:col-span-2`; drop its `max-w-3xl`), `activities/page.tsx` (lg: extra Elevation and Pace columns), `activities/[id]/page.tsx` (stat tiles in one row at lg, map + charts `lg:grid-cols-2`; drop `max-w-3xl`), `coach/page.tsx` (lg: permanent sessions list column left, sheet only below lg), E2E specs for each page.
- [ ] **Step 1: Failing E2E** at 1280px: main content width > 1000px on Summary/Trends/Activities; Settings form ≤ 700px; Trends first two charts side by side (same top, different left); Coach sessions list visible without opening the sheet; at 390px all of these fall back to one column / sheet.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(frontend): use desktop width across pages`
