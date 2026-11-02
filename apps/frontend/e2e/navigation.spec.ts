import { MOCK_ACTIVITY, expect, mockGet, test } from "./fixtures"

test.describe("Navigation", () => {
  test("laptop: glass capsule at top with all five links", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 1280, height: 800 })
    await authedPage.goto("/")
    const nav = authedPage.getByRole("navigation", { name: "Main" })
    for (const name of ["Home", "Coach", "Activities", "Trends", "Settings"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible()
    }
    const box = await nav.boundingBox()
    expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThan(400)
  })

  test("phone: four tabs in the bottom quarter, no Settings tab", async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 390, height: 844 })
    await authedPage.goto("/")
    const nav = authedPage.getByRole("navigation", { name: "Main" })
    for (const name of ["Home", "Coach", "Activities", "Trends"]) {
      await expect(nav.getByRole("link", { name })).toBeVisible()
    }
    await expect(nav.getByRole("link", { name: "Settings" })).toBeHidden()
    const box = await nav.boundingBox()
    expect(box?.y ?? 0).toBeGreaterThan(844 * 0.75)
  })

  test("/analytics redirects to /trends", async ({ authedPage }) => {
    await authedPage.goto("/analytics")
    await expect(authedPage).toHaveURL(/\/trends$/)
  })

  test("activity detail keeps Activities tab active", async ({ authedPage }) => {
    await mockGet(authedPage, `/activities/${MOCK_ACTIVITY.id}`, MOCK_ACTIVITY)
    await authedPage.goto(`/activities/${MOCK_ACTIVITY.id}`)
    await expect(
      authedPage.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Activities" })
    ).toHaveAttribute("aria-current", "page")
  })
})
