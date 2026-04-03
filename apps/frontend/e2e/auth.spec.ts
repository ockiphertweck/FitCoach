import { expect, test } from "@playwright/test"
import { API_BASE, generateTestToken } from "./fixtures"

test.describe("Authentication", () => {
  test.describe("Unauthenticated redirects", () => {
    test("visiting / redirects to /login", async ({ page }) => {
      await page.route(`${API_BASE}/**`, (route) => route.abort())
      await page.goto("/")
      await expect(page).toHaveURL(/\/login/)
    })

    test("visiting /activities redirects to /login", async ({ page }) => {
      await page.route(`${API_BASE}/**`, (route) => route.abort())
      await page.goto("/activities")
      await expect(page).toHaveURL(/\/login/)
    })

    test("visiting /coach redirects to /login", async ({ page }) => {
      await page.route(`${API_BASE}/**`, (route) => route.abort())
      await page.goto("/coach")
      await expect(page).toHaveURL(/\/login/)
    })
  })

  test.describe("Authenticated redirects", () => {
    test("visiting /login when authenticated redirects to /", async ({ page, context }) => {
      const token = await generateTestToken()
      await context.addCookies([
        { name: "fitcoach_token", value: token, domain: "localhost", path: "/" },
      ])
      await page.route(`${API_BASE}/**`, (route) => route.abort())
      await page.goto("/login")
      await expect(page).toHaveURL(/\/$/)
    })

    test("visiting /setup when authenticated redirects to /", async ({ page, context }) => {
      const token = await generateTestToken()
      await context.addCookies([
        { name: "fitcoach_token", value: token, domain: "localhost", path: "/" },
      ])
      await page.route(`${API_BASE}/**`, (route) => route.abort())
      await page.goto("/setup")
      await expect(page).toHaveURL(/\/$/)
    })
  })

  test.describe("Login page", () => {
    test.beforeEach(async ({ page }) => {
      await page.route(`${API_BASE}/auth/status`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ setup: true }),
        })
      )
    })

    test("renders sign-in form", async ({ page }) => {
      await page.goto("/login")
      await expect(page.getByText("Welcome back")).toBeVisible()
      await expect(page.getByLabel("Email")).toBeVisible()
      await expect(page.locator("#password")).toBeVisible()
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
    })

    test("sign-in button disabled when fields empty", async ({ page }) => {
      await page.goto("/login")
      await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled()
    })

    test("sign-in button disabled with only email filled", async ({ page }) => {
      await page.goto("/login")
      await page.getByLabel("Email").fill("test@example.com")
      await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled()
    })

    test("successful login redirects to dashboard", async ({ page }) => {
      const validToken = await generateTestToken()
      // Catch-all registered FIRST so the specific handler (added last) wins in Playwright's LIFO matching
      await page.route(`${API_BASE}/**`, (route) => route.abort())
      await page.route(`${API_BASE}/auth/login`, async (route) => {
        // Include Set-Cookie header so the browser stores the token before the router navigates to /
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "Set-Cookie": `fitcoach_token=${validToken}; Path=/; SameSite=Lax`,
          },
          body: JSON.stringify({ id: "user-1", email: "test@example.com" }),
        })
      })
      await page.goto("/login")
      await page.getByLabel("Email").fill("test@example.com")
      await page.locator("#password").fill("mypassword")
      await page.getByRole("button", { name: "Sign in" }).click()
      await expect(page).toHaveURL(/\/$/)
    })

    test("wrong password shows error alert", async ({ page }) => {
      await page.route(`${API_BASE}/auth/login`, (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Invalid email or password" }),
        })
      )
      await page.goto("/login")
      await page.getByLabel("Email").fill("test@example.com")
      await page.locator("#password").fill("wrongpassword")
      await page.getByRole("button", { name: "Sign in" }).click()
      await expect(page.getByText("Invalid email or password")).toBeVisible()
    })

    test("password toggle shows/hides password text", async ({ page }) => {
      await page.goto("/login")
      const passwordInput = page.locator("#password")
      await expect(passwordInput).toHaveAttribute("type", "password")
      await page.locator('button[tabindex="-1"]').click()
      await expect(passwordInput).toHaveAttribute("type", "text")
      await page.locator('button[tabindex="-1"]').click()
      await expect(passwordInput).toHaveAttribute("type", "password")
    })

    test("redirects to /setup when no account exists", async ({ page }) => {
      await page.unroute(`${API_BASE}/auth/status`)
      await page.route(`${API_BASE}/auth/status`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ setup: false }),
        })
      )
      await page.goto("/login")
      await expect(page).toHaveURL(/\/setup/)
    })

    test("navbar is not visible on login page", async ({ page }) => {
      await page.goto("/login")
      await expect(page.locator("nav")).not.toBeVisible()
    })
  })

  test.describe("Setup page", () => {
    test("renders account creation form", async ({ page }) => {
      await page.goto("/setup")
      await expect(page.getByText("Welcome to FitCoach")).toBeVisible()
      await expect(page.getByLabel("Email")).toBeVisible()
      await expect(page.locator("#password")).toBeVisible()
      await expect(page.locator("#confirm")).toBeVisible()
      await expect(page.getByRole("button", { name: "Create account" })).toBeVisible()
    })

    test("create account button disabled when fields empty", async ({ page }) => {
      await page.goto("/setup")
      await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled()
    })

    test("mismatched passwords shows validation error", async ({ page }) => {
      await page.goto("/setup")
      await page.getByLabel("Email").fill("new@example.com")
      await page.locator("#password").fill("password123")
      await page.locator("#confirm").fill("different123")
      await page.getByRole("button", { name: "Create account" }).click()
      await expect(page.getByText("Passwords do not match")).toBeVisible()
    })

    test("password shorter than 8 chars shows validation error", async ({ page }) => {
      await page.goto("/setup")
      await page.getByLabel("Email").fill("new@example.com")
      await page.locator("#password").fill("short")
      await page.locator("#confirm").fill("short")
      await page.getByRole("button", { name: "Create account" }).click()
      await expect(page.getByText("Password must be at least 8 characters")).toBeVisible()
    })

    test("successful setup redirects to dashboard", async ({ page }) => {
      const validToken = await generateTestToken()
      // Catch-all registered FIRST so the specific handler (added last) wins in Playwright's LIFO matching
      await page.route(`${API_BASE}/**`, (route) => route.abort())
      await page.route(`${API_BASE}/auth/setup`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "Set-Cookie": `fitcoach_token=${validToken}; Path=/; SameSite=Lax`,
          },
          body: JSON.stringify({ id: "user-1", email: "new@example.com" }),
        })
      })
      await page.goto("/setup")
      await page.getByLabel("Email").fill("new@example.com")
      await page.locator("#password").fill("securepassword")
      await page.locator("#confirm").fill("securepassword")
      await page.getByRole("button", { name: "Create account" }).click()
      await expect(page).toHaveURL(/\/$/)
    })

    test("duplicate account error redirects to /login", async ({ page }) => {
      await page.route(`${API_BASE}/auth/setup`, (route) =>
        route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "User already exists. FitCoach is single-user." }),
        })
      )
      await page.goto("/setup")
      await page.getByLabel("Email").fill("existing@example.com")
      await page.locator("#password").fill("securepassword")
      await page.locator("#confirm").fill("securepassword")
      await page.getByRole("button", { name: "Create account" }).click()
      await expect(page).toHaveURL(/\/login/)
    })

    test("password toggle works on setup page", async ({ page }) => {
      await page.goto("/setup")
      const passwordInput = page.locator("#password")
      await expect(passwordInput).toHaveAttribute("type", "password")
      await page.locator('button[tabindex="-1"]').click()
      await expect(passwordInput).toHaveAttribute("type", "text")
    })

    test("navbar is not visible on setup page", async ({ page }) => {
      await page.goto("/setup")
      await expect(page.locator("nav")).not.toBeVisible()
    })
  })
})
