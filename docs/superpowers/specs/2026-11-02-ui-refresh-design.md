# FitCoach UI refresh — design

Date: 2026-11-02
Status: draft, awaiting approval

## Intent

The current UI feels dated ("everything… it's not modern"). The owner wants FitCoach to look
and feel like **Bevel / the new Apple Health**: calm, light, card-based, big numbers, colour
that means something. Today it's used on a laptop; it should later become a phone app, so
the UI must already be mobile-first and feel like an app on a big screen.

Success: opening FitCoach on the laptop or a phone browser feels like a native Apple-style
health app, in light or dark, and today's coaching advice is just *there* without pressing
a button.

## Goals

1. Restyle **every screen** in the Apple Health light style (direction "B" from the mockups).
2. New navigation: centred phone-width column + floating **liquid-glass** tab bar
   (top on laptop, bottom on phone).
3. **Dark mode** with a System / Light / Dark switch in Settings that persists.
4. **Daily coach recap loads automatically** on the Summary page, and is redone whenever the
   training data behind it changed (new day, new/edited/deleted activity, profile change).

## Non-goals

- No new features, pages or data beyond those listed here. Same API calls (plus the recap
  endpoints below). The only content move: the weekly charts go from Summary to Trends.
- No native/PWA app in this pass (only make the web UI ready to look right on a phone).
- Garmin integration — separate project, brainstormed next.
- No syncing of the theme choice across devices.

## Anti-goals (would be a failure even if it works)

- Looking like a generic admin dashboard (outlined cards, wide tables, sidebars).
- Colour used for decoration instead of meaning.
- A white flash on load in dark mode.
- An automatic Claude call when nothing relevant changed (same day, same data), or a burst of
  calls while a sync is importing activities.

## Visual language

Reference mockups: `.superpowers/brainstorm/86546-1793611081/content/visual-style.html`
(option B), `layout.html` (option B), `glass.html`.

- **Background** `#f2f2f7` (light) / `#000` (dark). Content on tiles: `#fff` / `#1c1c1e`,
  radius ~20px, no borders, no or barely visible shadow.
- **Font**: system stack (`-apple-system, "SF Pro Display", system-ui, …`). Drop Sora and
  DM Sans. Big bold numbers with tight letter-spacing (~-0.02em).
- **Page header**: small grey uppercase date line ("MONDAY, 2 NOV") above a large bold title.
- **Metric colours (fixed everywhere, slightly brighter in dark)**:
  Fatigue/ATL orange `#ff9500`-ish, Fitness/CTL blue `#007aff`, Form/TSB green `#34c759`,
  Coach purple `#af52de`. Metric tiles carry a small coloured `●` label.
- **Metric tiles** show the value plus a small sparkline of its recent trend.
- **Form (TSB)** shown on a horizontal scale (tired → fresh, red→yellow→green→blue) with a
  marker, replacing the "Moderate" badge.
- **Activity rows**: rounded square icon on a pale sport-tint background, name + date/distance,
  right-aligned bold duration with HR below. Rows grouped inside one tile with hairline separators.
- Sport icons: use `lucide-react` (already installed), not emoji.

## Navigation & layout

- Old left icon sidebar, "F" logo block and ambient gradient background are removed.
- Content column: centred, max width roughly phone-to-tablet (~640px; builder may widen for
  charts/detail pages if it reads better).
- **Tabs**: Summary · Coach · Activities · Trends, plus Settings.
  - Laptop: floating glass capsule pinned at the top centre; Settings is a gear pill in it.
  - Phone (< md breakpoint): floating glass capsule at the bottom with icon + label; Settings
    moves to a gear button in the page header (four tabs only).
- Renames: "Dashboard" → **Summary**, "Analytics"/"Reports"/"Weekly Report" → **Trends**.
  URLs may change (owner OK'd it): `/analytics` → **`/trends`**; Summary stays at `/` *(Claude's
  call: root is the natural home)*; `/coach`, `/activities`, `/settings` unchanged. Add a permanent
  redirect `/analytics` → `/trends` in `next.config` so old bookmarks keep working. Update
  `nav.tsx`, `middleware.ts` matchers if any, and `e2e/analytics.spec.ts` (rename to `trends.spec.ts`).
- **Liquid glass**: translucent white (dark: smoked) gradient, `backdrop-filter: blur(~18px)
  saturate(180%)`, thin bright border, inner top highlight, soft drop shadow, full pill radius;
  active tab is a brighter inner pill. Respect `prefers-reduced-transparency` by falling back to
  a solid tile colour.

## Screens

All screens keep their current content and behaviour; they're re-laid-out in the language above.

- **Summary** (`/`): header → Coach tile (today's recommendation, see below) → Fatigue + Fitness
  tiles side by side → Form tile with scale → Recent activities tile → Sync Strava action.
  *Builder's call* on exact order; the mockup puts metrics first, coach tile is acceptable either
  above or below metrics.
- **Coach** (`/coach`): chat in the column, iMessage-like bubbles (user bubble tinted, coach on a
  tile), input in a glass bar above the tab bar on phone. Existing chat sessions UI stays,
  restyled (sessions as a list/sheet rather than a sidebar on phone).
- **Activities** (`/activities`) and **Activity detail** (`/activities/[id]`): list = grouped
  rows as above; detail = big header stats as tiles, map and charts inside tiles.
- **Trends** (`/analytics`): the three weekly charts that are on the Dashboard today
  (Distance, Duration, Avg HR, built from `/activities?limit=200` in `app/(app)/page.tsx`)
  **move here** (owner's decision: "in trends it's better with more detail"). Each chart gets its
  own full-width tile, larger than today, with axis labels and a tooltip, with its current value
  and the change vs. last week in the tile header. Chart colours are their own (not the
  ATL/CTL/TSB/Coach colours), e.g. distance teal, duration indigo, HR pink/red. The existing AI
  Weekly Report stays on this page as its own tile, below the charts. No new data or endpoints.
- **Settings**: Apple Settings-style grouped lists (inset grouped tiles with row separators);
  add the Appearance control here.
- **Login / Setup**: centred single tile on the grey background, same type and inputs.
- Shared primitives in `components/ui/*` (card, button, input, badge, tabs, …) are restyled so
  pages inherit the look; avoid one-off styles per page.

## Dark mode

- Settings → **Appearance**: segmented control **System · Light · Dark**, default System.
- *(Claude's call)* Stored in a cookie (`fitcoach_theme`, 1 year). The root layout reads it
  server-side and sets `class="dark"` (or nothing for light) on `<html>`; for "System" a tiny
  inline script in `<head>` applies `dark` from `prefers-color-scheme` before paint and listens
  for changes. No flash in any mode.
- Tailwind is already `darkMode: ["class"]`; define all tokens in `globals.css` under `:root`
  and `.dark`.

## Daily coach recap (auto, redone on change)

Today it streams only when "Get recommendation" is pressed and is never stored.

Owner's rule: the recap must reflect the latest data — if something changed or was added, redo it.

- *(Claude's call)* New table `daily_recommendations (id, userId → users cascade, date (date),
  inputHash text, content text, tokensUsed int null, generatedAt timestamp)`,
  `UNIQUE(userId, date)` — modelled on `weekly_reports`. Generated via `schema.ts` +
  `drizzle-kit generate`.
- **Change detection** *(Claude's call)*: `inputHash` = sha256 of the data that drives the recap —
  for each activity in the 42-day window its id + the fields `computeInsightHash` already uses
  (reuse it from `services/activity-insight.ts`), plus the athlete profile fields, plus the date.
  Recent **chat messages are excluded** from the hash (they're still in the prompt), so chatting
  with the coach doesn't trigger a new recap. Volatile Strava fields (kudos etc.) don't count.
  New, edited or deleted activities and profile edits all change the hash.
- `GET /ai/recommendation?date=YYYY-MM-DD` → `{ content, generatedAt, stale }` or `null`, where
  `stale` = stored hash ≠ current hash.
- `POST /ai/recommendation` (existing SSE stream) takes `{ date }`, and after the stream completes
  upserts content + the hash computed **at the start** of generation for that user+date. Logic
  lives in a service, not the route. The prompt's `**Date**` line uses the passed date instead of
  the server's UTC date.
- Regeneration is **lazy**: it happens only when the Summary page is opened and finds the recap
  missing or stale — never from the sync/webhook path. A sync importing 20 activities therefore
  costs one call at most, on the next visit.
- While a stale recap is being redone, the tile keeps showing the old text (dimmed, "Updating…")
  and swaps in the new one as it streams.
- *(Claude's call)* If the browser disconnects mid-stream (tab closed, navigated away), the server
  keeps consuming the Claude stream to the end and still saves it, so the next visit doesn't pay
  for a second call. Writes to a closed connection are skipped, not fatal. If Claude itself errors
  partway, nothing is saved (the next visit retries).
- The date is the **browser's local date** so "once per day" matches the user's day.
- Summary page: query GET; if `null` or `stale`, start the stream automatically and render it
  live in the coach tile; otherwise show the stored text instantly. After a manual Strava sync on
  the Summary page, refetch GET so a stale recap is redone right away.
- Guard against double generation (React strict mode, two tabs): frontend starts at most one
  stream per mount; server upsert means a race costs at most one extra call, no duplicate rows.
- A small **refresh** button on the tile regenerates (overwrites today's row) on demand.
- No Claude key configured → tile shows "Add your Claude API key in Settings" with a link, no call.
- Auth: same JWT preHandler as all `/ai/*` routes; Zod schemas for the `date` query/body.

## Constraints

- Next.js 15 App Router, Tailwind 3, shadcn/ui primitives, lucide-react, recharts — no new UI
  dependencies needed.
- Project rules in `CLAUDE.md` apply (services hold logic, Zod everywhere, no PII in logs,
  generated migrations only).
- Existing Playwright specs (`apps/frontend/e2e/*.spec.ts`) select by role/text; update them
  for renamed labels and the auto-loading recommendation (it no longer needs a button click).
- Tests required: unit tests for the new recommendation service, including the hash (changes on
  new/edited/deleted activity and profile edit, unchanged on kudos/chat); E2E for theme switch
  persistence (reload keeps the choice), auto-loaded recap (fresh → shown, missing/stale →
  streamed), and the `/analytics` → `/trends` redirect.

## Left to the builder

- Exact spacing, font sizes, breakpoints, icon choices, sparkline data source (reuse what the
  dashboard/analytics already fetch; if no history endpoint exists, leave sparklines out rather
  than add an endpoint), chart styling details.
- Whether the glass tab bar uses an extra SVG/filter for edge refraction (nice-to-have only).
- README screenshots refresh after the work lands.
