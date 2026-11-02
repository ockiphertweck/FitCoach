import { type Page, expect as pwExpect } from "@playwright/test"
import { API_BASE, MOCK_ACTIVITY, expect, mockGet, mockPost, mockStream, test } from "./fixtures"

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

test.describe("Summary", () => {
  test.beforeEach(async ({ authedPage }) => {
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

    test("missing recap streams once with the local date", async ({ authedPage }) => {
      const posts = trackPosts(authedPage)
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: true, recap: null })
      await mockStream(authedPage, "/ai/recommendation", ["Easy ", "ride"])
      await authedPage.goto("/")
      await expect(authedPage.getByText("Easy ride")).toBeVisible()
      pwExpect(posts).toHaveLength(1)
      pwExpect(JSON.parse(posts[0])).toEqual({ date: localDate() })
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

    test("failed stream shows error and retry", async ({ authedPage }) => {
      await mockGet(authedPage, /\/ai\/recommendation\?date=/, { hasKey: true, recap: null })
      await authedPage.route(`${API_BASE}/ai/recommendation`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"Partial"}\n\ndata: {"error":"Recap generation failed"}\n\n',
        })
      )
      await authedPage.goto("/")
      await expect(authedPage.getByText("Recap generation failed")).toBeVisible()
      await expect(authedPage.getByRole("button", { name: "Refresh recap" })).toBeVisible()
    })
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

  test.describe("Sync Strava", () => {
    test("sync button triggers API and shows count", async ({ authedPage }) => {
      await mockPost(authedPage, "/strava/sync", { synced: 5 })
      await authedPage.goto("/")
      await authedPage.getByRole("button", { name: "Sync Strava" }).click()
      await expect(authedPage.getByText("Synced 5 activities")).toBeVisible()
    })
  })
})
