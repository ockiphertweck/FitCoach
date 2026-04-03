import { API_BASE, expect, mockDelete, mockGet, mockStream, test } from "./fixtures"

const HISTORY_MESSAGES = [
  {
    id: "msg-1",
    role: "user",
    content: "How was my training this week?",
    createdAt: "2026-04-01T09:00:00.000Z",
  },
  {
    id: "msg-2",
    role: "assistant",
    content: "Your training load looks solid. You hit **3 sessions** this week.",
    createdAt: "2026-04-01T09:00:05.000Z",
  },
]

test.describe("AI Coach chat", () => {
  test.describe("Empty state", () => {
    test("shows empty state placeholder when no history", async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: [] })
      await authedPage.goto("/coach")
      await expect(authedPage.getByText("Start a conversation")).toBeVisible()
      await expect(
        authedPage.getByText("Ask about your training, recovery, or goals")
      ).toBeVisible()
    })

    test("clear history button hidden when no messages", async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: [] })
      await authedPage.goto("/coach")
      await expect(authedPage.getByRole("button", { name: "Clear history" })).not.toBeVisible()
    })
  })

  test.describe("History loading", () => {
    test("renders existing chat messages on load", async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: HISTORY_MESSAGES })
      await authedPage.goto("/coach")
      await expect(authedPage.getByText("How was my training this week?")).toBeVisible()
      await expect(authedPage.getByText(/Your training load looks solid/)).toBeVisible()
    })

    test("renders markdown in assistant messages", async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: HISTORY_MESSAGES })
      await authedPage.goto("/coach")
      // Bold text from markdown should be rendered as <strong>
      await expect(authedPage.locator("strong").filter({ hasText: "3 sessions" })).toBeVisible()
    })

    test("shows clear history button when messages exist", async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: HISTORY_MESSAGES })
      await authedPage.goto("/coach")
      await expect(authedPage.getByRole("button", { name: "Clear history" })).toBeVisible()
    })
  })

  test.describe("Sending messages", () => {
    test.beforeEach(async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: [] })
    })

    test("send button disabled when input is empty", async ({ authedPage }) => {
      await authedPage.goto("/coach")
      await expect(
        authedPage.locator("textarea").locator("xpath=..").locator("button")
      ).toBeDisabled()
    })

    test("send button enabled when input has text", async ({ authedPage }) => {
      await authedPage.goto("/coach")
      await authedPage.getByPlaceholder(/Ask your coach/).fill("How should I train?")
      await expect(
        authedPage.locator("textarea").locator("xpath=..").locator("button")
      ).toBeEnabled()
    })

    test("streams assistant response after sending message", async ({ authedPage }) => {
      await mockStream(authedPage, "/ai/chat", [
        "Based on your recent load, ",
        "I recommend an easy run tomorrow.",
      ])
      await mockGet(authedPage, "/ai/chat/history", {
        messages: [
          {
            id: "u1",
            role: "user",
            content: "What should I do tomorrow?",
            createdAt: new Date().toISOString(),
          },
          {
            id: "a1",
            role: "assistant",
            content: "Based on your recent load, I recommend an easy run tomorrow.",
            createdAt: new Date().toISOString(),
          },
        ],
      })
      await authedPage.goto("/coach")
      await authedPage.getByPlaceholder(/Ask your coach/).fill("What should I do tomorrow?")
      await authedPage.locator("textarea").locator("xpath=..").locator("button").click()
      // Text appears both as the live stream and in the re-fetched history — .first() avoids strict mode
      await expect(
        authedPage.getByText("Based on your recent load, I recommend an easy run tomorrow.").first()
      ).toBeVisible()
    })

    test("Enter key submits the message", async ({ authedPage }) => {
      let called = false
      await authedPage.route(`${API_BASE}/ai/chat`, (route) => {
        called = true
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"Hello"}\n\ndata: [DONE]\n\n',
        })
      })
      await mockGet(authedPage, "/ai/chat/history", { messages: [] })
      await authedPage.goto("/coach")
      await authedPage.getByPlaceholder(/Ask your coach/).fill("Test message")
      await authedPage.getByPlaceholder(/Ask your coach/).press("Enter")
      await authedPage.waitForTimeout(300)
      expect(called).toBe(true)
    })

    test("Shift+Enter creates newline without submitting", async ({ authedPage }) => {
      let called = false
      await authedPage.route(`${API_BASE}/ai/chat`, (route) => {
        called = true
        route.continue()
      })
      await authedPage.goto("/coach")
      const textarea = authedPage.getByPlaceholder(/Ask your coach/)
      await textarea.fill("Line one")
      await textarea.press("Shift+Enter")
      await authedPage.waitForTimeout(200)
      expect(called).toBe(false)
      // Textarea still has focus and content
      await expect(textarea).toBeFocused()
    })

    test("input clears after sending", async ({ authedPage }) => {
      await mockStream(authedPage, "/ai/chat", ["OK"])
      await mockGet(authedPage, "/ai/chat/history", { messages: [] })
      await authedPage.goto("/coach")
      const textarea = authedPage.getByPlaceholder(/Ask your coach/)
      await textarea.fill("Test message")
      await authedPage.locator("textarea").locator("xpath=..").locator("button").click()
      await expect(textarea).toHaveValue("")
    })

    test("send button disabled while streaming", async ({ authedPage }) => {
      await authedPage.route(`${API_BASE}/ai/chat`, async (route) => {
        await new Promise((r) => setTimeout(r, 500))
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"OK"}\n\ndata: [DONE]\n\n',
        })
      })
      await authedPage.goto("/coach")
      const textarea = authedPage.getByPlaceholder(/Ask your coach/)
      await textarea.fill("Question")
      const sendBtn = authedPage.locator("textarea").locator("xpath=..").locator("button")
      await sendBtn.click()
      await expect(sendBtn).toBeDisabled()
    })
  })

  test.describe("Clear history", () => {
    test("confirming clear removes all messages", async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: HISTORY_MESSAGES })
      await mockDelete(authedPage, "/ai/chat/history", { ok: true })
      // After delete, refetch returns empty
      let callCount = 0
      await authedPage.route(`${API_BASE}/ai/chat/history`, (route) => {
        if (route.request().method() === "GET") {
          callCount++
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ messages: callCount === 1 ? HISTORY_MESSAGES : [] }),
          })
        } else if (route.request().method() === "DELETE") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          })
        } else {
          route.continue()
        }
      })
      await authedPage.goto("/coach")
      await expect(authedPage.getByText("How was my training this week?")).toBeVisible()

      authedPage.on("dialog", (dialog) => dialog.accept())
      await authedPage.getByRole("button", { name: "Clear history" }).click()
      await expect(authedPage.getByText("Start a conversation")).toBeVisible()
    })

    test("cancelling clear dialog keeps messages", async ({ authedPage }) => {
      await mockGet(authedPage, "/ai/chat/history", { messages: HISTORY_MESSAGES })
      await authedPage.goto("/coach")

      authedPage.on("dialog", (dialog) => dialog.dismiss())
      await authedPage.getByRole("button", { name: "Clear history" }).click()
      await expect(authedPage.getByText("How was my training this week?")).toBeVisible()
    })
  })
})
