import { API_BASE, expect, mockGet, test } from "./fixtures"

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
})
