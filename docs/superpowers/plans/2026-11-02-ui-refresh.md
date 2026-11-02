# UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole frontend in a light Apple Health look with a liquid-glass tab bar and a persisted dark mode, and make the daily coach recap auto-load and regenerate when its training data changes.

**Architecture:** Backend gets a `daily_recommendations` table and a `services/daily-recap.ts` service (input hash, stream-to-end-then-save). The existing `/ai/recommendation` route becomes GET (stored recap + staleness) + POST (SSE stream that saves). Frontend replaces the theme tokens, the shell (nav/layout) and the shadcn primitives first, so every page inherits the look; then each page is re-laid-out.

**Tech Stack:** Fastify v5 + Zod + Drizzle (Postgres), Vitest; Next.js 15 App Router, Tailwind 3 (`darkMode: ["class"]`), shadcn/ui, lucide-react, recharts, TanStack Query, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-ui-refresh-design.md` — read it before any task. Mockups: `.superpowers/brainstorm/86546-1793611081/content/{visual-style,layout,glass}.html` (option B in each).

## Global Constraints

- Colours: light bg `#f2f2f7`, tile `#fff`; dark bg `#000`, tile `#1c1c1e`. Tiles radius ~20px, no borders.
- Metric colours everywhere: Fatigue/ATL orange `#ff9500`, Fitness/CTL blue `#007aff`, Form/TSB green `#34c759`, Coach purple `#af52de` (slightly brighter in dark). Trends chart colours are separate: distance teal, duration indigo, HR pink/red.
- Font: system stack `-apple-system, "SF Pro Display", system-ui, sans-serif`. Remove Sora and DM Sans.
- Labels: "Summary" (`/`), "Coach" (`/coach`), "Activities" (`/activities`), "Trends" (`/trends`), "Settings" (`/settings`). `/analytics` permanently redirects to `/trends`.
- Phone (< `md`): 4-tab glass capsule at the bottom, Settings = gear in page header. Laptop: glass capsule top centre incl. gear pill. Content column centred, ~640px max (wider allowed for charts/detail).
- Glass: `backdrop-filter: blur(18px) saturate(180%)`, translucent white (dark: smoked) gradient, 1px bright border, inset top highlight, soft shadow, `rounded-full`; fall back to solid tile colour under `prefers-reduced-transparency: reduce`.
- Theme cookie `fitcoach_theme` = `system|light|dark`, 1 year, default/invalid → `system`. No flash on load.
- No new frontend dependencies. Sport icons from lucide-react, never emoji.
- No sparklines (no history endpoint exists; spec says leave them out rather than add one).
- CLAUDE.md rules: logic in `services/`, Zod on every query/body, JWT preHandler on `/ai/*` (already a plugin-level hook), no PII/recap content in logs, migrations only via `pnpm --filter api db:generate`.
- Before each commit: `pnpm lint` passes.

## Review Focus

1. **Browser disconnects mid-recap** → server still finishes and saves; next visit shows it without a new call. Pinned in Task 1 (`streamAndSaveRecap` test "saves even when onText throws").
2. **No Claude key (neither per-user nor `CLAUDE_API_KEY`)** → no POST is made; tile shows "Add your Claude API key in Settings" linking `/settings`. Pinned in Task 6 E2E.
3. **Chat/kudos changes must not mark the recap stale; activity add/edit/delete and profile edits must.** Pinned in Task 1 hash tests.
4. **Malformed `date`** (`2026-13-01`, `"today"`, missing) → 400 from Zod, no Claude call. Pinned in Task 2 by a unit test on the exported `recapDateSchema`.
5. **Garbage `fitcoach_theme` cookie** → treated as `system`, page renders. Pinned in Task 3 `parseTheme` usage + E2E.

---

### Task 1: Daily recap service (hash + stream-and-save)

**Files:**
- Create: `apps/api/src/services/daily-recap.ts`
- Test: `apps/api/src/services/daily-recap.test.ts`

**Interfaces:**
- Consumes: `computeInsightHash(activity: Activity): string` from `services/activity-insight.ts`; types `Activity`, `UserProfile` from `db/schema.ts`.
- Produces:
  - `computeRecapHash(input: { date: string; activities: Activity[]; profile: UserProfile | null }): string` — sha256 hex over `date`, activities sorted by `id` mapped to `[id, computeInsightHash(a)]`, and the profile with `updatedAt`/`userId` stripped (null → `null`).
  - `streamAndSaveRecap(opts: { stream: AsyncIterable<RecapStreamEvent>; onText: (text: string) => void; save: (content: string) => Promise<void> }): Promise<string>` — iterates the Anthropic stream to the end, calls `onText` per text delta inside try/catch (a throwing `onText` = client gone → stop calling it, keep consuming), calls `save(fullText)` once at the end, returns full text. If the stream itself throws, rethrow and do not save.
  - `type RecapStreamEvent` = the subset of Anthropic stream events used (`{ type: string; delta?: { type: string; text?: string } }`).

- [ ] **Step 1: Write the failing tests** in `daily-recap.test.ts` (follow `strava-client.test.ts` style with a `makeActivity(overrides)` helper):
  - `computeRecapHash` is stable for identical input and independent of activity order.
  - changes when an activity is added, removed, or its `durationSeconds` changes.
  - unchanged when only `rawData.kudos_count` changes.
  - changes when `profile.weightKg` changes; unchanged when only `profile.updatedAt` changes.
  - changes when `date` changes.
  - `streamAndSaveRecap`: with deltas `"Easy "`, `"ride"` → returns `"Easy ride"`, `onText` called twice, `save` called once with `"Easy ride"`.
  - "saves even when onText throws": `onText` throws on first call → `save` still called with full text, `onText` not called again.
  - "does not save when the stream errors": async generator yields one delta then throws → promise rejects, `save` not called.
- [ ] **Step 2: Run** `pnpm --filter api test daily-recap` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** both functions in `daily-recap.ts` (`createHash` from `node:crypto`, as `activity-insight.ts` does).
- [ ] **Step 4: Run** `pnpm --filter api test daily-recap` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(api): daily recap hash and stream-and-save service`

---

### Task 2: `daily_recommendations` table + GET/POST `/ai/recommendation`

**Files:**
- Modify: `apps/api/src/db/schema.ts` (new table after `weeklyReports`, plus `export type DailyRecommendation`)
- Generate: `apps/api/drizzle/0009_*.sql` via `pnpm --filter api db:generate`
- Modify: `apps/api/src/services/daily-recap.ts` (DB functions)
- Modify: `apps/api/src/prompts/recommendation.ts` (date param)
- Modify: `apps/api/src/routes/ai.ts:122-162` (recommendation section)
- Test: `apps/api/src/services/daily-recap.test.ts`

**Interfaces:**
- Consumes: Task 1 functions; `getAnthropicClient`, `requireAnthropicClient` from `services/anthropic-client.ts`.
- Produces (HTTP, used by Task 6):
  - `GET /ai/recommendation?date=YYYY-MM-DD` → `200 { hasKey: boolean; recap: { content: string; generatedAt: string; stale: boolean } | null }`
  - `POST /ai/recommendation` body `{ date: "YYYY-MM-DD" }` → SSE `data: {"text": "..."}` chunks then `data: [DONE]` (same wire format as today); saves on completion.
- Produces (TS):
  - `loadRecapInputs(db: DB, userId: string): Promise<{ activities: Activity[]; profile: UserProfile | null }>` — activities in the 42-day window + profile (same queries `buildRecommendationPrompt` uses).
  - `getStoredRecap(db: DB, userId: string, date: string): Promise<DailyRecommendation | null>`
  - `upsertRecap(db: DB, row: { userId: string; date: string; inputHash: string; content: string }): Promise<void>` — `onConflictDoUpdate` on `(userId, date)`, sets `content`, `inputHash`, `generatedAt = now()`.
  - `buildRecommendationPrompt(userId: string, db: DB, date: string): Promise<string>` — `**Date**` line uses `date`.
  - `recapDateSchema = z.object({ date: z.string().date() })` exported from `daily-recap.ts`, used as both GET querystring and POST body schema.

- [ ] **Step 1: Add table** `daily_recommendations`: `id uuid pk defaultRandom`, `userId → users.id onDelete cascade notNull`, `date date notNull`, `inputHash text notNull`, `content text notNull`, `tokensUsed integer`, `generatedAt timestamp defaultNow notNull`, `unique().on(userId, date)`.
- [ ] **Step 2: Run** `pnpm --filter api db:generate` then `pnpm --filter api db:migrate` — Expected: one new migration file creating `daily_recommendations`; migrate succeeds.
- [ ] **Step 3: Add DB functions** above to `daily-recap.ts`. Extend `daily-recap.test.ts` only if the existing test setup can mock `db`; otherwise these are covered by the route behaviour in Task 6 E2E (they're thin Drizzle calls).
- [ ] **Step 3b: Test** `recapDateSchema`: accepts `"2026-11-02"`; rejects `"2026-13-01"`, `"today"`, `{}`. Run `pnpm --filter api test daily-recap` — PASS.
- [ ] **Step 4: Change prompt** signature to take `date`; update its one caller.
- [ ] **Step 5: Replace the route section.** Query/body schema `recapDateSchema`. GET: `hasKey = (await getAnthropicClient(userId)) !== null`; compute current hash via `loadRecapInputs` + `computeRecapHash`; `stale = stored.inputHash !== currentHash`. POST: compute hash **before** calling Claude, build prompt, open SSE (keep existing headers), call `streamAndSaveRecap` with `onText` writing to `reply.raw` (throw if `reply.raw.destroyed`), `save` → `upsertRecap`. Remove nothing else. Logs: `{ userId }` only.
- [ ] **Step 6: Verify** `pnpm --filter api test && pnpm --filter api exec tsc --noEmit` — Expected: PASS, no type errors.
- [ ] **Step 7: Commit** `feat(api): store daily recap and detect stale inputs`

---

### Task 3: Theme tokens, fonts, no-flash dark mode

**Files:**
- Modify: `apps/frontend/src/app/globals.css` (replace tokens; delete ambient `body::before` gradients and `#dde8ff` body bg; add `.glass` utility)
- Modify: `apps/frontend/tailwind.config.ts` (font family `sans` = system stack; add `colors.metric.{fatigue,fitness,form,coach}` via CSS vars)
- Modify: `apps/frontend/src/app/layout.tsx` (drop `next/font` Sora/DM Sans; read cookie; inline script)
- Create: `apps/frontend/src/lib/theme.ts`
- Test: `apps/frontend/e2e/theme.spec.ts` (written in Task 9 together with the control; this task is verified visually + by existing E2E staying green)

**Interfaces:**
- Produces:
  - `type Theme = "system" | "light" | "dark"`; `THEME_COOKIE = "fitcoach_theme"`; `parseTheme(value: string | undefined): Theme` (anything else → `"system"`); `setThemeCookie(theme: Theme): void` (client; `max-age=31536000; path=/; samesite=lax`, then applies the class to `document.documentElement` immediately).
  - CSS vars under `:root` and `.dark`: shadcn set (`--background`, `--card`, `--foreground`, `--muted-foreground`, `--border`, …) mapped to the Global Constraints colours, plus `--metric-fatigue|fitness|form|coach`.
  - `.glass` class implementing the Global Constraints glass recipe for both themes.

- [ ] **Step 1:** `layout.tsx`: `const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)`; `<html className={theme === "dark" ? "dark" : undefined} data-theme={theme} suppressHydrationWarning>`; when `theme === "system"`, render an inline `<script>` in `<head>` that adds `dark` if `matchMedia("(prefers-color-scheme: dark)").matches` and toggles it on change.
- [ ] **Step 2:** Rewrite tokens in `globals.css`; set `color-scheme: light dark` per mode.
- [ ] **Step 3: Verify** `pnpm --filter frontend build` succeeds; `pnpm dev`, open `/login`, toggle macOS appearance → page follows with no white flash on reload in dark.
- [ ] **Step 4: Run** `pnpm --filter frontend test:e2e` — Expected: same pass/fail set as before this task (only colours changed).
- [ ] **Step 5: Commit** `feat(frontend): Apple-style theme tokens and no-flash dark mode`

---

### Task 4: App shell — glass tab bar, centred column, `/trends` route

**Files:**
- Modify: `apps/frontend/src/components/nav.tsx` (rewrite)
- Modify: `apps/frontend/src/app/(app)/layout.tsx`
- Delete: `apps/frontend/src/components/main-layout.tsx` (unused)
- Move: `apps/frontend/src/app/(app)/analytics/` → `apps/frontend/src/app/(app)/trends/` (page, error, loading)
- Modify: `apps/frontend/next.config.ts` (`redirects()`: `/analytics` → `/trends`, `permanent: true`)
- Create: `apps/frontend/src/components/page-header.tsx`
- Move: `apps/frontend/e2e/analytics.spec.ts` → `apps/frontend/e2e/trends.spec.ts` (update `goto` paths)
- Test: `apps/frontend/e2e/navigation.spec.ts`

**Interfaces:**
- Produces:
  - `<PageHeader title: string; subtitle?: string (default: today as "MONDAY, 2 NOV", en-GB, uppercase); action?: ReactNode />` — date line + large bold title; on phone renders a gear `Link` to `/settings` at the right unless on `/settings`.
  - `Nav`: tabs Summary/Coach/Activities/Trends (+ gear pill ≥ md). `aria-label="Main"`, active tab `aria-current="page"`. Active match: `/` exact, others `startsWith`.

- [ ] **Step 1: Write failing E2E** `navigation.spec.ts`: (a) at 1280×800 the `Main` nav shows links "Summary", "Coach", "Activities", "Trends", "Settings" and is in the top half of the viewport; (b) at 390×844 it shows the four tabs (no "Settings" link in nav) and its bounding box is in the bottom quarter; (c) `goto("/analytics")` ends at URL `/trends`; (d) on `/activities/<MOCK_ACTIVITY.id>` the "Activities" tab has `aria-current="page"`.
- [ ] **Step 2: Run** `pnpm --filter frontend test:e2e navigation` — Expected: FAIL.
- [ ] **Step 3: Implement** nav, layout (`max-w-[640px] mx-auto px-4`, top padding for the bar on ≥ md, bottom padding for the bar on phone + `env(safe-area-inset-bottom)`), redirect, route move, `PageHeader`. Pages that need width (trends, activity detail) may opt into `max-w-3xl` via their own wrapper.
- [ ] **Step 4: Run** `pnpm --filter frontend test:e2e navigation trends` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): liquid-glass tab bar and /trends route`

---

### Task 5: Restyle shared UI primitives

**Files:**
- Modify: `apps/frontend/src/components/ui/{card,button,input,textarea,badge,tabs,alert,skeleton,separator}.tsx`
- Modify: `apps/frontend/src/components/error-boundary.tsx`, `apps/frontend/src/app/(app)/{error,loading}.tsx` and each route's `loading.tsx` if they hard-code old styles

**Interfaces:**
- Produces: `Card` = tile (`rounded-[20px] bg-card border-0 shadow-none p-4`); `CardTitle` small coloured-label style is opt-in via a new `MetricLabel` export in `card.tsx`: `<MetricLabel color: "fatigue" | "fitness" | "form" | "coach">` rendering `● Label` in the metric colour. `Button` variants keep names; default = filled pill, `secondary` = grey tint pill, `ghost` unchanged. `Input`/`Textarea` = filled grey (`bg-muted`), no border, radius 12px. `Tabs` = iOS segmented control look.
- Adds `components/ui/segmented.tsx`: `<Segmented<T extends string> value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; aria-label: string />` built on Radix Tabs or buttons with `role="radiogroup"`/`role="radio"` + `aria-checked`. Used by Task 9.

- [ ] **Step 1: Implement** primitives; grep for `glass-strong`, `bg-white/`, `shadow-[` and other old ad-hoc classes in `src/` and remove them where they belong to the old look.
- [ ] **Step 2: Run** `pnpm --filter frontend test:e2e` — Expected: no new failures vs. Task 4 (tests asserting old colour classes like `/emerald/` are fixed in Task 6).
- [ ] **Step 3: Verify** both themes visually on `/login`, `/settings`.
- [ ] **Step 4: Commit** `feat(frontend): Apple-style UI primitives`

---

### Task 6: Summary page with auto coach recap

**Files:**
- Modify: `apps/frontend/src/app/(app)/page.tsx` (rewrite; remove the three weekly charts and `buildWeeklyChartData` — they move in Task 7)
- Create: `apps/frontend/src/components/summary/{metric-tile,form-scale,coach-tile,activity-row}.tsx`
- Modify: `apps/frontend/e2e/dashboard.spec.ts` → rename `summary.spec.ts`

**Interfaces:**
- Consumes: Task 2 HTTP contract; `streamPost` from `lib/api.ts`; `MetricLabel`, `PageHeader`.
- Produces:
  - `<ActivityRow activity: ActivityItem />` — sport icon tile (lucide: ride → `Bike`, virtualride → `MonitorPlay`, run → `Footprints`, weighttraining → `Dumbbell`, swim → `Waves`, default `Activity`) on pale tint, name, `date · distance`, right: bold `h:mm` duration, HR below. Whole row links to `/activities/[id]`. Reused by Task 8.
  - `localDate(): string` in `lib/utils.ts` — browser-local `YYYY-MM-DD`.
  - `<FormScale tsb: number />` — gradient bar red→yellow→green→blue, marker position = clamp((tsb + 30) / 60, 0, 1); label text: `> 5` "Fresh", `< -10` "Fatigued", else "Balanced".
- Coach tile behaviour: `useQuery(["recap", date], GET)`. If `!hasKey` → text "Add your Claude API key in Settings" + link. Else if `recap && !stale` → render markdown. Else start one `streamPost` per (date, mount) — guard with a `useRef` so StrictMode double-mount doesn't start two — showing old content dimmed + "Updating…" when stale; on `[DONE]` invalidate the query. Refresh icon button (`aria-label="Refresh recap"`) forces a new stream. After the existing Sync Strava mutation succeeds, invalidate `["recap"]`.
- Page order: `PageHeader("Summary")` → coach tile → Fatigue + Fitness tiles (2 cols) → Form tile with `FormScale` → "Recent" tile with 5 `ActivityRow`s + "Show all" link → Sync Strava secondary button.

- [ ] **Step 1: Rewrite E2E** `summary.spec.ts` (keep `mockGet`/`mockStream` fixtures; add `mockGet(page, /\/ai\/recommendation\?date=/, …)`):
  - shows ATL/CTL/TSB values (existing assertions, labels "Fatigue", "Fitness", "Form").
  - TSB 14 → "Fresh"; −23 → "Fatigued"; −5 → "Balanced".
  - fresh recap `{ hasKey: true, recap: { content: "Rest day today.", stale: false, … } }` → text visible, **no** POST to `/ai/recommendation` (assert via `page.on("request")` counter = 0).
  - `recap: null` → POST happens once with body `{ date: <YYYY-MM-DD> }`, streamed text "Easy ride" visible.
  - stale recap → old text visible with "Updating…", then streamed text replaces it.
  - `hasKey: false` → "Add your Claude API key in Settings" visible, POST count 0.
  - recent activity row shows name and links to `/activities/<id>`.
- [ ] **Step 2: Run** `pnpm --filter frontend test:e2e summary` — Expected: FAIL.
- [ ] **Step 3: Implement** the page and components.
- [ ] **Step 4: Run** `pnpm --filter frontend test:e2e summary` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): Summary page with auto-loading coach recap`

---

### Task 7: Trends page (charts + weekly report)

**Files:**
- Modify: `apps/frontend/src/app/(app)/trends/page.tsx`
- Create: `apps/frontend/src/components/trends/weekly-chart.tsx` (move `buildWeeklyChartData` here from the old dashboard, unchanged logic)
- Modify: `apps/frontend/e2e/trends.spec.ts`

**Interfaces:**
- Produces: `<WeeklyChart title: string; dataKey: "distance" | "duration" | "avgHr"; data: WeeklyPoint[]; color: string; format: (v: number) => string />` — full-width tile, header shows latest week's value and Δ vs previous week ("+12%"/"−5%", hidden when previous is 0), recharts `AreaChart` with axes + tooltip.
- Page: `PageHeader("Trends")` → Distance (teal), Duration (indigo), Avg HR (pink) charts from `/activities?limit=200` → existing Weekly Report tile (same mutation, restyled; button "Generate report").

- [ ] **Step 1: Add E2E** to `trends.spec.ts`: with two mocked activities in consecutive weeks, the three chart titles "Distance", "Duration", "Avg Heart Rate" are visible and the distance tile shows the Δ text; existing weekly-report tests still pass at `/trends`.
- [ ] **Step 2: Run** `pnpm --filter frontend test:e2e trends` — Expected: FAIL on new test.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): Trends page with weekly charts`

---

### Task 8: Activities list + activity detail

**Files:**
- Modify: `apps/frontend/src/app/(app)/activities/page.tsx`, `apps/frontend/src/app/(app)/activities/[id]/page.tsx`, `apps/frontend/src/components/activity-map.tsx` (rounded tile container)
- Test: `apps/frontend/e2e/activities.spec.ts` (update selectors only)

**Interfaces:**
- Consumes: `ActivityRow`, `PageHeader`, `MetricLabel`.
- List: existing filters become a horizontally scrollable pill row (`Segmented` or pills); rows grouped by month in tiles with a small uppercase month header; existing pagination kept.
- Detail: `PageHeader(title = activity name, subtitle = date)` → 2-col grid of stat tiles (duration, distance, avg HR, elevation, pace, … only those present) → map tile → existing charts each in a tile → existing AI insight tile with Coach colour label. Content max width `max-w-3xl`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `pnpm --filter frontend test:e2e activities` — fix selectors only where labels/structure changed; every existing behaviour assertion must still pass.
- [ ] **Step 3: Commit** `feat(frontend): restyle activities list and detail`

---

### Task 9: Coach, Settings (with Appearance), Login/Setup

**Files:**
- Modify: `apps/frontend/src/app/(app)/coach/page.tsx`, `apps/frontend/src/app/(app)/settings/page.tsx`, `apps/frontend/src/app/(auth)/login/page.tsx`, `apps/frontend/src/app/(auth)/setup/page.tsx`, `apps/frontend/src/app/(auth)/layout.tsx`
- Create: `apps/frontend/e2e/theme.spec.ts`
- Test: `apps/frontend/e2e/{chat,settings,auth}.spec.ts` (selector updates only)

**Interfaces:**
- Consumes: `Segmented`, `Theme`, `parseTheme`, `setThemeCookie`, `PageHeader`.
- Coach: user bubbles right, tinted `bg-metric-coach/15`; coach replies left on tile; input in a `.glass` bar pinned above the phone tab bar / at column bottom on laptop. Sessions: on ≥ md a list tile above the chat collapsible; on phone a "Chats" button opening the list (existing Radix Dialog as a bottom sheet).
- Settings: inset grouped tiles with row separators. First group **Appearance**: `<Segmented aria-label="Appearance" options=System/Light/Dark>`; initial value from `document.documentElement.dataset.theme`; onChange → `setThemeCookie`. Then existing groups (Profile, Claude API key, Strava, …) unchanged in behaviour.
- Login/Setup: single centred tile on bg, `PageHeader`-like title, filled inputs, full-width pill button.

- [ ] **Step 1: Write failing E2E** `theme.spec.ts`: (a) pick "Dark" → `html` has class `dark`; reload → still `dark`, Dark radio `aria-checked="true"`; (b) pick "Light" with `colorScheme: "dark"` emulated → no `dark` class after reload; (c) "System" + emulated dark → `dark` class; (d) cookie `fitcoach_theme=banana` → page loads, `data-theme="system"`.
- [ ] **Step 2: Run** `pnpm --filter frontend test:e2e theme` — Expected: FAIL.
- [ ] **Step 3: Implement** the four pages.
- [ ] **Step 4: Run** `pnpm --filter frontend test:e2e` (full suite) — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(frontend): restyle coach, settings, auth; appearance switch`

---

### Task 10: Final verification

- [ ] **Step 1: Run** `pnpm lint && pnpm --filter api exec tsc --noEmit && pnpm test && pnpm --filter frontend build && pnpm --filter frontend test:e2e` — Expected: all green.
- [ ] **Step 2: Manual pass** in both themes at 1280px and 390px over every route: no leftover old styles (blue gradient bg, outlined cards, Sora font), glass bar readable over scrolled content.
- [ ] **Step 3: Grep** `grep -rn "analytics" apps/frontend/src apps/frontend/next.config.ts` — only the redirect remains.
- [ ] **Step 4: Commit** any fixes `chore: UI refresh cleanup`
