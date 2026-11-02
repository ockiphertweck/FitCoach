# FitCoach: Garmin as data source — design

Date: 2026-11-02
Status: draft, awaiting owner review
Builds on: `feat/ui-refresh` (spec `2026-11-02-ui-refresh-design.md`); work happens on branch `feat/garmin`.

## Intent

Strava closed its API to free accounts ("API access only for members"; every call now returns
`403 Application Status Inactive`), so FitCoach has had no new data since 8 April 2026. The owner's
watch is a Garmin, and Strava was only a detour: Garmin now offers a **Personal API** for an
individual's own data. FitCoach switches to Garmin as its only data source and, while at it, gains
the recovery data Strava never had — sleep with Garmin's sleep score, HRV, Body Battery, stress and
daily calories — and the coach uses it.

Owner's usage: opens FitCoach "after training or after getting up — whenever something's due".
Success: open FitCoach in the morning → last night's sleep/HRV/Body Battery are there, the coach
gives a short, concrete recommendation that takes them into account; open it after a session → the
session is there and the recap reflects it. On the laptop the app uses the screen width.

## Goals

1. **Garmin replaces Strava completely** — connect via a personal API key, import, incremental sync.
2. **Recovery data**: per day store and show sleep (score, duration, stages), HRV, Body Battery,
   stress, calories (total / active / resting).
3. **Summary redesign** (mockup "A v2"): five recovery tiles on top, coach + recent activities left,
   Fatigue / Fitness / Form right; app uses ~1150px on desktop.
4. **Short coach recap** in German with a fixed format; it considers recovery data.
5. **Desktop widths** for the other pages (see Layout).
6. **Remove Strava** code and purge the old Strava-era data (owner's explicit request).

## Non-goals

- UI language switch (DE/EN) — **separate project, next**. Until then UI labels stay English;
  only the coach writes German.
- Sleep/HRV/etc. charts on Trends — later.
- Own computed scores (readiness etc.). Garmin's values are shown as Garmin delivers them.
- Background/scheduled syncing while the app is closed. Garmin webhooks don't exist for the
  Personal API anyway.
- Steps, SpO2, hydration, weight, menstrual data, food logs.
- Keeping Strava as an optional second source.

## Anti-goals (failure even if it works)

- A recap rewritten (= a paid Claude call) every time a 15-minute sync nudges today's calories,
  current Body Battery or today's stress. Only values that are *settled* for the day may drive it.
- Coach text walls. The recap must fit the tile without scrolling.
- Garmin key or access token in logs, responses or plaintext in the DB.
- Hammering Garmin (unknown rate limits) — e.g. re-importing a year on every sync.
- Deleting data silently for anyone who didn't ask for it (FitCoach is open source; other
  self-hosters may pull this).

## Garmin Personal API — what we know

Sources: developer.garmin.com/gc-developer-program/personal/{personal-api, personal-faq,
swagger-docs}, official client github.com/garmin/connect-personal-api-python.

- For an individual's own data, not multi-user apps → fits single-user FitCoach.
- Key created by the owner at `https://connect.garmin.com/app/settings/personalApiToken`; validity
  chosen at creation (30/90/180 days or 1 year); shown once. Garmin emails ~1 week before expiry.
- Key → access token: `POST https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token`
  with header `Authorization: ApiKey <key>`. Token valid 24h (or until key expiry); no refresh
  token — just exchange the key again.
- Read-only GET endpoints (paths from the official client; base URL to confirm from its source):
  - activities: `/activitylist-service/activities/search/activities?start&limit&startDate&endDate`,
    `/activity-service/activity/{id}`, `/download-service/files/activity/{id}` (ZIP)
  - sleep: `/sleep-service/sleep/dailySleep?date=`, `/sleep-service/sleep/dailySleepSummariesByDate?startDate&endDate`
  - HRV: `/hrv-service/hrv/{date}`, `/hrv-service/hrv/daily/{start}/{end}`
  - Body Battery: `/wellness-service/wellness/bodyBattery/reports/daily?startDate&endDate`
  - stress: `/usersummary-service/stats/stress/daily/{start}/{end}`
  - daily summaries (calories, resting HR, stress avg): `/usersummary-service/v2/dailysummaries?startDate&endDate`
- Third-party reports: range calls cap at ~28–31 days (sleep, Body Battery, stress), daily
  summaries up to a year. **Unverified.**
- **Unknown until called with a real key** (see "Verification first"): exact field names, that the
  sleep response carries Garmin's sleep score, that the activity ZIP contains a FIT file with GPS +
  HR records, rate limits, whether the token response exposes the key's expiry date.

## Verification first *(Claude's call)*

Before building sync/UI, a small **probe script** (`apps/api/scripts/garmin-probe.ts`, run with
`GARMIN_API_KEY` from the environment, never committed) calls each endpoint above for a recent
date range and prints **only the JSON shape** (keys and value types, no values) plus HTTP status
and response headers that look like rate limits. Its output fixes the field mapping used in the
plan. If the sleep score, calories or FIT GPS data turn out to be missing, the affected tile/feature
degrades as described under "Fallbacks" instead of being computed by us.

## Data model

All via `schema.ts` + `drizzle-kit generate`.

- **Garmin key**: reuse `api_keys` with `provider = "garmin"`, encrypted with `encrypt()`.
- **Sync state** — new table `garmin_sync (userId PK → users cascade, lastSyncedAt timestamp null,
  status text ('idle' | 'importing' | 'syncing' | 'error'), lastError text null, keyExpiresAt
  timestamp null, importedAt timestamp null)`. `lastError` holds a short user-facing code
  (`key_invalid`, `rate_limited`, `garmin_unavailable`), never a raw response body.
- **Activities**: existing `activities` table, `source = "garmin"`, `externalId` = Garmin
  activityId; column default changes from `"strava"` to `"garmin"`. `rawData` keeps the Garmin
  payload (never sent to Claude). `streamData` caches parsed FIT streams (same shape the
  `/activities/:id/streams` route returns today). `sufferScore` stays nullable (Garmin has none).
  Garmin activity type keys map onto `SportTypeSchema` (`running`→`run`, `cycling`/`road_biking`/…→`ride`,
  `lap_swimming`/`open_water_swimming`→`swim`, `walking`→`walk`, `hiking`→`hike`, `yoga`→`yoga`,
  `strength_training`/`fitness_equipment`…→`workout`, rest→`other`).
- **Daily wellness** — new table `daily_wellness (id, userId → users cascade, date date,
  sleepScore int null, sleepSeconds int null, deepSleepSeconds, remSleepSeconds, lightSleepSeconds,
  awakeSeconds int null, sleepStart/sleepEnd timestamp null, hrvLastNight int null (ms),
  hrvWeeklyAvg int null, hrvStatus text null, bodyBatteryCharged int null, bodyBatteryAtWake int null,
  bodyBatteryCurrent int null, stressAvg int null, restingHeartRate int null,
  caloriesTotal int null, caloriesActive int null, caloriesResting int null, updatedAt)`,
  `UNIQUE(userId, date)`. Upserted per day; columns stay null when Garmin has no value.
- `strava_tokens` table and `StravaToken` type are dropped.

## Sync

*(Claude's calls unless marked owner)*

- **Connect** (Settings): owner pastes the key → server exchanges it for a token (validates it) →
  stores key encrypted → starts the **initial import** in the background: activities of the last
  **12 months** (paged), wellness of the last **90 days** (chunked to the per-call cap). Status
  `importing` until done; Summary/Settings show "Importing from Garmin…".
- **Incremental sync** (owner: "when I open the app"): when the Summary page opens and
  `lastSyncedAt` is older than **15 minutes**, the frontend calls `POST /garmin/sync`. Window:
  activities since `lastSyncedAt − 2 days` (catches edits/late uploads), wellness for the last
  **3 days** (sleep and HRV settle after waking). Upsert everything. A manual **Sync now** button
  forces it regardless of age.
- One sync per user at a time (in-process lock is enough — single instance); a second request
  while one runs returns the running state instead of starting another.
- Access token cached in memory until ~1h before expiry; re-exchanged from the stored key.
- **Order on Summary**: sync (if due) → then the recap check. The recap waits for the sync so it
  includes last night / the session just finished, and only one Claude call happens.
- While the **initial import** runs, no recap is generated; the Coach tile shows "Waiting for
  Garmin import…" and the recap starts once the import has finished *(Claude's call — a recap on
  partial data would go stale and cost a second call)*.
- **Overlap with legacy Strava rows** (installs that didn't run the purge) *(Claude's call)*: when a
  Garmin activity is upserted and a `source = 'strava'` activity of the same user starts within
  ±2 minutes of it, that Strava row is deleted — the same session is replaced, never counted twice.
  Older Strava-only history is kept. For the owner the purge runs before connecting Garmin anyway.
- Streams/map: on first open of an activity's detail page, download its FIT (ZIP) once, parse with
  Garmin's official FIT SDK (`@garmin/fitsdk`), store into `streamData` and a GPS polyline into
  `rawData`-adjacent storage the map can read. Never during the bulk import.
- Errors: 401/403 on token exchange → `key_invalid` (Settings asks for a new key; data stays);
  429 → `rate_limited`, stop this run, next attempt on the next due sync; 5xx/network →
  `garmin_unavailable`. Summary shows a quiet one-line notice, not a crash. The key, token and
  Garmin response bodies are never logged.
- Removing the key in Settings deletes the key and sync state; imported data stays.

## Removing Strava and purging old data

- Delete: Strava routes (`routes/strava.ts`), `services/strava-client.ts` + test, the webhook,
  `STRAVA_*` env vars (`env.ts`, `.env.example`), Strava UI in Settings/Summary/activity detail, the
  Strava-only branch in `/activities/:id/streams`, README sections; `docker-compose.override.yml`'s
  Tailscale service existed only for Strava webhooks → remove it and `TS_AUTHTOKEN` docs.
- **Purge** *(Claude's call on the mechanism)*: not an automatic migration (it would wipe other
  self-hosters' chats on upgrade). Instead an explicit one-off command
  `pnpm --filter api purge-legacy-data` that, in one `db.transaction()`, deletes: activities with
  `source = 'strava'`, all `chat_sessions` + `chat_history`, `daily_recommendations`,
  `weekly_reports`. It keeps `users`, `api_keys` (Claude key), `user_profiles`. It prints counts and
  asks for confirmation (`--yes` to skip). Owner's list: delete activities, Strava link, chat,
  recaps, weekly reports; keep login, Claude key, profile. README documents it under "Upgrading
  from Strava".

## Coach recap

- **Own recap prompt** (no longer the general chat `SYSTEM_PROMPT`): German *(owner)*, fixed format
  *(owner approved)*:
  1. verdict as a one-line heading — e.g. "Lockerer Tag", "Harte Einheit", "Ruhetag"
  2. one or two sentences of reasoning from sleep, HRV, Body Battery and training load
  3. one concrete session line, e.g. "→ 45–60 min Zone 2, HF 130–145" (uses the profile's max HR /
     FTP when present), or what to do instead on a rest day
  Max ~60 words; `max_tokens` ~300. No preamble, no lists beyond that.
- **Inputs** added to the prompt: last night's sleep (score, duration, stages), HRV (last night,
  weekly average, status), Body Battery at wake and charged overnight, yesterday's average stress,
  resting HR, plus a compact 7-day trend of sleep score and HRV. Raw Garmin payloads are never sent.
- **Staleness hash** (`computeRecapHash`) adds exactly those *settled* inputs — sleep, HRV, Body
  Battery at wake/charged, yesterday's stress, resting HR for the 7-day window. It must **not**
  include today's calories, current Body Battery or today's running stress (anti-goal). Chat still
  excluded. Arrival of last night's sleep after the recap was written therefore redoes it once.
- **Per-activity AI insight**: **button only** *(owner)* — sync never calls Claude for insights
  (today's automatic `maybeGenerateInsight()` after Strava sync is not ported). Also, `computeInsightHash` and `prompts/activity-insight.ts` are ported from Strava-only
  `rawData` fields (`average_watts`, `device_watts`, `trainer`, `pr_count`) to Garmin fields, and
  the bulk import never triggers insights.
- The chat coach gets the same recovery summary in its context *(Claude's call)*; chat answers stay
  long-form and keep their current language behaviour.

## Summary page (mockup `.superpowers/brainstorm/60829-1793623354/content/summary-desktop-v2.html`)

- Desktop (≥ lg): header → row of **five tiles**: Sleep (score + label, duration, stage bar),
  HRV (ms, status, 7-day sparkline with baseline band), Body Battery (current /100, "+N charged
  overnight", day curve), Stress (today's average so far), Calories (today's total kcal, "Active X ·
  Resting Y", split bar) → two columns 2:1: left Coach tile (verdict as large heading, reasoning,
  bold session line) + Recent activities; right Fatigue, Fitness, Form (scale) stacked, plus Sync.
- Phone: one column, same order (tiles 2-up where they fit).
- New metric colours (light/dark tokens like the existing `--metric-*`): sleep indigo, HRV teal,
  Body Battery mint, stress orange-red, calories pink — distinct from Fatigue orange, Fitness blue,
  Form green, Coach purple.
- States: importing → tiles show skeletons with "Importing from Garmin…"; no key → one tile
  "Connect Garmin in Settings" with a link; no value for a metric → tile shows "—" and "No data".

## Layout on other pages (desktop ≥ lg, phone unchanged)

App container ~**1150px** instead of 640px.
- Trends: charts in a two-column grid; weekly report full width below.
- Activity detail: stat tiles in one row; map and charts side by side.
- Coach: permanent conversation list on the left, chat fills the rest (phone keeps the sheet).
- Activities list: full width, elevation and pace as extra columns.
- Settings: stays narrow (~640px) *(Claude's call)*.

## Settings

"Strava" section replaced by **Garmin**: short how-to with link to the key page, password-type key
input + Save (validates, then starts import), status line (connected · last sync · importing ·
key invalid/expired), key expiry date if the token response exposes it, Remove key, Sync now.

## Fallbacks

- No sleep score in the API → Sleep tile shows duration + stages only; recap uses duration/stages.
- No GPS/HR in the FIT download → activity detail hides map/charts (as today for missing streams).
- Key expiry not exposed → Settings shows only "key invalid/expired" once Garmin rejects it.

## Privacy / GDPR

- **New data sent externally**: sleep, HRV, Body Battery, stress and resting HR now go to Anthropic
  in the recap and chat prompts (owner asked for the coach to use them). README "Data Privacy" is
  updated accordingly.
- PostHog: `@posthog/ai` currently captures full prompts when `POSTHOG_API_KEY` is set, which now
  would include all of the above. **Fixed in this project** by enabling its privacy mode on every
  Claude call *(Claude's call — README promises "no health data")*.
- No PII, key, token or health values in logs. Zod on every new route input; JWT preHandler on every
  new route.

## Tests (required)

- Unit: Garmin client (token exchange + caching + 401/429 mapping, with fetch mocked), type
  mapping, activity + wellness mappers from probe-shaped fixtures, sync windows (initial vs
  incremental, 15-minute gate, lock), recap hash (changes on new sleep/HRV/activity/profile; **unchanged**
  on calories, current Body Battery, today's stress, chat), recap prompt (German format instruction,
  `max_tokens` ≤ 300, no raw payload), purge (deletes exactly the listed tables/rows, keeps user,
  Claude key, profile), FIT parsing into stream points.
- E2E (mocked API, as existing specs): Summary five tiles + two columns on desktop and one column on
  phone; importing / no-key / no-data states; sync-then-recap order (one recap request); Settings
  Garmin connect, invalid key, remove; wider layouts of Trends / Coach / Activities.
- Existing Strava-based tests and fixtures are removed or ported to Garmin shapes.

## Left to the builder

Exact field mapping (from the probe), label wording, tile sparkline data (use stored
`daily_wellness` days; leave a sparkline out rather than add an endpoint), chunk sizes,
FIT-polyline storage detail, how the purge command prompts, breakpoints and spacing.
