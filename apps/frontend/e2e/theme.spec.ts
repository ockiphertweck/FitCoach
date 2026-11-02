import { expect, mockGet, test } from "./fixtures"

test.describe("Appearance", () => {
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

  const radio = (page: import("@playwright/test").Page, name: string) =>
    page.getByRole("radiogroup", { name: "Appearance" }).getByRole("radio", { name })

  test("Dark persists across reload", async ({ authedPage: page }) => {
    await page.goto("/settings")
    await radio(page, "Dark").click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await expect(radio(page, "Dark")).toHaveAttribute("aria-checked", "true")
  })

  test("Light overrides an OS dark preference", async ({ authedPage: page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await page.goto("/settings")
    await radio(page, "Light").click()
    await page.reload()
    await expect(page.locator("html")).not.toHaveClass(/dark/)
    await expect(radio(page, "Light")).toHaveAttribute("aria-checked", "true")
  })

  test("System follows the OS, live, without reload", async ({ authedPage: page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await page.goto("/settings")
    await radio(page, "Light").click()
    await expect(page.locator("html")).not.toHaveClass(/dark/)
    await radio(page, "System").click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.emulateMedia({ colorScheme: "light" })
    await expect(page.locator("html")).not.toHaveClass(/dark/)
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("html")).toHaveClass(/dark/)
  })

  test("invalid cookie falls back to system", async ({ authedPage: page, context }) => {
    await context.addCookies([
      { name: "fitcoach_theme", value: "banana", domain: "localhost", path: "/" },
    ])
    await page.goto("/settings")
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system")
    await expect(radio(page, "System")).toHaveAttribute("aria-checked", "true")
  })

  test("arrow keys move the selection and theme", async ({ authedPage: page }) => {
    await page.goto("/settings")
    await radio(page, "System").click()
    await radio(page, "System").focus()
    await page.keyboard.press("ArrowRight")
    await expect(radio(page, "Light")).toHaveAttribute("aria-checked", "true")
    await expect(page.locator("html")).not.toHaveClass(/dark/)
    await page.keyboard.press("ArrowRight")
    await expect(radio(page, "Dark")).toHaveAttribute("aria-checked", "true")
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.keyboard.press("ArrowLeft")
    await expect(radio(page, "Light")).toHaveAttribute("aria-checked", "true")
    await expect(page.locator("html")).not.toHaveClass(/dark/)
  })
})
