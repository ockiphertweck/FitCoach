import { type Page, expect as pwExpect } from "@playwright/test"
import { API_BASE, MOCK_ACTIVITY, expect, mockGet, mockStream, test } from "./fixtures"

const STATS_FRESH = { atl: 38, ctl: 52, tsb: 14 }
const STATS_FATIGUED = { atl: 78, ctl: 55, tsb: -23 }
const STATS_MODERATE = { atl: 50, ctl: 55, tsb: -5 }

// Same computation as localDate() in lib/utils.ts
const localDate = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const recap = (content: string, stale = false) => ({
  hasKey: true,
  recap: { content, stale, generatedAt: new Date().toISOString() },
})

function trackPosts(page: Page) {
  const posts: string[] = []
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/ai/recommendation"))
      posts.push(r.postData() ?? "")
  })
  return posts
}

const STATUS_OK: Record<string, unknown> = {
  connected: true,
  status: "idle",
  lastSyncedAt: new Date().toISOString(),
  lastError: null,
  keyExpiresAt: null,
}
const WELLNESS_DAY = {
  date: localDate(),
  sleepScore: 82,
  sleepSeconds: 26640,
  deepSleepSeconds: 5400,
  remSleepSeconds: 6000,
  lightSleepSeconds: 13200,
  awakeSeconds: 2040,
  hrvLastNight: 58,
  hrvWeeklyAvg: 54,
  hrvStatus: "BALANCED",
  bodyBatteryCharged: 62,
  bodyBatteryCurrent: 78,
  stressAvg: 24,
  caloriesTotal: 2430,
  caloriesActive: 680,
  caloriesResting: 1750,
}

async function mockGarmin(
  page: Page,
  { status = STATUS_OK, wellness = { today: null, days: [] } as unknown, syncStatus = 200 } = {}
) {
  await mockGet(page, /\/garmin\/status/, status)
  await mockGet(page, /\/wellness\?/, wellness)
  await page.route(`${API_BASE}/garmin/sync`, (route) =>
    route.fulfill({ status: syncStatus, json: status })
  )
}

test.describe("Summary", () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockGarmin(authedPage)
    await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
    await mockGet(authedPage, "/activities?limit=5", { items: [], total: 0 })
    await mockGet(authedPage, /\/ai\/recommendation\?date=/, recap("Cached."))
  })

  test("shows ATL, CTL and TSB values with labels", async ({ authedPage }) => {
    await mockGet(authedPage, "/activities/stats", STATS_FRESH)
    await authedPage.goto("/")
    await expect(authedPage.getByText("Fatigue")).toBeVisible()
    await expect(authedPage.getByText("Fitness")).toBeVisible()
    await expect(authedPage.getByText("Form")).toBeVisible()
    await expect(authedPage.getByText("38", { exact: true })).toBeVisible()
    await expect(authedPage.getByText("52", { exact: true })).toBeVisible()
    await expect(authedPage.getByText("14", { exact: true })).toBeVisible()
  })

  for (const [stats, label] of [
    [STATS_FRESH, "Fresh"],
    [STATS_FATIGUED, "Fatigued"],
    [STATS_MODERATE, "Balanced"],
  ] as const) {
    test(`TSB ${stats.tsb} shows ${label}`, async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", stats)
      await authedPage.goto("/")
      await expect(authedPage.getByText(label, { exact: true })).toBeVisible()
    })
  }

  test.describe("Coach recap", () => {
    test("fresh recap renders without POST", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, recap("Rest day today."))
      await authedPage.goto("/")
      await expect(authedPage.getByText("Rest day today.")).toBeVisible()
      await authedPage.waitForTimeout(300)
      pwExpect(posts).toHaveLength(0)
    })

    test("missing recap streams once even after the post-DONE refetch", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      let gets = 0
      await authedPage.route(/\/ai\/recommendation\?date=/, (route) => {
        gets++
        route.fulfill({ json: { hasKey: true, recap: null } })
      })
      await mockStream(authedPage, "/ai/recommendation", ["Easy ", "ride"])
      await authedPage.goto("/")
      await expect(authedPage.getByText("Easy ride")).toBeVisible()
      await pwExpect.poll(() => gets).toBeGreaterThanOrEqual(2)
      await authedPage.waitForTimeout(300)
      pwExpect(posts).toHaveLength(1)
      pwExpect(JSON.parse(posts[0])).toEqual({ date: localDate() })
    })

    test("refresh button sends exactly one POST", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      await mockStream(authedPage, "/ai/recommendation", ["Fresh take"])
      await authedPage.goto("/")
      await expect(authedPage.getByText("Cached.")).toBeVisible()
      await authedPage.getByRole("button", { name: "Refresh recap" }).click()
      await expect(authedPage.getByText("Fresh take")).toBeVisible()
      pwExpect(posts).toHaveLength(1)
    })

    test("always-stale recap stops after 2 automatic streams", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      let gets = 0
      await authedPage.route(/\/ai\/recommendation\?date=/, (route) => {
        gets++
        route.fulfill({
          json: {
            hasKey: true,
            recap: {
              content: "Stored text",
              stale: true,
              generatedAt: `2026-02-01T00:00:${gets}Z`,
            },
          },
        })
      })
      await mockStream(authedPage, "/ai/recommendation", ["Streamed"])
      await authedPage.goto("/")
      await pwExpect.poll(() => gets).toBeGreaterThanOrEqual(3)
      await authedPage.waitForTimeout(1000)
      pwExpect(posts).toHaveLength(2)
      await expect(authedPage.getByText("Stored text")).toBeVisible()
      await expect(authedPage.getByText("Updating…")).toHaveCount(0)
    })

    test("navigating away and back mid-stream still sends one POST", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: true, recap: null })
      await authedPage.route(`${API_BASE}/ai/recommendation`, async (route) => {
        await new Promise((r) => setTimeout(r, 1200))
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"Done text"}\n\ndata: [DONE]\n\n',
        })
      })
      await authedPage.goto("/")
      await pwExpect.poll(() => posts.length).toBe(1)
      await authedPage
        .getByRole("link", { name: /Activities/i })
        .first()
        .click()
      await authedPage.goBack()
      await authedPage.waitForTimeout(1800)
      pwExpect(posts).toHaveLength(1)
    })

    test("leaving mid-stream and returning after it settled sends no second POST", async ({
      authedPage,
    }) => {
      const posts = trackPosts(authedPage)
      let saved = false // like the real server: GET returns the saved recap once the stream ends
      let gets = 0
      await authedPage.route(/\/ai\/recommendation\?date=/, (route) => {
        gets++
        route.fulfill({
          json: saved ? recap("Saved recap.") : { hasKey: true, recap: null },
        })
      })
      await authedPage.route(`${API_BASE}/ai/recommendation`, async (route) => {
        await new Promise((r) => setTimeout(r, 1000))
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"Saved recap."}\n\ndata: [DONE]\n\n',
        })
        saved = true
      })
      await authedPage.goto("/")
      await pwExpect.poll(() => posts.length).toBe(1)
      await authedPage
        .getByRole("link", { name: /Activities/i })
        .first()
        .click()
      await expect(authedPage).toHaveURL(/\/activities$/)
      await pwExpect.poll(() => saved, { timeout: 5000 }).toBe(true)
      await authedPage.waitForTimeout(300) // let the stream promise settle in the page
      const getsBefore = gets
      await authedPage.goBack()
      await expect(authedPage).toHaveURL(/\/$/)
      await pwExpect.poll(() => gets).toBeGreaterThan(getsBefore)
      await expect(authedPage.getByText("Saved recap.")).toBeVisible()
      await authedPage.waitForTimeout(500)
      pwExpect(posts).toHaveLength(1)
    })

    test("stale recap shows old text with Updating then new text", async ({ authedPage }) => {
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, recap("Old advice.", true))
      await authedPage.route(`${API_BASE}/ai/recommendation`, async (route) => {
        await new Promise((r) => setTimeout(r, 800))
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"New advice."}\n\ndata: [DONE]\n\n',
        })
      })
      await authedPage.goto("/")
      await expect(authedPage.getByText("Old advice.")).toBeVisible()
      await expect(authedPage.getByText("Updating…")).toBeVisible()
      await expect(authedPage.getByText("New advice.")).toBeVisible()
      await expect(authedPage.getByText("Old advice.")).toHaveCount(0)
    })

    test("no API key shows prompt and does not POST", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: false, recap: null })
      await authedPage.goto("/")
      await expect(authedPage.getByText("Add your Claude API key in Settings")).toBeVisible()
      await authedPage.waitForTimeout(300)
      pwExpect(posts).toHaveLength(0)
    })

    test("failed GET shows error with retry and does not POST", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { error: "boom" }, 500)
      await authedPage.goto("/")
      await expect(authedPage.getByText(/Couldn't load your recap/)).toBeVisible()
      await expect(authedPage.getByRole("button", { name: "Retry" })).toBeVisible()
      pwExpect(posts).toHaveLength(0)
    })

    test("whitespace-only stream shows failure instead of spinner text", async ({ authedPage }) => {
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: true, recap: null })
      await mockStream(authedPage, "/ai/recommendation", ["  \n"])
      await authedPage.goto("/")
      await expect(authedPage.getByText(/Recap generation failed/)).toBeVisible()
      await expect(authedPage.getByText("Writing your recap…")).toHaveCount(0)
    })

    for (const [name, body] of [
      ["error event", 'data: {"text":"Partial"}\n\ndata: {"error":"Recap generation failed"}\n\n'],
      ["end without [DONE]", 'data: {"text":"Partial"}\n\n'],
    ] as const) {
      test(`${name} shows error, hides partial text, offers retry`, async ({ authedPage }) => {
        await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: true, recap: null })
        await authedPage.route(`${API_BASE}/ai/recommendation`, (route) =>
          route.fulfill({ status: 200, contentType: "text/event-stream", body })
        )
        await authedPage.goto("/")
        await expect(authedPage.getByText(/Recap generation failed/)).toBeVisible()
        await expect(authedPage.getByText("Partial")).toHaveCount(0)
        await expect(authedPage.getByRole("button", { name: "Refresh recap" })).toBeVisible()
      })
    }
  })

  test.describe("Recent activities", () => {
    test("shows empty state when no activities", async ({ authedPage }) => {
      await authedPage.goto("/")
      await expect(authedPage.getByText("No activities yet")).toBeVisible()
    })

    test("row shows name and links to the detail page", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities?limit=5", { items: [MOCK_ACTIVITY], total: 1 })
      await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, MOCK_ACTIVITY)
      await authedPage.goto("/")
      const row = authedPage.getByRole("link", { name: /Morning Run/ })
      await expect(row).toHaveAttribute("href", `/activities/${MOCK_ACTIVITY.id}`)
      await expect(row.getByText("1:00")).toBeVisible()
      await row.click()
      await expect(authedPage).toHaveURL(new RegExp(`/activities/${MOCK_ACTIVITY.id}`))
    })
  })

  test.describe("Recovery & Garmin sync", () => {
    const wellness = { today: WELLNESS_DAY, days: [WELLNESS_DAY] }

    test("desktop: five recovery tiles and two columns", async ({ authedPage }) => {
      await authedPage.setViewportSize({ width: 1280, height: 900 })
      await mockGarmin(authedPage, { wellness })
      await authedPage.goto("/")
      const sleep = authedPage.getByTestId("tile-sleep")
      await expect(sleep).toContainText("82")
      await expect(sleep).toContainText("7h 24m")
      await expect(authedPage.getByTestId("tile-hrv")).toContainText("58")
      await expect(authedPage.getByTestId("tile-hrv")).toContainText("Balanced")
      await expect(authedPage.getByTestId("tile-battery")).toContainText("+62 charged overnight")
      await expect(authedPage.getByTestId("tile-stress")).toContainText("24")
      await expect(authedPage.getByTestId("tile-calories")).toContainText("2,430")
      await expect(authedPage.getByTestId("tile-calories")).toContainText("Active 680")
      const tops = await Promise.all(
        ["sleep", "hrv", "battery", "stress", "calories"].map(async (k) => {
          const b = await authedPage.getByTestId(`tile-${k}`).boundingBox()
          return Math.round(b?.y ?? -1)
        })
      )
      pwExpect(new Set(tops).size).toBe(1)
      const main = await authedPage.getByTestId("main-col").boundingBox()
      const load = await authedPage.getByTestId("load-col").boundingBox()
      pwExpect(main && load && main.x + main.width <= load.x + 1).toBe(true)
    })

    test("phone: single column", async ({ authedPage }) => {
      await authedPage.setViewportSize({ width: 390, height: 900 })
      await mockGarmin(authedPage, { wellness })
      await authedPage.goto("/")
      await expect(authedPage.getByTestId("tile-sleep")).toBeVisible()
      const main = await authedPage.getByTestId("main-col").boundingBox()
      const load = await authedPage.getByTestId("load-col").boundingBox()
      pwExpect(main && load && load.y >= main.y + main.height - 1).toBe(true)
    })

    test("no sleep score falls back to duration and stages", async ({ authedPage }) => {
      const today = { ...WELLNESS_DAY, sleepScore: null }
      await mockGarmin(authedPage, { wellness: { today, days: [today] } })
      await authedPage.goto("/")
      const sleep = authedPage.getByTestId("tile-sleep")
      await expect(sleep).toContainText("7h 24m")
      await expect(sleep).not.toContainText("No data")
      await expect(sleep.locator(".bg-stage-deep")).toHaveCount(1)
    })

    test("no wellness shows No data on Sleep and HRV", async ({ authedPage }) => {
      await authedPage.goto("/")
      await expect(authedPage.getByTestId("tile-sleep")).toContainText("No data")
      await expect(authedPage.getByTestId("tile-hrv")).toContainText("No data")
    })

    test("importing waits: message and no recap POST", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      await mockGarmin(authedPage, { status: { ...STATUS_OK, status: "importing" } })
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: true, recap: null })
      await authedPage.goto("/")
      let recapGets = 0
      authedPage.on("request", (r) => {
        if (r.url().includes("/ai/recommendation?date=")) recapGets++
      })
      await expect(authedPage.getByText("Waiting for Garmin import…")).toBeVisible()
      await expect(authedPage.getByText("Importing from Garmin…")).toBeVisible()
      await expect(authedPage.getByTestId("recovery-skeleton")).toBeVisible()
      await expect(authedPage.getByText("No data")).toHaveCount(0)
      await authedPage.waitForTimeout(500)
      pwExpect(posts).toHaveLength(0)
      pwExpect(recapGets).toBe(0)
    })

    test("sync completes before recap GET; one sync POST and one recap POST", async ({
      authedPage,
    }) => {
      const events: string[] = []
      authedPage.on("requestfinished", (r) => {
        if (r.url().endsWith("/garmin/sync") && r.method() === "POST") events.push("sync")
      })
      authedPage.on("request", (r) => {
        if (r.url().includes("/ai/recommendation?date=")) events.push("recap-get")
      })
      const syncs: string[] = []
      authedPage.on("request", (r) => {
        if (r.url().endsWith("/garmin/sync") && r.method() === "POST")
          syncs.push(r.postData() ?? "")
      })
      const posts = trackPosts(authedPage)
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: true, recap: null })
      await mockStream(authedPage, "/ai/recommendation", ["### Easy day\n\nSleep ok.\n\n→ Rest"])
      await authedPage.goto("/")
      await expect(authedPage.getByRole("heading", { name: "Easy day" })).toBeVisible()
      await authedPage.waitForTimeout(300)
      pwExpect(events.indexOf("sync")).toBeGreaterThanOrEqual(0)
      pwExpect(events.indexOf("sync")).toBeLessThan(events.indexOf("recap-get"))
      pwExpect(syncs).toHaveLength(1)
      pwExpect(JSON.parse(syncs[0])).toEqual({ force: false })
      pwExpect(posts).toHaveLength(1)
    })

    test("tab refocused next day: syncs again before the recap for the new date", async ({
      authedPage,
    }) => {
      const events: string[] = []
      authedPage.on("request", (r) => {
        if (r.url().endsWith("/garmin/sync") && r.method() === "POST") events.push("sync-start")
        const m = r.url().match(/\/ai\/recommendation\?date=(.+)$/)
        if (m) events.push(`recap-get:${m[1]}`)
      })
      authedPage.on("requestfinished", (r) => {
        if (r.url().endsWith("/garmin/sync") && r.method() === "POST") events.push("sync-done")
      })
      await authedPage.clock.install({ time: new Date("2026-11-02T22:00:00") })
      await authedPage.goto("/")
      await pwExpect.poll(() => events.includes("recap-get:2026-11-02")).toBe(true)
      pwExpect(events.filter((e) => e === "sync-start")).toHaveLength(1)

      // Overnight: the tab stays open, then becomes visible again the next morning.
      await authedPage.clock.setSystemTime(new Date("2026-11-03T07:00:00"))
      await authedPage.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))
      await authedPage.evaluate(() => window.dispatchEvent(new Event("focus")))
      await pwExpect.poll(() => events.includes("recap-get:2026-11-03")).toBe(true)
      const second = events.lastIndexOf("sync-done")
      pwExpect(events.filter((e) => e === "sync-start")).toHaveLength(2)
      pwExpect(second).toBeGreaterThan(-1)
      pwExpect(second).toBeLessThan(events.indexOf("recap-get:2026-11-03"))
    })

    test("refocus within 15 minutes on the same day does not sync again", async ({
      authedPage,
    }) => {
      let syncs = 0
      authedPage.on("request", (r) => {
        if (r.url().endsWith("/garmin/sync") && r.method() === "POST") syncs++
      })
      await authedPage.clock.install({ time: new Date("2026-11-02T10:00:00") })
      await authedPage.goto("/")
      await pwExpect.poll(() => syncs).toBe(1)
      await authedPage.clock.setSystemTime(new Date("2026-11-02T10:10:00"))
      await authedPage.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))
      await authedPage.waitForTimeout(300)
      pwExpect(syncs).toBe(1)
      await authedPage.clock.setSystemTime(new Date("2026-11-02T10:16:00"))
      await authedPage.evaluate(() => document.dispatchEvent(new Event("visibilitychange")))
      await authedPage.evaluate(() => window.dispatchEvent(new Event("focus")))
      await pwExpect.poll(() => syncs).toBe(2)
      await authedPage.waitForTimeout(300)
      pwExpect(syncs).toBe(2)
    })

    test("key_invalid shows notice with Settings link", async ({ authedPage }) => {
      await mockGarmin(authedPage, { status: { ...STATUS_OK, lastError: "key_invalid" } })
      await authedPage.goto("/")
      await expect(authedPage.getByText(/Garmin key invalid or expired/)).toBeVisible()
      await expect(
        authedPage.getByRole("link", { name: "Settings", exact: true }).first()
      ).toHaveAttribute("href", "/settings")
    })

    test("not connected shows connect prompt", async ({ authedPage }) => {
      await mockGarmin(authedPage, {
        status: { ...STATUS_OK, connected: false, lastSyncedAt: null },
        syncStatus: 400,
      })
      await authedPage.goto("/")
      await expect(
        authedPage.getByRole("link", { name: /Connect Garmin in Settings/ })
      ).toHaveAttribute("href", "/settings")
    })

    test("Sync now forces a sync", async ({ authedPage }) => {
      const syncs: string[] = []
      authedPage.on("request", (r) => {
        if (r.url().endsWith("/garmin/sync") && r.method() === "POST")
          syncs.push(r.postData() ?? "")
      })
      await authedPage.goto("/")
      await pwExpect.poll(() => syncs.length).toBe(1)
      await authedPage.getByRole("button", { name: "Sync now" }).click()
      await pwExpect.poll(() => syncs.length).toBe(2)
      pwExpect(JSON.parse(syncs[1])).toEqual({ force: true })
    })
  })
})
