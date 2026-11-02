import { chromium } from "@playwright/test"
import { API_BASE, TEST_USER_EMAIL, TEST_USER_ID, generateTestToken } from "./fixtures"

// `next dev` compiles routes on first request and, when several workers hit a cold route at once,
// can serve empty/partial chunks (hydration never finishes). Compile every route once up front.
const ROUTES = [
  "/",
  "/coach",
  "/activities",
  "/activities/00000000-0000-0000-0000-000000000000",
  "/trends",
  "/settings",
  "/login",
  "/setup",
]

export default async function globalSetup() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addCookies([
    { name: "fitcoach_token", value: await generateTestToken(), domain: "localhost", path: "/" },
  ])
  await context.route(`${API_BASE}/**`, (route) => {
    const me = route.request().url().endsWith("/auth/me")
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        me ? { id: TEST_USER_ID, email: TEST_USER_EMAIL, createdAt: new Date().toISOString() } : {}
      ),
    })
  })
  const page = await context.newPage()
  for (const route of ROUTES) {
    await page.goto(`http://localhost:3001${route}`, { waitUntil: "networkidle" })
  }
  await browser.close()
}
