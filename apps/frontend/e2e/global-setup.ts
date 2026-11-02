import { type BrowserContext, type FullConfig, chromium } from "@playwright/test"
import { API_BASE, TEST_USER_EMAIL, TEST_USER_ID, generateTestToken } from "./fixtures"

// `next dev` compiles routes on first request and, when several workers hit a cold route at once,
// can serve empty/partial chunks (hydration never finishes). Compile every route once up front.
const AUTHED_ROUTES = [
  "/",
  "/coach",
  "/activities",
  "/activities/00000000-0000-0000-0000-000000000000",
  "/trends",
  "/settings",
]
// An authed context gets redirected away from these, so warm them logged out.
const PUBLIC_ROUTES = ["/login", "/setup"]

async function warm(context: BrowserContext, baseURL: string, routes: string[]) {
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
  // Sequential on purpose: one page cold-compiles each route in turn; parallel gotos would race.
  for (const route of routes) {
    await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle" }) // NOSONAR
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3001"
  const browser = await chromium.launch()
  const authed = await browser.newContext()
  await authed.addCookies([
    { name: "fitcoach_token", value: await generateTestToken(), url: baseURL },
  ])
  await warm(authed, baseURL, AUTHED_ROUTES)
  await warm(await browser.newContext(), baseURL, PUBLIC_ROUTES)
  await browser.close()
}
