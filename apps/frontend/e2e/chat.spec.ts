import { API_BASE, expect, mockGet, mockStream, test } from "./fixtures"

const MOCK_SESSION = {
  id: "sess-0001-0000-0000-000000000001",
  title: "New chat",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

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

// Mock /ai/chat/sessions and /ai/chat/history?sessionId=... for every coach test.
// The history endpoint has a dynamic ?sessionId= query param — use a regex pattern.
async function setupChat(authedPage: import("@playwright/test").Page, messages: unknown[] = []) {
  await mockGet(authedPage, "/ai/chat/sessions", { sessions: [MOCK_SESSION] })
  await mockGet(authedPage, /\/ai\/chat\/history\?sessionId=/, { messages })
}

test.describe("AI Coach chat", () => {
  test.describe("Empty state", () => {
    test("shows empty state placeholder when no history", async ({ authedPage }) => {
      await setupChat(authedPage)
      await authedPage.goto("/coach")
      await expect(authedPage.getByText("Start a conversation")).toBeVisible()
      await expect(
        authedPage.getByText("Ask about your training, recovery, or goals")
      ).toBeVisible()
    })

    test("Clear button hidden when no messages", async ({ authedPage }) => {
      await setupChat(authedPage)
      await authedPage.goto("/coach")
      await expect(authedPage.getByRole("button", { name: "Clear" })).not.toBeVisible()
    })
  })

  test.describe("History loading", () => {
    test("renders existing chat messages on load", async ({ authedPage }) => {
      await setupChat(authedPage, HISTORY_MESSAGES)
      await authedPage.goto("/coach")
      await expect(authedPage.getByText("How was my training this week?")).toBeVisible()
      await expect(authedPage.getByText(/Your training load looks solid/)).toBeVisible()
    })

    test("renders markdown in assistant messages", async ({ authedPage }) => {
      await setupChat(authedPage, HISTORY_MESSAGES)
      await authedPage.goto("/coach")
      // Bold text from markdown should be rendered as <strong>
      await expect(authedPage.locator("strong").filter({ hasText: "3 sessions" })).toBeVisible()
    })

    test("shows Clear button when messages exist", async ({ authedPage }) => {
      await setupChat(authedPage, HISTORY_MESSAGES)
      await authedPage.goto("/coach")
      await expect(authedPage.getByRole("button", { name: "Clear" })).toBeVisible()
    })
  })

  test.describe("Sending messages", () => {
    test.beforeEach(async ({ authedPage }) => {
      await setupChat(authedPage)
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
      // After stream ends, history is re-fetched — return the full conversation
      await authedPage.unroute(/\/ai\/chat\/history\?sessionId=/)
      await mockGet(authedPage, /\/ai\/chat\/history\?sessionId=/, {
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
    test("clicking clear removes all messages", async ({ authedPage }) => {
      // First history call returns messages; after delete it returns empty
      await mockGet(authedPage, "/ai/chat/sessions", { sessions: [MOCK_SESSION] })

      let historyCallCount = 0
      await authedPage.route(/\/ai\/chat\/history\?sessionId=/, (route) => {
        historyCallCount++
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ messages: historyCallCount === 1 ? HISTORY_MESSAGES : [] }),
        })
      })

      // Mock the DELETE /ai/chat/sessions/:id/history
      await authedPage.route(/\/ai\/chat\/sessions\/.*\/history/, (route) => {
        if (route.request().method() === "DELETE") {
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

      await authedPage.getByRole("button", { name: "Clear" }).click()
      await expect(authedPage.getByText("Start a conversation")).toBeVisible()
    })
  })
})

// ---------------------------------------------------------------------------
// Retry on failure
// ---------------------------------------------------------------------------

test.describe("AI Coach — retry on failure", () => {
  test("keeps user message visible and shows retry button when stream fails", async ({
    authedPage,
  }) => {
    await setupChat(authedPage)

    await authedPage.route(`${API_BASE}/ai/chat`, (route) => {
      route.fulfill({ status: 500, body: "Internal Server Error" })
    })

    await authedPage.goto("/coach")
    await authedPage.getByPlaceholder(/Ask your coach/).fill("Will I overtrain?")
    await authedPage.locator("textarea").locator("xpath=..").locator("button").click()

    await expect(authedPage.getByText("Will I overtrain?")).toBeVisible()
    await expect(authedPage.getByRole("button", { name: /Retry/i })).toBeVisible()
    await expect(authedPage.getByText("Failed to send")).toBeVisible()
  })

  test("retry button resends the original message", async ({ authedPage }) => {
    await setupChat(authedPage)

    let chatCallCount = 0
    await authedPage.route(`${API_BASE}/ai/chat`, (route) => {
      chatCallCount++
      if (chatCallCount === 1) {
        route.fulfill({ status: 500, body: "error" })
      } else {
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"You are recovered!"}\n\ndata: [DONE]\n\n',
        })
      }
    })

    await authedPage.goto("/coach")
    await authedPage.getByPlaceholder(/Ask your coach/).fill("Am I recovered?")
    await authedPage.locator("textarea").locator("xpath=..").locator("button").click()

    await expect(authedPage.getByRole("button", { name: /Retry/i })).toBeVisible()
    await authedPage.getByRole("button", { name: /Retry/i }).click()

    await expect(authedPage.getByText("You are recovered!")).toBeVisible()
    expect(chatCallCount).toBe(2)
  })

  test("retry button disappears after successful retry", async ({ authedPage }) => {
    await setupChat(authedPage)

    let chatCallCount = 0
    await authedPage.route(`${API_BASE}/ai/chat`, (route) => {
      chatCallCount++
      if (chatCallCount === 1) {
        route.fulfill({ status: 500, body: "error" })
      } else {
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: 'data: {"text":"All good!"}\n\ndata: [DONE]\n\n',
        })
      }
    })

    await authedPage.goto("/coach")
    await authedPage.getByPlaceholder(/Ask your coach/).fill("Check form")
    await authedPage.locator("textarea").locator("xpath=..").locator("button").click()

    await expect(authedPage.getByRole("button", { name: /Retry/i })).toBeVisible()
    await authedPage.getByRole("button", { name: /Retry/i }).click()

    await expect(authedPage.getByText("Failed to send")).not.toBeVisible()
    await expect(authedPage.getByRole("button", { name: /Retry/i })).not.toBeVisible()
  })
})
