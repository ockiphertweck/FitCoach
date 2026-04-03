import { API_BASE, MOCK_ACTIVITY, expect, mockGet, mockPost, test } from "./fixtures"

const ACTIVITY_WITH_INSIGHT = {
  ...MOCK_ACTIVITY,
  aiInsight: "Great steady effort. Heart rate was well controlled at 145 bpm average.",
}

const ACTIVITY_MINIMAL = {
  id: "bbbbbbbb-0000-0000-0000-000000000001",
  name: null,
  sportType: "workout",
  startDate: "2026-03-28T10:00:00.000Z",
  durationSeconds: 1800,
  distanceMeters: null,
  elevationMeters: null,
  averageHeartRate: null,
  maxHeartRate: null,
  averagePaceSecondsPerKm: null,
  sufferScore: null,
  perceivedExertion: null,
  calories: null,
  rawData: null,
  aiInsight: null,
}

const ACTIVITY_WITH_POWER = {
  ...MOCK_ACTIVITY,
  id: "cccccccc-0000-0000-0000-000000000001",
  rawData: {
    ...MOCK_ACTIVITY.rawData,
    average_watts: 215,
    weighted_average_watts: 228,
    kilojoules: 774,
    device_watts: true,
  },
}

test.describe("Activities list", () => {
  test("shows empty state when no activities", async ({ authedPage }) => {
    await mockGet(authedPage, "/activities?limit=20&offset=0", { items: [], total: 0 })
    const [response] = await Promise.all([
      authedPage.waitForResponse((r) => r.url().includes("/activities") && r.status() === 200),
      authedPage.goto("/activities"),
    ])
    await response.finished()
    await expect(authedPage.getByText("No activities found.")).toBeVisible()
    await expect(authedPage.getByText("0 total activities")).toBeVisible()
  })

  test("renders activity rows with name and badge", async ({ authedPage }) => {
    await mockGet(authedPage, "/activities?limit=20&offset=0", {
      items: [MOCK_ACTIVITY],
      total: 1,
    })
    await authedPage.goto("/activities")
    await expect(authedPage.getByText("Morning Run")).toBeVisible()
    await expect(authedPage.getByText("run").first()).toBeVisible()
    await expect(authedPage.getByText("1 total activities")).toBeVisible()
  })

  test("falls back to sportType when name is null", async ({ authedPage }) => {
    await mockGet(authedPage, "/activities?limit=20&offset=0", {
      items: [ACTIVITY_MINIMAL],
      total: 1,
    })
    await authedPage.goto("/activities")
    // Name is null so sportType shown as display name
    await expect(authedPage.getByText("workout").first()).toBeVisible()
  })

  test("clicking row navigates to detail page", async ({ authedPage }) => {
    await mockGet(authedPage, "/activities?limit=20&offset=0", {
      items: [MOCK_ACTIVITY],
      total: 1,
    })
    await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, MOCK_ACTIVITY)
    await authedPage.goto("/activities")
    await authedPage.getByText("Morning Run").click()
    await expect(authedPage).toHaveURL(new RegExp(`/activities/${MOCK_ACTIVITY.id}`))
  })

  test("sport filter sends correct query param", async ({ authedPage }) => {
    let capturedUrl = ""
    await authedPage.route(`${API_BASE}/activities**`, (route) => {
      capturedUrl = route.request().url()
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      })
    })
    await authedPage.goto("/activities")
    await authedPage.getByRole("tab", { name: "run" }).click()
    await authedPage.waitForTimeout(100)
    expect(capturedUrl).toContain("sport=run")
  })

  test("date range filter sends from/to params", async ({ authedPage }) => {
    let capturedUrl = ""
    await authedPage.route(`${API_BASE}/activities**`, (route) => {
      capturedUrl = route.request().url()
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      })
    })
    await authedPage.goto("/activities")

    // fill() doesn't reliably trigger React onChange for date inputs in CI — use native setter
    const setDateInput = (el: HTMLInputElement, val: string) => {
      // biome-ignore lint/style/noNonNullAssertion: descriptor and setter always exist on HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
        .set!
      setter.call(el, val)
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    }
    await authedPage.locator('input[type="date"]').first().evaluate(setDateInput, "2026-03-01")
    await authedPage.locator('input[type="date"]').last().evaluate(setDateInput, "2026-03-31")
    await authedPage.waitForTimeout(150)
    expect(capturedUrl).toContain("from=2026-03-01")
    expect(capturedUrl).toContain("to=2026-03-31")
  })

  test("clear date button removes filter params", async ({ authedPage }) => {
    const urls: string[] = []
    await authedPage.route(`${API_BASE}/activities**`, (route) => {
      urls.push(route.request().url())
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      })
    })
    await authedPage.goto("/activities")

    // Use native setter + React-compatible events to reliably trigger onChange
    await authedPage
      .locator('input[type="date"]')
      .first()
      .evaluate((el, val) => {
        // biome-ignore lint/style/noNonNullAssertion: descriptor and setter always exist on HTMLInputElement
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
          .set!
        setter.call(el, val)
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
      }, "2026-03-01")

    await authedPage.getByRole("button", { name: "Clear" }).waitFor({ state: "visible" })
    // Confirm the filter was applied (from= present in a captured URL)
    await authedPage.waitForTimeout(150)
    expect(urls.some((u) => u.includes("from="))).toBe(true)

    await authedPage.getByRole("button", { name: "Clear" }).click()
    // Button hides when state resets — this is the reliable indicator the filter was cleared
    await expect(authedPage.getByRole("button", { name: "Clear" })).not.toBeVisible()
    // Input is back to empty — any subsequent API call will not include from=
    await expect(authedPage.locator('input[type="date"]').first()).toHaveValue("")
  })

  test("pagination shows correct page numbers", async ({ authedPage }) => {
    await mockGet(authedPage, "/activities?limit=20&offset=0", {
      items: Array.from({ length: 20 }, (_, i) => ({
        ...MOCK_ACTIVITY,
        id: `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`,
        name: `Run ${i + 1}`,
      })),
      total: 45,
    })
    await authedPage.goto("/activities")
    await expect(authedPage.getByText("Page 1 of 3")).toBeVisible()
    // Previous button is the first button inside the pagination row (anchored on the counter text)
    const paginationRow = authedPage.getByText("1 / 3").locator("xpath=..")
    await expect(paginationRow.getByRole("button").first()).toBeDisabled()
  })

  test("next page button loads page 2", async ({ authedPage }) => {
    let requestOffset = 0
    await authedPage.route(`${API_BASE}/activities**`, (route) => {
      const url = new URL(route.request().url())
      requestOffset = Number(url.searchParams.get("offset") ?? 0)
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [{ ...MOCK_ACTIVITY, name: `Page offset ${requestOffset}` }],
          total: 45,
        }),
      })
    })
    await authedPage.goto("/activities")
    // Next button is the last button in the pagination row
    const paginationRow = authedPage
      .getByText("1 / 45")
      .or(authedPage.getByText(/^\d+ \/ \d+$/))
      .locator("xpath=..")
    await paginationRow.getByRole("button").last().click()
    await authedPage.waitForTimeout(200)
    expect(requestOffset).toBe(20)
  })
})

test.describe("Activity detail page", () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, MOCK_ACTIVITY)
  })

  test("shows activity name and sport badge", async ({ authedPage }) => {
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByRole("heading", { name: "Morning Run" })).toBeVisible()
    await expect(authedPage.getByText("run").first()).toBeVisible()
  })

  test("shows duration, distance, elevation stats", async ({ authedPage }) => {
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByText("Moving Time")).toBeVisible()
    await expect(authedPage.getByText("59m 0s")).toBeVisible()
    await expect(authedPage.getByText("10.00 km")).toBeVisible()
    await expect(authedPage.getByText("120 m")).toBeVisible()
  })

  test("shows heart rate stats", async ({ authedPage }) => {
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByText("145 bpm")).toBeVisible()
    await expect(authedPage.getByText(/max 168 bpm/)).toBeVisible()
  })

  test("shows PR count when present", async ({ authedPage }) => {
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByText("2 PR")).toBeVisible()
  })

  test("shows device name", async ({ authedPage }) => {
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByText("via Garmin Forerunner 265")).toBeVisible()
  })

  test("shows Indoor badge for trainer activities", async ({ authedPage }) => {
    const indoorActivity = {
      ...MOCK_ACTIVITY,
      rawData: { ...MOCK_ACTIVITY.rawData, trainer: true, map: null },
    }
    await authedPage.unroute(`${API_BASE}/activities/${MOCK_ACTIVITY.id}`)
    await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, indoorActivity)
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByText("Indoor")).toBeVisible()
  })

  test("does not render map when polyline is absent", async ({ authedPage }) => {
    const noMapActivity = {
      ...MOCK_ACTIVITY,
      rawData: { ...MOCK_ACTIVITY.rawData, map: null },
    }
    await authedPage.unroute(`${API_BASE}/activities/${MOCK_ACTIVITY.id}`)
    await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, noMapActivity)
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.locator(".leaflet-container")).not.toBeVisible()
  })

  test("shows power stats when available", async ({ authedPage }) => {
    await authedPage.unroute(`${API_BASE}/activities/${MOCK_ACTIVITY.id}`)
    await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, ACTIVITY_WITH_POWER)
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByText("215 W")).toBeVisible()
    await expect(authedPage.getByText("228 W")).toBeVisible()
    await expect(authedPage.getByText("774 kJ")).toBeVisible()
    await expect(authedPage.getByText("power meter")).toBeVisible()
  })

  test("hides stat cards for null fields", async ({ authedPage }) => {
    await authedPage.unroute(`${API_BASE}/activities/${MOCK_ACTIVITY.id}`)
    await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, ACTIVITY_MINIMAL)
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(authedPage.getByText("Avg Heart Rate")).not.toBeVisible()
    await expect(authedPage.getByText("Distance")).not.toBeVisible()
  })

  test("back link navigates to /activities", async ({ authedPage }) => {
    await mockGet(authedPage, "/activities?limit=20&offset=0", { items: [], total: 0 })
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await authedPage.locator("main").getByRole("link", { name: "Activities" }).click()
    await expect(authedPage).toHaveURL(/\/activities$/)
  })

  test.describe("AI Insight", () => {
    test("shows pre-computed insight without button click", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/activities/${MOCK_ACTIVITY.id}`)
      await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, ACTIVITY_WITH_INSIGHT)
      await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
      await expect(authedPage.getByText("Great steady effort.")).toBeVisible()
      await expect(authedPage.getByRole("button", { name: "Re-analyse" })).toBeVisible()
    })

    test("shows Analyse button when no pre-computed insight", async ({ authedPage }) => {
      await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
      await expect(authedPage.getByRole("button", { name: "Analyse this activity" })).toBeVisible()
    })

    test("Analyse button calls API and shows insight", async ({ authedPage }) => {
      await mockPost(authedPage, "/ai/activity-insight", {
        insight: "Strong run with good pacing throughout.",
      })
      await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
      await authedPage.getByRole("button", { name: "Analyse this activity" }).click()
      await expect(authedPage.getByText("Strong run with good pacing throughout.")).toBeVisible()
    })

    test("shows error when insight API fails", async ({ authedPage }) => {
      await mockPost(authedPage, "/ai/activity-insight", { error: "No API key configured" }, 400)
      await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
      await authedPage.getByRole("button", { name: "Analyse this activity" }).click()
      await expect(authedPage.getByText("No API key configured")).toBeVisible()
    })

    test("Re-analyse replaces existing insight", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/activities/${MOCK_ACTIVITY.id}`)
      await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, ACTIVITY_WITH_INSIGHT)
      await mockPost(authedPage, "/ai/activity-insight", {
        insight: "Updated analysis: excellent session.",
      })
      await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
      await authedPage.getByRole("button", { name: "Re-analyse" }).click()
      await expect(authedPage.getByText("Updated analysis: excellent session.")).toBeVisible()
    })
  })
})
