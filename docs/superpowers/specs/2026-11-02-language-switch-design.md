# Language switch (German / English) — Design

Date: 2026-11-02 · Status: draft for owner review

## Why

FitCoach is published on GitHub for others to self-host. People should be able to run it in their
own language. First step: German and English. Today the UI is almost entirely English with a few
hard-coded `en-GB`/`en-US` date and number formats, and the daily recap prompt is hard-coded German.

## Goals

- Two languages: `de` and `en`.
- **Which language applies** (owner decision):
  1. The language chosen in Settings, if any.
  2. Otherwise the browser language: `de` if the browser prefers German, else **`en`**.
  This applies everywhere, including the login and setup pages before an account exists.
- The **whole UI** switches: every page, button, label, empty state, error message, `aria-label`,
  page `<title>`, and date/number formatting (e.g. `1.234,5` and "3. Nov." in German).
  `<html lang>` follows the active language.
- **The coach answers in the active language**: daily recap, chat, activity insight (activity
  detail page) and weekly report (Trends page).
- Switching language **never triggers a Claude call by itself** (owner decision; cost). A recap
  already generated today stays in its language until the user presses the existing refresh button
  on the coach tile. The same applies to a stored activity insight or weekly report.

## Non-goals

- More than two languages. (The structure should make adding a third one a matter of adding one
  dictionary file, but nothing beyond that.)
- Translating stored content: old chat messages, stored recaps, insights and weekly reports stay as
  they were written.
- Translating the README / docs.
- Per-language URLs (`/de/...`) or SEO — this is a private single-user app.

## Anti-goals (would make it a failure even if it works)

- A language switch that silently regenerates the recap (costs money). In particular the language
  must **not** become part of the recap `inputHash`, or the stored recap would turn `stale` and the
  coach tile would auto-stream a new one.
- Half-translated screens: an English string left over on a German page.
- A flash of the wrong language on first paint.

## Constraints

- Project rules in `CLAUDE.md` apply: Zod schema for every new body/query field, logic in
  `services/`, no PII in logs, tests for every new function and an E2E test for the user flow.
- No new data is sent externally: the only addition to Claude requests is an instruction about
  the answer language.
- Server Components stay the default; no new `'use client'` just for translations.

## Decided

- **Settings control:** a row "Language / Sprache" in the Settings "Appearance" area, next to the
  Theme row, using the existing `Segmented` component with three options:
  *Automatic* (browser language) · *Deutsch* · *English*. *(My call, mirrors Theme's
  System/Light/Dark so "not chosen" can be restored.)*
- **Persistence:** a cookie `fitcoach_lang` (`de` | `en`; absent = automatic), set for one year,
  exactly like `fitcoach_theme` in `apps/frontend/src/lib/theme.ts`. Works before login and needs
  no database migration. *(My call.)* Changing it reloads/refreshes the page so server-rendered
  text switches too.
- **Resolution** lives in one small pure function, e.g. `resolveLanguage(cookieValue,
  acceptLanguageHeader): "de" | "en"`, used by the root layout (server) — cookie first, then the
  first `de*`/`en*` entry in `Accept-Language`, else `en`.
- **No i18n dependency.** *(My call.)* Plain typed dictionaries: `en.ts` is the source of truth,
  `de.ts` is typed as `typeof en`, so a missing German key is a TypeScript error. Server Components
  get the dictionary from the resolved language; Client Components read it from a small React
  context provided in the root layout. Dates/numbers use `Intl` / `toLocale*` with the active
  locale (`de-DE` / `en-GB`) instead of the hard-coded `"en-GB"` / `"en-US"` / `"en"` calls.
- **API side:** the frontend sends the active language with each AI request (`lang: "de" | "en"`,
  Zod enum, default `en`) on `POST /ai/recommendation`, `POST /ai/chat`,
  `POST /ai/activity-insight`, `POST /ai/weekly-report`. The API does not read the frontend cookie
  (frontend and API may live on different domains).
- **Prompts:** the recap system prompt gets a proper English version next to the German one (its
  format examples like "Lockerer Tag" are language-specific). Chat, activity insight and weekly
  report keep their prompt and get a one-line answer-language instruction.
- **API error texts** the user can see (e.g. "Invalid email or password", "User already exists",
  SSE "Recap generation failed", Garmin `key_invalid`) are translated in the frontend, keyed by
  HTTP status / error code; unknown errors fall back to a translated generic message. The API keeps
  returning its current English/code strings.

- **Chat titles:** the stored default title "New chat" (DB default, set in `routes/ai.ts`) stays
  in the database and is translated in the frontend when displayed. The short title Claude writes
  after the first message follows `lang`. *(My call.)*
- **Page titles:** translated `<title>` via `generateMetadata` in server layouts, since most pages
  are Client Components. *(My call.)*
- **Garmin sport type names** shown in the UI are translated too (they come from
  `SportTypeSchema` values). *(My call.)*
- **Recap data block:** only the recap system prompt gets an English version; the data block
  sent to Claude keeps using the shared formatters in `prompts/_format.ts`. *(My call.)*

## Left to the builder

- File layout of the dictionaries and the exact key naming.
- How the settings change re-renders server text (e.g. `router.refresh()` vs. full reload).
- Whether the stored weekly report / activity insight need a visible "regenerate" — only if one
  already exists; do not add new buttons for this.

## Testing

- Unit (Vitest): `resolveLanguage` (cookie wins, `de-AT` → `de`, `fr` → `en`, empty → `en`);
  each prompt builder produces the right answer-language instruction / recap variant for `de` and
  `en`; the AI routes accept `lang` and reject other values; **regression guard: the recap input
  hash is identical for `de` and `en`**.
- E2E (Playwright): default English with an `en-US` browser; German on the login page with a
  `de-DE` browser locale; switching to Deutsch in Settings turns the UI German and survives a
  reload; switching back to Automatic restores the browser language. One E2E pass visits every
  page in German and checks a few known strings, because the `de.ts` type check cannot catch text
  that was never moved into the dictionary. Existing English assertions
  keep passing because Playwright's default locale is `en-US`.
