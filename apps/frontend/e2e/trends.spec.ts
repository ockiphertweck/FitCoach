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

test.describe("Trends", () => {
  test.describe("Page structure", () => {
    test("renders page heading", async ({ authedPage }) => {
      await authedPage.goto("/trends")
      await expect(authedPage.getByRole("heading", { name: "Trends" })).toBeVisible()
    })

    test("renders weekly charts with delta vs previous week", async ({ authedPage }) => {
      await mockGet(authedPage, /\/activities\?limit=200/, { items: ACTIVITIES_8W, total: 3 })
      await authedPage.goto("/trends")
      for (const t of ["Distance", "Duration", "Avg Heart Rate"]) {
        await expect(authedPage.getByText(t, { exact: true }).first()).toBeVisible()
      }
      // latest week 10 km vs previous 22.5 km => −56%
      await expect(authedPage.getByTestId("delta-distance")).toHaveText("−56%")
      await expect(authedPage.getByText("Week of 30 Mar").first()).toBeVisible()
    })

    test("hides delta when the calendar week before the latest is empty", async ({
      authedPage,
    }) => {
      const act = (d: string) => ({
        startDate: d,
        durationSeconds: 3600,
        distanceMeters: 10000,
        averageHeartRate: 140,
      })
      // weeks of 9 Mar and 23 Mar, nothing in between
      await mockGet(authedPage, /\/activities\?limit=200/, {
        items: [act("2026-03-10T07:00:00.000Z"), act("2026-03-24T07:00:00.000Z")],
        total: 2,
      })
      await authedPage.goto("/trends")
      await expect(authedPage.getByText("Week of 23 Mar").first()).toBeVisible()
      await expect(authedPage.getByTestId("delta-distance")).toHaveCount(0)
    })

    test("labels the current calendar week as This week", async ({ authedPage }) => {
      const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString()
      const act = (d: string) => ({
        startDate: d,
        durationSeconds: 3600,
        distanceMeters: 10000,
        averageHeartRate: 140,
      })
      await mockGet(authedPage, /\/activities\?limit=200/, {
        items: [act(day(0)), act(day(7))],
        total: 2,
      })
      await authedPage.goto("/trends")
      await expect(authedPage.getByText("This week").first()).toBeVisible()
    })

    test("shows empty state without activities", async ({ authedPage }) => {
      await mockGet(authedPage, /\/activities\?limit=200/, { items: [], total: 0 })
      await authedPage.goto("/trends")
      await expect(authedPage.getByText("No activities yet")).toHaveCount(3)
    })
  })

  test.describe("Weekly report", () => {
    test.beforeEach(async ({ authedPage }) => {
      await mockGet(authedPage, /\/activities\?limit=200/, { items: ACTIVITIES_8W, total: 3 })
    })

    test("shows generate report button", async ({ authedPage }) => {
      await authedPage.goto("/trends")
      await expect(authedPage.getByRole("button", { name: "Generate report" })).toBeVisible()
    })

    test("generates report and shows metrics and summary", async ({ authedPage }) => {
      await mockPost(authedPage, "/ai/weekly-report", WEEKLY_REPORT)
      await authedPage.goto("/trends")
      await authedPage.getByRole("button", { name: "Generate report" }).click()
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
      await authedPage.goto("/trends")
      await authedPage.getByRole("button", { name: "Generate report" }).click()
      await expect(authedPage.getByRole("button", { name: "Generating…" })).toBeVisible()
    })

    test("shows error when report generation fails", async ({ authedPage }) => {
      await mockPost(
        authedPage,
        "/ai/weekly-report",
        { error: "No API key configured. Add one in Settings." },
        400
      )
      await authedPage.goto("/trends")
      await authedPage.getByRole("button", { name: "Generate report" }).click()
      await expect(authedPage.getByText("Something went wrong. Please try again.")).toBeVisible()
    })

    test("shows N/A for avgHR when no HR data", async ({ authedPage }) => {
      await mockPost(authedPage, "/ai/weekly-report", {
        ...WEEKLY_REPORT,
        metrics: { ...WEEKLY_REPORT.metrics, avgHR: null },
      })
      await authedPage.goto("/trends")
      await authedPage.getByRole("button", { name: "Generate report" }).click()
      await expect(authedPage.getByText("N/A")).toBeVisible()
    })
  })
})

test.describe("Trends — language", () => {
  test("sends lang with the weekly report request", async ({ authedPage }) => {
    await mockGet(authedPage, /\/activities\?limit=200/, { items: ACTIVITIES_8W, total: 3 })
    let body: Record<string, unknown> = {}
    await authedPage.route(`${API_BASE}/ai/weekly-report`, (route) => {
      body = route.request().postDataJSON()
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(WEEKLY_REPORT),
      })
    })
    await authedPage.goto("/trends")
    await authedPage.getByRole("button", { name: "Generate report" }).click()
    await expect(authedPage.getByText("32.5 km")).toBeVisible()
    expect(body.lang).toBe("en")
  })

  test.describe("German", () => {
    test.use({ locale: "de-DE" })

    test("translates charts and report, sends lang=de", async ({ authedPage }) => {
      await mockGet(authedPage, /\/activities\?limit=200/, { items: ACTIVITIES_8W, total: 3 })
      let body: Record<string, unknown> = {}
      await authedPage.route(`${API_BASE}/ai/weekly-report`, (route) => {
        body = route.request().postDataJSON()
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(WEEKLY_REPORT),
        })
      })
      await authedPage.goto("/trends")
      await expect(authedPage.getByText("Distanz", { exact: true }).first()).toBeVisible()
      await expect(authedPage.getByText("Woche vom 30. März").first()).toBeVisible()
      await authedPage.getByRole("button", { name: "Bericht erstellen" }).click()
      await expect(authedPage.getByText("32,5 km")).toBeVisible()
      expect(body.lang).toBe("de")
    })

    test("shows translated API error", async ({ authedPage }) => {
      await mockGet(authedPage, /\/activities\?limit=200/, { items: ACTIVITIES_8W, total: 3 })
      await mockPost(
        authedPage,
        "/ai/weekly-report",
        { error: "No API key configured. Add one in Settings." },
        400
      )
      await authedPage.goto("/trends")
      await authedPage.getByRole("button", { name: "Bericht erstellen" }).click()
      await expect(authedPage.getByText("Etwas ist schiefgelaufen")).toBeVisible()
    })
  })
})
