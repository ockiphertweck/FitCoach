# Language Switch (DE/EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The whole FitCoach UI and all coach output (recap, chat, activity insight, weekly report) switch between German and English.

**Architecture:** Language is resolved per request on the frontend server (cookie `fitcoach_lang`, else `Accept-Language`, else `en`) by a pure function in `packages/shared`. The root layout passes it into a client `I18nProvider`; every component reads a typed dictionary (`en.ts` is the source, `de.ts` must match its type). The frontend sends `lang` in the body of every AI request; the API picks the recap prompt variant or appends a one-line answer-language instruction.

**Tech Stack:** Next.js 15 App Router, React 19, Fastify v5 + `fastify-type-provider-zod`, Zod, Vitest, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-language-switch-design.md`

## Global Constraints

- Languages: exactly `"de"` and `"en"`; Zod `LangSchema = z.enum(["de", "en"])` in `packages/shared`, reused by API and frontend.
- Cookie: `fitcoach_lang`, values `de` | `en`, absent = automatic; `max-age=31536000; path=/; samesite=lax` (same as `fitcoach_theme`).
- Resolution order: cookie → first `de*`/`en*` entry in `Accept-Language` (in header order, q-values ignored) → `en`.
- Locales for `Intl` / `toLocale*`: `de` → `"de-DE"`, `en` → `"en-GB"`. No hard-coded `"en-GB"`, `"en-US"`, `"en"` left in `apps/frontend/src`.
- No new npm dependency.
- A language switch never triggers a Claude call. `lang` must never enter `computeRecapHash` / `inputHash`, and must not be part of the React Query key that decides recap streaming.
- API keeps returning its current English error strings / codes; the frontend translates them.
- No new `'use client'` only for translations; Server Components use the server helper.
- Stored content (chat messages, recaps, insights, reports, the DB title default `"New chat"`) is never rewritten.
- All commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. `Accept-Language: fr-FR,de;q=0.8` → `de`; `en-US,de;q=0.9` → `en`; `de-CH` → `de` (Task 1 tests).
2. A garbage cookie (`fitcoach_lang=fr`, empty) behaves like automatic, never crashes the layout (Task 1 tests).
3. Server and client render the same language → no hydration warnings on German pages (Task 7 sweep asserts no console error containing `Hydration`).
4. Longer German strings at phone width (390 px) cause no horizontal page scroll (Task 7 sweep).
5. An AI request without `lang` (old client / cached JS) still works and answers in English (Task 2 test: missing `lang` → not 400).

---

### Task 1: Shared language primitives

**Files:**
- Create: `packages/shared/src/lang.ts`
- Modify: `packages/shared/src/index.ts` (re-export), root `package.json` (`test` script)
- Test: `packages/shared/src/lang.test.ts`

**Interfaces:**
- Produces: `LangSchema` (Zod enum), `type Lang = "de" | "en"`, `LANG_COOKIE = "fitcoach_lang"`, `parseLang(value: string | undefined): Lang | null` (null = automatic/invalid), `resolveLanguage(cookie: string | undefined, acceptLanguage: string | null | undefined): Lang`.

- [ ] **Step 1: Write the failing tests** in `lang.test.ts`:
  - `resolveLanguage("de", "en-US")` → `"de"`; `resolveLanguage("en", "de-DE")` → `"en"` (cookie wins)
  - `resolveLanguage(undefined, "de-AT,de;q=0.9")` → `"de"`; `"de-CH"` → `"de"`
  - `resolveLanguage(undefined, "fr-FR,de;q=0.8")` → `"de"`; `"en-US,de;q=0.9"` → `"en"`
  - `resolveLanguage(undefined, "fr")` → `"en"`; `(undefined, "")` → `"en"`; `(undefined, null)` → `"en"`
  - `resolveLanguage("fr", "de-DE")` → `"de"` (invalid cookie = automatic); `parseLang("")` → `null`
- [ ] **Step 2: Run** `pnpm --filter shared test` — expect FAIL (module not found).
- [ ] **Step 3: Implement** `lang.ts`; export everything from `index.ts`. Split the header on `,`, take the part before `;`, lowercase, first one starting with `de` or `en` wins.
- [ ] **Step 4: Change root `package.json` `test`** to `pnpm --filter shared build && pnpm --filter shared test && pnpm --filter api test` (CI runs `pnpm test`).
- [ ] **Step 5: Run** `pnpm test` — expect all PASS.
- [ ] **Step 6: Commit** `feat(shared): language schema and resolver`.

### Task 2: API — answer in the requested language

**Files:**
- Modify: `apps/api/src/prompts/recap-system.ts`, `apps/api/src/prompts/recommendation.ts` (`buildRecapRequest`), `apps/api/src/prompts/system.ts`, `apps/api/src/services/activity-insight.ts`, `apps/api/src/routes/ai.ts`
- Test: `apps/api/src/prompts/recommendation.test.ts`, `apps/api/src/services/activity-insight.test.ts`, new `apps/api/src/routes/ai.test.ts` (mock pattern as in `routes/wellness.test.ts`)

**Interfaces:**
- Consumes: `LangSchema`, `Lang` from `@fitcoach/shared`.
- Produces:
  - `RECAP_SYSTEM_PROMPT: Record<Lang, string>` (the German text unchanged under `de`)
  - `buildRecapRequest(userMessage: string, lang: Lang)`
  - `withLanguage(system: string, lang: Lang): string` in `prompts/system.ts` — returns `` `${system}\n\n${LANGUAGE_INSTRUCTION[lang]}` `` with `LANGUAGE_INSTRUCTION = { de: "Antworte immer auf Deutsch.", en: "Always answer in English." }`
  - `generateActivityInsight(anthropic, activity, profile, userId, lang: Lang = "en")`
  - Request bodies gain `lang: LangSchema.default("en")`: `POST /ai/recommendation` (extend the POST body only — **not** the GET querystring), `POST /ai/chat`, `POST /ai/activity-insight`, `POST /ai/weekly-report` (body `z.object({ lang: LangSchema.default("en") }).default({})`).

English recap system prompt (exact copy, `RECAP_SYSTEM_PROMPT.en`):
```
You are FitCoach, an experienced endurance coach. You give a short daily recommendation in English.
Reply EXACTLY in this format and nothing else:
### <verdict in 2–3 words, e.g. "Easy day", "Hard session", "Rest day">
<1–2 sentences of reasoning from sleep, HRV, Body Battery and training load>
→ <one concrete session with duration and intensity (HR range from max HR or watts from FTP, if given) – or what to do instead on a rest day>
At most 60 words. No introduction, no bullet lists, no follow-up questions.
If recovery data is missing, decide based on training load and do not mention it.
```

- [ ] **Step 1: Write failing tests:**
  - `recommendation.test.ts`: `buildRecapRequest("x", "en").system` contains `"in English"` and `"Easy day"`; `buildRecapRequest("x", "de").system` equals the existing German prompt (update the existing "uses the German recap system prompt" test to pass `"de"`); `max_tokens` unchanged for both.
  - `withLanguage("S", "de")` ends with `"Antworte immer auf Deutsch."`; `"en"` ends with `"Always answer in English."`.
  - `activity-insight.test.ts`: `generateActivityInsight(mock, activity, null, "u1", "de")` passes a `system` ending with the German instruction.
  - `routes/ai.test.ts`: `POST /ai/recommendation` with `{ date, lang: "fr" }` → 400; `POST /ai/weekly-report` with `{ lang: "fr" }` → 400; `POST /ai/activity-insight` without `lang` → not 400 (handler reached; mock `requireAnthropicClient`/db so it returns 404 for an unknown activity).
  - **Regression guard** in `routes/ai.test.ts`: `POST /ai/recommendation` with `lang: "de"` and with `lang: "en"` (same mocked inputs, mocked Anthropic stream yielding one text delta) calls the mocked `upsertRecap` with the **same** `inputHash`.
- [ ] **Step 2: Run** `pnpm --filter api test` — expect the new tests FAIL.
- [ ] **Step 3: Implement.** Recap route passes `lang` to `buildRecapRequest`; chat route uses `withLanguage(systemPrompt, lang)` and appends `` ` Write the title in ${lang === "de" ? "German" : "English"}.` `` to the Haiku title prompt; insight passes `lang`; weekly report uses `withLanguage(SYSTEM_PROMPT, lang)`. Do not touch `computeRecapHash`, `loadRecapInputs`, or the `"New chat"` defaults.
- [ ] **Step 4: Run** `pnpm --filter api test` and `pnpm lint` — expect PASS.
- [ ] **Step 5: Commit** `feat(api): coach answers in requested language`.

### Task 3: Frontend i18n core, Settings row, login

**Files:**
- Create: `apps/frontend/src/lib/i18n/en.ts`, `de.ts`, `index.ts`, `server.ts`, `client.tsx`
- Modify: `apps/frontend/src/app/layout.tsx`, `apps/frontend/src/app/(app)/settings/page.tsx` (Appearance card only), `apps/frontend/src/app/(auth)/login/page.tsx`, `apps/frontend/src/app/(auth)/layout.tsx`
- Test: new `apps/frontend/e2e/language.spec.ts`

**Interfaces:**
- Consumes: `Lang`, `LANG_COOKIE`, `parseLang`, `resolveLanguage` from `@fitcoach/shared`.
- Produces (later tasks only add keys and use these):
  - `en.ts`: `export const en = { … }` grouped by area (`nav`, `home`, `coach`, `activities`, `trends`, `settings`, `auth`, `errors`, `sports`, `common`); values are strings or `(…) => string` for interpolation. `export type Dict = typeof en`.
  - `de.ts`: `export const de: Dict = { … }`.
  - `index.ts`: `getDict(lang: Lang): Dict`, `localeOf(lang: Lang): "de-DE" | "en-GB"`, `translateApiError(message: string, t: Dict): string` (maps `"Invalid email or password"`, `"User already exists. FitCoach is single-user."`, `"Recap generation failed"`, `"key_invalid"`, `"not_connected"`, `"Activity not found"`, `"Session not found"`, `"User not found"` to `t.errors.*`; anything else → `t.errors.generic`).
  - `server.ts`: `getLang(): Promise<Lang>` (reads `cookies()` + `headers().get("accept-language")`), `getI18n(): Promise<{ lang: Lang; t: Dict; locale: string }>`.
  - `client.tsx` (`'use client'`): `I18nProvider({ lang, children })`, `useI18n(): { lang: Lang; t: Dict; locale: string }`, `setLangCookie(lang: Lang | "auto"): void` (`auto` deletes the cookie via `max-age=0`).
- Root layout: `<html lang={lang}>`, wraps children in `I18nProvider`, `generateMetadata` returns translated `title`/`description`.

- [ ] **Step 1: Write failing E2E** `language.spec.ts`:
  - default `en-US` browser: `/login` shows the English sign-in heading; `html[lang="en"]`.
  - `test.use({ locale: "de-DE" })`: `/login` shows the German heading, `html[lang="de"]`; wrong password (mock `POST /auth/login` 401 `{ error: "Invalid email or password" }`) shows the German error text.
  - authed, `/settings`: radiogroup named `"Language"` (its aria-label comes from the dictionary: `"Sprache"` in German) → click `"Deutsch"` → page heading becomes `"Einstellungen"`, `html[lang="de"]`; reload → still German and `"Deutsch"` is `aria-checked="true"`; click `"Automatisch"` → English again (en-US browser) and cookie `fitcoach_lang` is gone.
- [ ] **Step 2: Run** `pnpm --filter frontend test:e2e language.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** the i18n files, root layout, Settings "Language" row (existing `Segmented`, options Automatisch/Automatic · Deutsch · English — the two language names are never translated; on change `setLangCookie` then `router.refresh()`), and translate the login page + auth layout. Translate the whole Appearance card while there.
- [ ] **Step 4: Run** the new spec plus `theme.spec.ts` and `auth.spec.ts` — expect PASS. Run `pnpm lint`.
- [ ] **Step 5: Commit** `feat(frontend): language switch core and settings`.

### Task 4: Translate shell and Home

**Files:** `components/nav.tsx`, `components/page-header.tsx`, `components/error-boundary.tsx`, `components/summary/*` (`coach-tile.tsx`, `recovery-tiles.tsx`, `activity-row.tsx`, `metric-tile.tsx`, `form-scale.tsx`), `app/(app)/page.tsx`, `app/(app)/layout.tsx`, every `loading.tsx` / `error.tsx` under `app/`, `lib/garmin.ts` (user-visible strings only).

**Interfaces:** Consumes `useI18n`/`getI18n`, `localeOf`, `translateApiError`; adds keys to `en.ts`/`de.ts`; sport names via `t.sports[sportType]` with fallback to the raw value.

- [ ] **Step 1:** Coach tile sends `{ date, lang }` to `POST /ai/recommendation`; `lang` is **not** added to the recap query key or `needsStream`. Extend `summary.spec.ts`: the intercepted recap POST body contains `lang: "en"`, and after switching to Deutsch with a stored non-stale recap, **no** recap POST is made (route counter = 0).
- [ ] **Step 2:** Run it — expect FAIL. Translate all listed files; replace hard-coded locales with `locale`.
- [ ] **Step 3:** Run `summary.spec.ts`, `navigation.spec.ts`, `layout-widths.spec.ts` — PASS; `pnpm lint`.
- [ ] **Step 4: Commit** `feat(frontend): translate shell and home`.

### Task 5: Translate Coach and Trends

**Files:** `app/(app)/coach/page.tsx`, `app/(app)/trends/page.tsx`, `components/trends/weekly-chart.tsx`, `components/markdown.tsx` (if it has text).

- [ ] **Step 1:** Extend `chat.spec.ts`: the `POST /ai/chat` body contains `lang`; a session titled `"New chat"` is shown as `t.coach.newChat` (German: `"Neuer Chat"`) when the UI is German. Extend `trends.spec.ts`: `POST /ai/weekly-report` body contains `lang`.
- [ ] **Step 2:** Run — FAIL. Translate; display title `session.title === "New chat" ? t.coach.newChat : session.title`; pass `lang` in both requests.
- [ ] **Step 3:** Run `chat.spec.ts`, `trends.spec.ts` — PASS; `pnpm lint`.
- [ ] **Step 4: Commit** `feat(frontend): translate coach and trends`.

### Task 6: Translate Activities, Settings, Setup

**Files:** `app/(app)/activities/page.tsx`, `app/(app)/activities/[id]/page.tsx`, `components/activity-map.tsx`, `app/(app)/settings/page.tsx` (rest of the page incl. `relativeUnit`'s `Intl.RelativeTimeFormat`), `app/(auth)/setup/page.tsx`.

- [ ] **Step 1:** Extend `activities.spec.ts`: `POST /ai/activity-insight` body contains `lang`; sport filter options use translated names. Extend `settings.spec.ts` only where it asserts text that moved.
- [ ] **Step 2:** Run — FAIL. Translate; `lang` in the insight request; garmin errors via `translateApiError`.
- [ ] **Step 3:** Run `activities.spec.ts`, `settings.spec.ts`, `auth.spec.ts` — PASS. `grep -rnE '"en-(GB|US)"|"en"\)' apps/frontend/src` returns only `lib/i18n/index.ts`. `pnpm lint`.
- [ ] **Step 4: Commit** `feat(frontend): translate activities, settings, setup`.

### Task 7: German sweep, docs

**Files:** `apps/frontend/e2e/language.spec.ts` (extend), `README.md`.

- [ ] **Step 1:** Add a `de-DE` sweep: for `/`, `/coach`, `/activities`, `/activities/<mock id>`, `/trends`, `/settings`, `/login` (unauthed context), `/setup` (mock `/auth/status`): assert one known German string per page, assert none of a list of English UI words (`"Settings"`, `"Activities"`, `"Refresh recap"` aria-label, `"Loading"`) is visible, assert no console error containing `"Hydration"`, and at 390 px width `document.documentElement.scrollWidth <= innerWidth`.
- [ ] **Step 2:** Run — fix any leftover strings it finds.
- [ ] **Step 3:** README: Features gets a line *Language — German or English (follows the browser, switchable in Settings); the coach answers in the chosen language*; Data Privacy unchanged (no new data sent).
- [ ] **Step 4:** Full verification: `pnpm lint`, `pnpm test`, `pnpm --filter frontend test:e2e` — all PASS.
- [ ] **Step 5: Commit** `test(e2e): german sweep; docs: language switch`.
