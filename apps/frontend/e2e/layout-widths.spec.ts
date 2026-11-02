import type { Page } from "@playwright/test"
import { MOCK_ACTIVITY, expect, mockGet, test } from "./fixtures"

const SESSION = {
  id: "sess-0001-0000-0000-000000000001",
  title: "Weekly planning",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const width = async (page: Page, sel: string) =>
  (await page.locator(sel).first().boundingBox())?.width ?? 0
const pageWidth = (page: Page) => width(page, "main > *")

async function mockData(page: Page) {
  await mockGet(page, /\/activities\?limit=200/, { items: [MOCK_ACTIVITY], total: 1 })
  await mockGet(page, /\/activities\?limit=20&/, { items: [MOCK_ACTIVITY], total: 1 })
  await mockGet(page, "/ai/chat/sessions", { sessions: [SESSION] })
  await mockGet(page, /\/ai\/chat\/history\?sessionId=/, { messages: [] })
}

test.describe("Desktop layout (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const path of ["/", "/trends", "/activities"]) {
    test(`${path} uses the wide container`, async ({ authedPage }) => {
      await mockData(authedPage)
      await authedPage.goto(path)
      await expect.poll(() => pageWidth(authedPage)).toBeGreaterThan(1000)
      expect(await pageWidth(authedPage)).toBeGreaterThan(1000)
    })
  }

  test("settings stays narrow", async ({ authedPage }) => {
    await authedPage.goto("/settings")
    await expect.poll(() => pageWidth(authedPage)).toBeLessThanOrEqual(700)
    expect(await pageWidth(authedPage)).toBeGreaterThan(300)
  })

  test("trends charts sit side by side", async ({ authedPage }) => {
    await mockData(authedPage)
    await authedPage.goto("/trends")
    const a = await authedPage.getByTestId("weekly-chart").nth(0).boundingBox()
    const b = await authedPage.getByTestId("weekly-chart").nth(1).boundingBox()
    expect(a && b && Math.abs(a.y - b.y) < 2 && a.x !== b.x).toBe(true)
  })

  test("coach sessions list is visible without opening the sheet", async ({ authedPage }) => {
    await mockData(authedPage)
    await authedPage.goto("/coach")
    await expect(authedPage.getByTestId("coach-sessions")).toBeVisible()
    await expect(
      authedPage.getByTestId("coach-sessions").getByText("Weekly planning")
    ).toBeVisible()
  })

  test("activities rows show elevation and pace", async ({ authedPage }) => {
    await mockData(authedPage)
    await authedPage.goto("/activities")
    await expect(authedPage.getByTestId("row-elevation").first()).toBeVisible()
    await expect(authedPage.getByTestId("row-pace").first()).toBeVisible()
  })

  test("summary calorie tile value does not overflow", async ({ authedPage }) => {
    await mockData(authedPage)
    await mockGet(authedPage, /\/garmin\/status/, {
      connected: true,
      status: "idle",
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      keyExpiresAt: null,
    })
    await mockGet(authedPage, /\/wellness\?/, {
      today: {
        date: "2026-11-02",
        caloriesTotal: 2430,
        sleepScore: 82,
        sleepSeconds: 26640,
        hrvLastNight: 58,
        bodyBatteryCurrent: 78,
        stressAvg: 24,
      },
      days: [],
    })
    await authedPage.goto("/")
    await expect(authedPage.getByTestId("tile-calories")).toContainText("2,430")
    const ok = await authedPage.evaluate(() =>
      [...document.querySelectorAll("main *")].every(
        (e) => e.children.length > 0 || e.scrollWidth <= e.clientWidth + 1
      )
    )
    expect(ok).toBe(true)
  })
})

test.describe("Phone layout (390px)", () => {
  test.use({ viewport: { width: 390, height: 800 } })

  test("pages stay in the narrow column", async ({ authedPage }) => {
    await mockData(authedPage)
    const widths: number[] = []
    for (const path of ["/", "/trends", "/activities"]) {
      await authedPage.goto(path)
      await expect.poll(() => pageWidth(authedPage)).toBeLessThanOrEqual(390)
      widths.push(await pageWidth(authedPage))
    }
    expect(widths.every((w) => w > 0 && w <= 390)).toBe(true)
  })

  test("trends charts stack", async ({ authedPage }) => {
    await mockData(authedPage)
    await authedPage.goto("/trends")
    const a = await authedPage.getByTestId("weekly-chart").nth(0).boundingBox()
    const b = await authedPage.getByTestId("weekly-chart").nth(1).boundingBox()
    expect(a && b && b.y > a.y + 10).toBe(true)
  })

  test("coach list is a sheet, not a column", async ({ authedPage }) => {
    await mockData(authedPage)
    await authedPage.goto("/coach")
    await expect(authedPage.getByTestId("coach-sessions")).toBeHidden()
    await authedPage.getByRole("button", { name: "Chats" }).click()
    await expect(authedPage.getByRole("dialog").getByText("Weekly planning")).toBeVisible()
  })

  test("activities rows hide elevation and pace", async ({ authedPage }) => {
    await mockData(authedPage)
    await authedPage.goto("/activities")
    await expect(authedPage.getByTestId("row-elevation").first()).toBeHidden()
  })
})
