import { API_BASE, expect, mockGet, mockPost, test } from "./fixtures"

const ACTIVITIES_8W = [
  {
    startDate: "2026-03-31T07:00:00.000Z",
    durationSeconds: 3600,
    distanceMeters: 10000,
    averageHeartRate: 145,
  },
  {
    startDate: "2026-03-29T08:00:00.000Z",
    durationSeconds: 2700,
    distanceMeters: 7500,
    averageHeartRate: 138,
  },
  {
    startDate: "2026-03-24T07:30:00.000Z",
    durationSeconds: 5400,
    distanceMeters: 15000,
    averageHeartRate: 150,
  },
]

const WEEKLY_REPORT = {
  id: "report-1",
  weekStart: "2026-03-30",
  summary: "Solid week of training. **Three sessions** completed with good consistency.",
  metrics: {
    totalDistance: 32500,
    totalDuration: 11700,
    avgHR: 144,
    sessions: 3,
    atl: 42,
    ctl: 51,
  },
  generatedAt: "2026-04-01T12:00:00.000Z",
}

test.describe("Analytics", () => {
  test.describe("Page structure", () => {
    test("renders page heading", async ({ authedPage }) => {
      await authedPage.goto("/analytics")
      await expect(authedPage.getByRole("heading", { name: "Weekly Report" })).toBeVisible()
    })
  })

  test.describe("Weekly report", () => {
    test.beforeEach(async ({ authedPage }) => {
      await mockGet(authedPage, /\/activities\?limit=200/, { items: ACTIVITIES_8W, total: 3 })
    })

    test("shows generate report button", async ({ authedPage }) => {
      await authedPage.goto("/analytics")
      await expect(
        authedPage.getByRole("button", { name: "Generate this week's report" })
      ).toBeVisible()
    })

    test("generates report and shows metrics and summary", async ({ authedPage }) => {
      await mockPost(authedPage, "/ai/weekly-report", WEEKLY_REPORT)
      await authedPage.goto("/analytics")
      await authedPage.getByRole("button", { name: "Generate this week's report" }).click()
      // Metrics grid
      await expect(authedPage.getByText("32.5 km")).toBeVisible()
      await expect(authedPage.getByText("195 min")).toBeVisible()
      await expect(authedPage.getByText("144 bpm")).toBeVisible()
      await expect(authedPage.getByText("3").first()).toBeVisible()
      // Markdown summary with bold
      await expect(authedPage.locator("strong").filter({ hasText: "Three sessions" })).toBeVisible()
    })

    test("shows Generating… while report is loading", async ({ authedPage }) => {
      await authedPage.route(`${API_BASE}/ai/weekly-report`, async (route) => {
        await new Promise((r) => setTimeout(r, 500))
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(WEEKLY_REPORT),
        })
      })
      await authedPage.goto("/analytics")
      await authedPage.getByRole("button", { name: "Generate this week's report" }).click()
      await expect(authedPage.getByRole("button", { name: "Generating…" })).toBeVisible()
    })

    test("shows error when report generation fails", async ({ authedPage }) => {
      await mockPost(
        authedPage,
        "/ai/weekly-report",
        { error: "No API key configured. Add one in Settings." },
        400
      )
      await authedPage.goto("/analytics")
      await authedPage.getByRole("button", { name: "Generate this week's report" }).click()
      await expect(authedPage.getByText("No API key configured.")).toBeVisible()
    })

    test("shows N/A for avgHR when no HR data", async ({ authedPage }) => {
      await mockPost(authedPage, "/ai/weekly-report", {
        ...WEEKLY_REPORT,
        metrics: { ...WEEKLY_REPORT.metrics, avgHR: null },
      })
      await authedPage.goto("/analytics")
      await authedPage.getByRole("button", { name: "Generate this week's report" }).click()
      await expect(authedPage.getByText("N/A")).toBeVisible()
    })
  })
})
