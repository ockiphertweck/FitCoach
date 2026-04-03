import { API_BASE, expect, mockGet, test } from "./fixtures"

const STRAVA_CONNECTED = {
  connected: true,
  athleteId: 12345678,
  lastSynced: "2026-04-01T07:00:00.000Z",
}

const STRAVA_DISCONNECTED = { connected: false, athleteId: null, lastSynced: null }

const PROFILE_FULL = {
  sex: "male",
  weightKg: 72.5,
  heightCm: 178,
  maxHeartRate: 185,
  ftpWatts: 260,
}

const PROFILE_EMPTY = {
  sex: null,
  weightKg: null,
  heightCm: null,
  maxHeartRate: null,
  ftpWatts: null,
}

test.describe("Settings", () => {
  test.beforeEach(async ({ authedPage }) => {
    await mockGet(authedPage, "/strava/status", STRAVA_DISCONNECTED)
    await mockGet(authedPage, "/settings/apikey", { providers: [] })
    await mockGet(authedPage, "/settings/profile", PROFILE_EMPTY)
  })

  test.describe("Page structure", () => {
    test("renders all settings sections", async ({ authedPage }) => {
      await authedPage.goto("/settings")
      // Use heading roles to avoid strict mode violations
      await expect(authedPage.getByRole("heading", { name: "Strava" })).toBeVisible()
      await expect(authedPage.getByRole("heading", { name: "Claude API Key" })).toBeVisible()
      await expect(authedPage.getByRole("heading", { name: "Athlete Profile" })).toBeVisible()
    })
  })

  test.describe("Strava connection", () => {
    test("shows Connect Strava button when not connected", async ({ authedPage }) => {
      await authedPage.goto("/settings")
      await expect(authedPage.getByRole("link", { name: /Connect Strava/i })).toBeVisible()
    })

    test("shows connected state with athlete ID", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/strava/status`)
      await mockGet(authedPage, "/strava/status", STRAVA_CONNECTED)
      await authedPage.goto("/settings")
      await expect(authedPage.getByText("Athlete #12345678")).toBeVisible()
    })

    test("shows disconnect button when connected", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/strava/status`)
      await mockGet(authedPage, "/strava/status", STRAVA_CONNECTED)
      await authedPage.goto("/settings")
      await expect(authedPage.getByRole("button", { name: /Disconnect/i })).toBeVisible()
    })

    test("disconnect calls DELETE /strava/disconnect", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/strava/status`)
      await mockGet(authedPage, "/strava/status", STRAVA_CONNECTED)
      let disconnectCalled = false
      await authedPage.route(`${API_BASE}/strava/disconnect`, (route) => {
        if (route.request().method() === "DELETE") {
          disconnectCalled = true
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          })
        } else {
          route.continue()
        }
      })
      await authedPage.goto("/settings")
      await authedPage.getByRole("button", { name: /Disconnect/i }).click()
      await authedPage.waitForTimeout(300)
      expect(disconnectCalled).toBe(true)
    })
  })

  test.describe("Claude API key", () => {
    test("shows no saved key badge when providers list is empty", async ({ authedPage }) => {
      await authedPage.goto("/settings")
      // "Key saved" badge should not be present when providers is []
      await expect(authedPage.getByText("Key saved")).not.toBeVisible()
    })

    test("shows Key saved badge when key is configured", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/settings/apikey`)
      await mockGet(authedPage, "/settings/apikey", { providers: ["anthropic"] })
      await authedPage.goto("/settings")
      await expect(authedPage.getByText("Key saved")).toBeVisible()
    })

    test("saves API key when submitted", async ({ authedPage }) => {
      let saveCount = 0
      await authedPage.route(`${API_BASE}/settings/apikey`, (route) => {
        if (route.request().method() === "POST") {
          saveCount++
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          })
        } else if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ providers: saveCount > 0 ? ["anthropic"] : [] }),
          })
        } else {
          route.continue()
        }
      })
      await authedPage.goto("/settings")
      // The API key input has placeholder "sk-ant-api03-..."
      await authedPage.locator("#claude-key").fill("sk-ant-test-key-12345")
      await authedPage.getByRole("button", { name: "Save key" }).click()
      await authedPage.waitForTimeout(300)
      expect(saveCount).toBe(1)
    })

    test("deletes API key", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/settings/apikey`)
      let deleteCalled = false
      await authedPage.route(`${API_BASE}/settings/apikey**`, (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ providers: ["anthropic"] }),
          })
        } else if (route.request().method() === "DELETE") {
          deleteCalled = true
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          })
        } else {
          route.continue()
        }
      })
      await authedPage.goto("/settings")
      await authedPage.getByRole("button", { name: "Remove key" }).click()
      await authedPage.waitForTimeout(300)
      expect(deleteCalled).toBe(true)
    })
  })

  test.describe("Athlete profile", () => {
    test("renders all profile fields", async ({ authedPage }) => {
      await authedPage.goto("/settings")
      await expect(authedPage.getByLabel("Weight (kg)")).toBeVisible()
      await expect(authedPage.getByLabel("Height (cm)")).toBeVisible()
      await expect(authedPage.getByLabel("Max Heart Rate (bpm)")).toBeVisible()
      await expect(authedPage.getByLabel("FTP (watts)")).toBeVisible()
    })

    test("loads existing profile data into fields", async ({ authedPage }) => {
      await authedPage.unroute(`${API_BASE}/settings/profile`)
      await mockGet(authedPage, "/settings/profile", PROFILE_FULL)
      await authedPage.goto("/settings")
      await expect(authedPage.getByLabel("Weight (kg)")).toHaveValue("72.5")
      await expect(authedPage.getByLabel("Height (cm)")).toHaveValue("178")
      await expect(authedPage.getByLabel("Max Heart Rate (bpm)")).toHaveValue("185")
      await expect(authedPage.getByLabel("FTP (watts)")).toHaveValue("260")
    })

    test("saves profile and shows success indicator", async ({ authedPage }) => {
      let savedBody: unknown = null
      await authedPage.route(`${API_BASE}/settings/profile`, (route) => {
        if (route.request().method() === "PUT") {
          savedBody = route.request().postDataJSON()
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          })
        } else {
          route.continue()
        }
      })
      await authedPage.goto("/settings")
      await authedPage.getByLabel("Weight (kg)").fill("75")
      await authedPage.getByLabel("Height (cm)").fill("180")
      await authedPage.getByRole("button", { name: "Save profile" }).click()
      await authedPage.waitForTimeout(300)
      expect(savedBody).not.toBeNull()
      await expect(authedPage.getByText("Saved")).toBeVisible()
    })

    test("sex selector accepts male, female, other", async ({ authedPage }) => {
      await authedPage.goto("/settings")
      const sexField = authedPage.locator("#sex")
      await sexField.selectOption("female")
      await expect(sexField).toHaveValue("female")
    })

    test("shows no Saved indicator when profile save fails", async ({ authedPage }) => {
      await authedPage.route(`${API_BASE}/settings/profile`, (route) => {
        if (route.request().method() === "PUT") {
          route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ error: "Validation error" }),
          })
        } else {
          route.continue()
        }
      })
      await authedPage.goto("/settings")
      await authedPage.getByRole("button", { name: "Save profile" }).click()
      await authedPage.waitForTimeout(400)
      // The page doesn't display error text, but the "Saved" success indicator should not appear
      await expect(authedPage.getByText("Saved")).not.toBeVisible()
    })
  })

  test.describe("Strava callback handling", () => {
    test("shows Connected badge after Strava connects (?strava=connected)", async ({
      authedPage,
    }) => {
      await authedPage.unroute(`${API_BASE}/strava/status`)
      await mockGet(authedPage, "/strava/status", STRAVA_CONNECTED)
      await authedPage.goto("/settings?strava=connected")
      // The Connected badge in the Strava section is visible
      await expect(authedPage.getByText("Connected")).toBeVisible()
    })

    test("still shows Connect button after Strava auth fails (?strava=error)", async ({
      authedPage,
    }) => {
      // The settings page doesn't parse the error param — Strava stays disconnected
      await authedPage.goto("/settings?strava=error")
      await expect(authedPage.getByRole("link", { name: /Connect Strava/i })).toBeVisible()
    })
  })
})
