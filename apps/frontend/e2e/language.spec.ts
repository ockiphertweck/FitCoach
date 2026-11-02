import type { Page } from "@playwright/test"
import { API_BASE, MOCK_ACTIVITY, expect, mockGet, test } from "./fixtures"

const mockAuthStatus = (page: import("@playwright/test").Page) =>
  page.route(`${API_BASE}/auth/status`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ setup: true }),
    })
  )

test.describe("Language", () => {
  test.describe("English browser", () => {
    test("login is English", async ({ page }) => {
      await mockAuthStatus(page)
      await page.goto("/login")
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
      await expect(page.locator("html")).toHaveAttribute("lang", "en")
    })
  })

  test.describe("German browser", () => {
    test.use({ locale: "de-DE" })

    test("login is German, including API errors", async ({ page }) => {
      await mockAuthStatus(page)
      await page.route(`${API_BASE}/auth/login`, (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Invalid email or password" }),
        })
      )
      await page.goto("/login")
      await expect(page.getByRole("heading", { name: "Willkommen zurück" })).toBeVisible()
      await expect(page.locator("html")).toHaveAttribute("lang", "de")
      await page.getByLabel("E-Mail").fill("test@example.com")
      await page.locator("#password").fill("wrongpassword")
      await page.getByRole("button", { name: "Anmelden" }).click()
      await expect(page.getByText("E-Mail oder Passwort ist falsch")).toBeVisible()
    })
  })

  test.describe("Settings", () => {
    test.beforeEach(async ({ authedPage }) => {
      await mockGet(authedPage, "/settings/apikey", { providers: [] })
      await mockGet(authedPage, "/settings/profile", {
        sex: null,
        weightKg: null,
        heightCm: null,
        maxHeartRate: null,
        ftpWatts: null,
      })
    })

    test("Deutsch persists, Automatisch returns to the browser language", async ({
      authedPage: page,
      context,
    }) => {
      await page.goto("/settings")
      await page
        .getByRole("radiogroup", { name: "Language" })
        .getByRole("radio", { name: "Deutsch" })
        .click()
      await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible()
      await expect(page.locator("html")).toHaveAttribute("lang", "de")

      await page.reload()
      const german = page.getByRole("radiogroup", { name: "Sprache" })
      await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible()
      await expect(german.getByRole("radio", { name: "Deutsch" })).toHaveAttribute(
        "aria-checked",
        "true"
      )

      await german.getByRole("radio", { name: "Automatisch" }).click()
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
      await expect(page.locator("html")).toHaveAttribute("lang", "en")
      const cookies = await context.cookies()
      expect(cookies.find((c) => c.name === "fitcoach_lang")).toBeUndefined()
    })
  })

  test.describe("German sweep", () => {
    test.use({ locale: "de-DE" })

    // Exact English UI labels from en.ts that must never show on a German screen.
    const ENGLISH = [
      "Settings",
      "Activities",
      "Recent",
      "Show all",
      "Loading",
      "Loading…",
      "Start a conversation",
      "Weekly Report",
      "Athlete Profile",
      "Appearance",
      "Welcome back",
      "Welcome to FitCoach",
      "Sign in",
      "Create account",
      "Heart Rate Zones",
      "Sync now",
      "Distance",
      "Duration",
    ]

    const homeStatus = {
      connected: true,
      status: "idle",
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      keyExpiresAt: null,
    }

    async function mockAll(page: Page) {
      await mockGet(page, /\/garmin\/status/, homeStatus)
      await mockGet(page, /\/wellness\?/, { today: null, days: [] })
      await mockGet(page, "/activities/stats", { atl: 50, ctl: 55, tsb: -5 })
      await mockGet(page, "/activities?limit=5", { items: [MOCK_ACTIVITY], total: 1 })
      await mockGet(page, /\/ai\/recommendation\?date=/, {
        hasKey: true,
        recap: { content: "Cached.", stale: false, generatedAt: new Date().toISOString() },
      })
      await mockGet(page, "/ai/chat/sessions", {
        sessions: [
          { id: "s1", title: "Neuer Chat", createdAt: "2026-04-01", updatedAt: "2026-04-01" },
        ],
      })
      await mockGet(page, /\/ai\/chat\/history\?sessionId=/, { messages: [] })
      await mockGet(page, /\/activities\?limit=20&/, { items: [MOCK_ACTIVITY], total: 1 })
      await mockGet(page, /\/activities\?limit=200/, { items: [MOCK_ACTIVITY], total: 1 })
      await mockGet(page, `/activities/${MOCK_ACTIVITY.id}`, MOCK_ACTIVITY)
      await mockGet(page, "/settings/apikey", { providers: [] })
      await mockGet(page, "/settings/profile", {
        sex: null,
        weightKg: null,
        heightCm: null,
        maxHeartRate: null,
        ftpWatts: null,
      })
    }

    const PAGES: { path: string; german: string; authed: boolean }[] = [
      { path: "/", german: "Zuletzt", authed: true },
      { path: "/coach", german: "Starte eine Unterhaltung", authed: true },
      { path: "/activities", german: "Aktivitäten", authed: true },
      { path: `/activities/${MOCK_ACTIVITY.id}`, german: "Distanz", authed: true },
      { path: "/trends", german: "Wochenbericht", authed: true },
      { path: "/settings", german: "Darstellung", authed: true },
      { path: "/login", german: "Willkommen zurück", authed: false },
      { path: "/setup", german: "Willkommen bei FitCoach", authed: false },
    ]

    for (const { path, german, authed } of PAGES) {
      test(`${path} has no English UI, no hydration errors, no overflow at 390px`, async ({
        authedPage: page,
      }) => {
        const errors: string[] = []
        page.on("console", (m) => {
          if (m.type() === "error") errors.push(m.text())
        })
        await mockAll(page)
        if (!authed) {
          await page.context().clearCookies()
          await page.route(`${API_BASE}/auth/me`, (r) => r.fulfill({ status: 401, json: {} }))
          await page.route(`${API_BASE}/auth/status`, (r) =>
            r.fulfill({ json: { setup: path === "/login" } })
          )
        }
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(path)
        await expect(page.getByText(german, { exact: true }).first()).toBeVisible()
        await page.waitForLoadState("networkidle")

        for (const word of ENGLISH) {
          await expect(page.getByText(word, { exact: true }), word).toHaveCount(0)
        }
        await expect(page.getByLabel("Refresh recap")).toHaveCount(0)
        expect(errors.filter((e) => /hydrat|did not match/i.test(e))).toEqual([])
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        )
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }
  })
})
