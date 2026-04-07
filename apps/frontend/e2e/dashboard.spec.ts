import { API_BASE, MOCK_ACTIVITY, expect, mockGet, mockPost, mockStream, test } from "./fixtures"

const STATS_FRESH = { atl: 38, ctl: 52, tsb: 14 }
const STATS_FATIGUED = { atl: 78, ctl: 55, tsb: -23 }
const STATS_MODERATE = { atl: 50, ctl: 55, tsb: -5 }
const STATS_ZERO = { atl: 0, ctl: 0, tsb: 0 }

test.describe("Dashboard", () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockGet(authedPage, "/activities?limit=5", { items: [], total: 0 })
    // Chart data (8-week trend) — return empty to avoid real API calls for the test user
    await mockGet(authedPage, /\/activities\?limit=200/, { items: [], total: 0 })
  })

  test.describe("Training load cards", () => {
    test("shows ATL, CTL and TSB values", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_FRESH)
      await authedPage.goto("/")
      await expect(authedPage.getByText("38")).toBeVisible()
      await expect(authedPage.getByText("52")).toBeVisible()
      await expect(authedPage.getByText("14")).toBeVisible()
    })

    test("TSB > 5 shows green Fresh badge", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_FRESH)
      await authedPage.goto("/")
      const badge = authedPage.getByText("Fresh", { exact: true })
      await expect(badge).toBeVisible()
      await expect(badge).toHaveClass(/emerald/)
    })

    test("TSB < -10 shows red Fatigued badge", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_FATIGUED)
      await authedPage.goto("/")
      const badge = authedPage.getByText("Fatigued", { exact: true })
      await expect(badge).toBeVisible()
      await expect(badge).toHaveClass(/red/)
    })

    test("TSB between -10 and 5 shows yellow Moderate badge", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await authedPage.goto("/")
      const badge = authedPage.getByText("Moderate", { exact: true })
      await expect(badge).toBeVisible()
      await expect(badge).toHaveClass(/amber/)
    })

    test("shows — when stats not yet loaded", async ({ authedPage }) => {
      // Delay stats response so we see loading state
      await authedPage.route(`${API_BASE}/activities/stats`, async (route) => {
        await new Promise((r) => setTimeout(r, 2000))
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(STATS_ZERO),
        })
      })
      await authedPage.goto("/")
      await expect(authedPage.getByText("—").first()).toBeVisible()
    })
  })

  test.describe("Recent activities", () => {
    test("shows empty state when no activities", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_ZERO)
      await authedPage.goto("/")
      await expect(authedPage.getByText("No activities yet")).toBeVisible()
    })

    test("renders activity rows", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await mockGet(authedPage, "/activities?limit=5", {
        items: [MOCK_ACTIVITY],
        total: 1,
      })
      await authedPage.goto("/")
      await expect(authedPage.getByText("Morning Run")).toBeVisible()
      await expect(authedPage.getByText("run").first()).toBeVisible()
    })

    test("clicking an activity navigates to detail page", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await mockGet(authedPage, "/activities?limit=5", {
        items: [MOCK_ACTIVITY],
        total: 1,
      })
      await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, MOCK_ACTIVITY)
      await authedPage.goto("/")
      await authedPage.getByText("Morning Run").click()
      await expect(authedPage).toHaveURL(new RegExp(`/activities/${MOCK_ACTIVITY.id}`))
    })

    test("shows duration and distance in row", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await mockGet(authedPage, "/activities?limit=5", {
        items: [MOCK_ACTIVITY],
        total: 1,
      })
      await authedPage.goto("/")
      await expect(authedPage.getByText("1h 0m")).toBeVisible()
      await expect(authedPage.getByText("10.0 km")).toBeVisible()
    })
  })

  test.describe("Sync Strava", () => {
    test("sync button triggers API and shows count", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await mockPost(authedPage, "/strava/sync", { synced: 5 })
      await authedPage.goto("/")
      await authedPage.getByRole("button", { name: "Sync Strava" }).click()
      await expect(authedPage.getByText("Synced 5 activities")).toBeVisible()
    })

    test("sync with 0 new activities shows count", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await mockPost(authedPage, "/strava/sync", { synced: 0 })
      await authedPage.goto("/")
      await authedPage.getByRole("button", { name: "Sync Strava" }).click()
      await expect(authedPage.getByText("Synced 0 activities")).toBeVisible()
    })

    test("sync button shows spinner while pending", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await authedPage.route(`${API_BASE}/strava/sync`, async (route) => {
        await new Promise((r) => setTimeout(r, 500))
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ synced: 1 }),
        })
      })
      await authedPage.goto("/")
      await authedPage.getByRole("button", { name: "Sync Strava" }).click()
      // Button should be disabled while loading
      await expect(authedPage.getByRole("button", { name: "Sync Strava" })).toBeDisabled()
    })
  })

  test.describe("AI Recommendation", () => {
    test("streams recommendation text", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await mockStream(authedPage, "/ai/recommendation", [
        "Today you should take ",
        "an easy recovery run.",
      ])
      await authedPage.goto("/")
      await authedPage.getByRole("button", { name: "Get recommendation" }).click()
      await expect(
        authedPage.getByText("Today you should take an easy recovery run.")
      ).toBeVisible()
    })

    test("shows streaming indicator while loading", async ({ authedPage }) => {
      await mockGet(authedPage, "/activities/stats", STATS_MODERATE)
      await authedPage.route(`${API_BASE}/ai/recommendation`, async (route) => {
        await new Promise((r) => setTimeout(r, 300))
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"Rest today."}\n\ndata: [DONE]\n\n',
        })
      })
      await authedPage.goto("/")
      await authedPage.getByRole("button", { name: "Get recommendation" }).click()
      await expect(
        authedPage.getByRole("button", { name: "Getting recommendation…" })
      ).toBeVisible()
    })
  })
})
