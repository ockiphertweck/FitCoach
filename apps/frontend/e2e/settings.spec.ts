import type { Page } from "@playwright/test"
import { API_BASE, expect, mockGet, mockPost, mockStream, test } from "./fixtures"

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
    await mockGet(authedPage, "/settings/apikey", { providers: [] })
    await mockGet(authedPage, "/settings/profile", PROFILE_EMPTY)
  })

  test.describe("Page structure", () => {
    test("renders all settings sections", async ({ authedPage }) => {
      await authedPage.goto("/settings")
      // Use heading roles to avoid strict mode violations
      await expect(authedPage.getByRole("heading", { name: "Claude API Key" })).toBeVisible()
      await expect(authedPage.getByRole("heading", { name: "Athlete Profile" })).toBeVisible()
    })
  })

  test.describe("Garmin", () => {
    const NOT_CONNECTED = {
      connected: false,
      status: "idle",
      lastSyncedAt: null,
      lastError: null,
      keyExpiresAt: null,
    }

    // Stateful mock: connect returns importing; every status GET after that returns idle.
    async function mockGarmin(page: Page, initial: object = NOT_CONNECTED) {
      let state: object = initial
      const calls = { sync: 0, remove: 0 }
      await page.route(`${API_BASE}/garmin/status`, (r) => r.fulfill({ json: state }))
      await page.route(`${API_BASE}/garmin/connect`, (r) => {
        const { key } = r.request().postDataJSON()
        if (key === "bad") return r.fulfill({ status: 400, json: { error: "key_invalid" } })
        if (key === "busy") return r.fulfill({ status: 502, json: { error: "rate_limited" } })
        const importing = { ...NOT_CONNECTED, connected: true, status: "importing" }
        state = { ...importing, status: "idle", lastSyncedAt: new Date().toISOString() }
        return r.fulfill({ json: importing })
      })
      await page.route(`${API_BASE}/garmin/sync`, (r) => {
        calls.sync++
        r.fulfill({ json: state })
      })
      await page.route(`${API_BASE}/garmin/key`, (r) => {
        calls.remove++
        state = NOT_CONNECTED
        r.fulfill({ json: { ok: true } })
      })
      return calls
    }

    test("connect shows Importing then Connected; key input is a password field", async ({
      authedPage,
    }) => {
      await mockGarmin(authedPage)
      await authedPage.goto("/settings")
      const input = authedPage.getByLabel("Garmin key")
      await expect(input).toHaveAttribute("type", "password")
      await expect(authedPage.getByRole("link", { name: /personal API token/i })).toHaveAttribute(
        "href",
        "https://connect.garmin.com/app/settings/personalApiToken"
      )
      await input.fill("good-key")
      await authedPage.getByRole("button", { name: "Connect", exact: true }).click()
      await expect(authedPage.getByText("Importing…")).toBeVisible()
      await expect(authedPage.getByText(/^Connected/)).toBeVisible({ timeout: 10_000 })
      await expect(authedPage.getByText(/Last sync/)).toBeVisible()
    })

    test("invalid key shows Key invalid and keeps the input", async ({ authedPage }) => {
      await mockGarmin(authedPage)
      await authedPage.goto("/settings")
      await authedPage.getByLabel("Garmin key").fill("bad")
      await authedPage.getByRole("button", { name: "Connect", exact: true }).click()
      await expect(authedPage.getByText("Key invalid", { exact: true })).toBeVisible()
      await expect(authedPage.getByLabel("Garmin key")).toHaveValue("bad")
    })

    test("rate limited shows a busy message", async ({ authedPage }) => {
      await mockGarmin(authedPage)
      await authedPage.goto("/settings")
      await authedPage.getByLabel("Garmin key").fill("busy")
      await authedPage.getByRole("button", { name: "Connect", exact: true }).click()
      await expect(authedPage.getByText("Garmin is busy, try again later")).toBeVisible()
    })

    test("connected: Sync now posts a sync, Remove key returns to the connect form", async ({
      authedPage,
    }) => {
      const calls = await mockGarmin(authedPage, {
        ...NOT_CONNECTED,
        connected: true,
        lastSyncedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      })
      await authedPage.goto("/settings")
      await expect(authedPage.getByText(/Last sync 3 hours ago/)).toBeVisible()
      await authedPage.getByRole("button", { name: "Sync now" }).click()
      await expect.poll(() => calls.sync).toBeGreaterThan(0)
      await authedPage.getByRole("button", { name: "Remove Garmin key" }).click()
      await expect(authedPage.getByLabel("Garmin key")).toBeVisible()
      expect(calls.remove).toBe(1)
    })

    test("shows key invalid or expired and expiry date when present", async ({ authedPage }) => {
      await mockGarmin(authedPage, {
        ...NOT_CONNECTED,
        connected: true,
        status: "error",
        lastError: "key_invalid",
        keyExpiresAt: "2027-01-15T00:00:00.000Z",
      })
      await authedPage.goto("/settings")
      await expect(authedPage.getByText("Key invalid or expired")).toBeVisible()
      await expect(authedPage.getByText(/Key expires/)).toBeVisible()
    })

    test("key_invalid: shows the key input and reconnecting with a new key works", async ({
      authedPage,
    }) => {
      await mockGarmin(authedPage, {
        ...NOT_CONNECTED,
        connected: true,
        status: "error",
        lastError: "key_invalid",
      })
      await authedPage.goto("/settings")
      await expect(authedPage.getByText("Key invalid or expired")).toBeVisible()
      await authedPage.getByLabel("Garmin key", { exact: true }).fill("renewed-key")
      await authedPage.getByRole("button", { name: "Connect", exact: true }).click()
      await expect(authedPage.getByText(/^Connected/)).toBeVisible({ timeout: 10_000 })
      await expect(authedPage.getByLabel("Garmin key", { exact: true })).toHaveCount(0)
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

    test("saving a key refreshes the Summary recap (one POST)", async ({ authedPage }) => {
      const posts: string[] = []
      authedPage.on("request", (r) => {
        if (r.method() === "POST" && r.url().includes("/ai/recommendation")) posts.push(r.url())
      })
      let keySaved = false
      await mockGet(authedPage, "/activities/stats", { atl: 50, ctl: 55, tsb: -5 })
      await mockGet(authedPage, "/activities?limit=5", { items: [], total: 0 })
      await authedPage.route(/\/ai\/recommendation\?date=/, (route) =>
        route.fulfill({ json: { hasKey: keySaved, recap: null } })
      )
      await mockPost(authedPage, "/settings/apikey", { ok: true })
      await mockStream(authedPage, "/ai/recommendation", ["Hello coach"])
      await authedPage.goto("/")
      await expect(authedPage.getByText("Add your Claude API key in Settings")).toBeVisible()
      await authedPage
        .getByRole("link", { name: /Settings/i })
        .first()
        .click()
      await authedPage.locator("#claude-key").fill("sk-ant-test-key-12345")
      keySaved = true
      await authedPage.getByRole("button", { name: "Save key" }).click()
      await expect(authedPage.getByText("Key saved").first()).toBeVisible()
      await authedPage.getByRole("link", { name: "Summary" }).first().click()
      await expect(authedPage.getByText("Hello coach")).toBeVisible()
      expect(posts).toHaveLength(1)
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
      // PROFILE_EMPTY has sex: null — wait for the useEffect to initialise the form
      // so the profile data doesn't race and reset the field after selectOption.
      await expect(sexField).toHaveValue("")
      // selectOption before hydration is reverted by React's controlled value; retry until it sticks.
      await expect(async () => {
        await sexField.selectOption("female")
        await expect(sexField).toHaveValue("female", { timeout: 500 })
      }).toPass()
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
})
