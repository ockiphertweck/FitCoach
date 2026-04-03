import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Page, type Route, test as base, expect } from "@playwright/test"
import { SignJWT } from "jose"

export { expect }

export const API_BASE = "http://localhost:3000"

export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
export const TEST_USER_EMAIL = "test@fitcoach.dev"

function readJwtSecret(): string {
  try {
    const env = readFileSync(join(__dirname, "../../../.env"), "utf-8")
    const m = env.match(/^JWT_SECRET\s*=\s*(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, "")
  } catch {}
  return process.env.JWT_SECRET ?? "test-fallback-secret"
}

const JWT_SECRET = readJwtSecret()

export async function generateTestToken(): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET)
  return new SignJWT({ email: TEST_USER_EMAIL })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(TEST_USER_ID)
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(secret)
}

// Mock a GET endpoint — path can be a string suffix or a full RegExp
export async function mockGet(page: Page, path: string | RegExp, body: unknown, status = 200) {
  const pattern = path instanceof RegExp ? path : `${API_BASE}${path}`
  await page.route(pattern, (route: Route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
    } else {
      route.continue()
    }
  })
}

// Mock a POST endpoint
export async function mockPost(page: Page, path: string, body: unknown, status = 200) {
  await page.route(`${API_BASE}${path}`, (route: Route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
    } else {
      route.continue()
    }
  })
}

// Mock a PUT endpoint
export async function mockPut(page: Page, path: string, body: unknown, status = 200) {
  await page.route(`${API_BASE}${path}`, (route: Route) => {
    if (route.request().method() === "PUT") {
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
    } else {
      route.continue()
    }
  })
}

// Mock a DELETE endpoint
export async function mockDelete(page: Page, path: string, body: unknown, status = 200) {
  await page.route(`${API_BASE}${path}`, (route: Route) => {
    if (route.request().method() === "DELETE") {
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
    } else {
      route.continue()
    }
  })
}

// Mock an SSE streaming endpoint — sends all chunks as one response body
export async function mockStream(page: Page, path: string, chunks: string[]) {
  await page.route(`${API_BASE}${path}`, (route: Route) => {
    const sseBody = `${chunks.map((c) => `data: ${JSON.stringify({ text: c })}\n\n`).join("")}data: [DONE]\n\n`
    route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "Cache-Control": "no-cache" },
      body: sseBody,
    })
  })
}

// Fixture with a pre-authenticated page (JWT cookie + /auth/me mocked)
type AuthFixtures = { authedPage: Page }

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page, context }, use) => {
    const token = await generateTestToken()
    await context.addCookies([
      {
        name: "fitcoach_token",
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
      },
    ])
    await mockGet(page, "/auth/me", {
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      createdAt: new Date().toISOString(),
    })
    await use(page)
  },
})

// Convenience: shared activity mock data
export const MOCK_ACTIVITY = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  name: "Morning Run",
  sportType: "run",
  startDate: "2026-03-31T07:00:00.000Z",
  durationSeconds: 3600,
  distanceMeters: 10000,
  elevationMeters: 120,
  averageHeartRate: 145,
  maxHeartRate: 168,
  averagePaceSecondsPerKm: 360,
  sufferScore: 52,
  perceivedExertion: 6,
  calories: 620,
  rawData: {
    moving_time: 3540,
    elapsed_time: 3600,
    average_watts: null,
    max_speed: 3.2,
    pr_count: 2,
    achievement_count: 3,
    trainer: false,
    commute: false,
    device_name: "Garmin Forerunner 265",
    map: { summary_polyline: "wkxuHkiiv@A?" },
  },
  aiInsight: null,
}
