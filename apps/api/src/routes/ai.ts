import { and, asc, desc, eq, gte, lte } from "drizzle-orm"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { PostHog } from "posthog-node"
import { z } from "zod"
import { db } from "../db/index.js"
import { activities, chatHistory, weeklyReports } from "../db/schema.js"
import { env } from "../env.js"
import { authMiddleware } from "../middleware/auth.js"
import { computeInsightHash, generateActivityInsight } from "../services/activity-insight.js"
import {
  SYSTEM_PROMPT,
  buildChatContext,
  buildRecommendationContext,
} from "../services/ai-context.js"
import { requireAnthropicClient } from "../services/anthropic-client.js"
import { calculateTrainingLoad } from "../services/atl-ctl.js"

let posthog: PostHog | null = null

if (env.POSTHOG_API_KEY) {
  posthog = new PostHog(env.POSTHOG_API_KEY, {
    host: env.POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
}

const aiRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.addHook("preHandler", authMiddleware)

  fastify.post(
    "/ai/recommendation",
    { schema: { body: z.object({}).optional() } },
    async (request, reply) => {
      const userId = request.user.sub
      const anthropic = await requireAnthropicClient(userId)
      const context = await buildRecommendationContext(userId, db)

      const origin = request.headers.origin ?? env.FRONTEND_URL
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      })

      let fullResponse = ""
      let inputTokens = 0
      let outputTokens = 0

      try {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `${context}\n\nBased on my current training load and recent activities, what should I do today? Should I train or rest? If train, what type of workout?`,
            },
          ],
        })

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text
            fullResponse += text
            reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`)
          }
          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens
          }
          if (event.type === "message_start" && event.message.usage) {
            inputTokens = event.message.usage.input_tokens
          }
        }

        reply.raw.write("data: [DONE]\n\n")
      } finally {
        reply.raw.end()
      }

      // Save to chat history (fire-and-forget)
      db.insert(chatHistory)
        .values([
          { userId, role: "user", content: "Give me today's recommendation" },
          {
            userId,
            role: "assistant",
            content: fullResponse,
            tokensUsed: inputTokens + outputTokens,
          },
        ])
        .catch((err) => fastify.log.error(err, "Failed to save recommendation to chat history"))

      posthog?.capture({
        distinctId: userId,
        event: "ai_recommendation",
        properties: {
          inputTokens,
          outputTokens,
          model: "claude-sonnet-4-6",
        },
      })
    }
  )

  fastify.post(
    "/ai/chat",
    {
      schema: {
        body: z.object({ message: z.string().min(1).max(4000) }),
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { message } = request.body
      const anthropic = await requireAnthropicClient(userId)

      // Get last 10 messages
      const history = await db
        .select()
        .from(chatHistory)
        .where(eq(chatHistory.userId, userId))
        .orderBy(desc(chatHistory.createdAt))
        .limit(10)

      const reversedHistory = [...history].reverse()

      const messages = await buildChatContext(
        userId,
        reversedHistory.map((m) => ({ role: m.role, content: m.content })),
        db
      )

      // Append the new user message
      messages.push({ role: "user", content: message })

      const origin = request.headers.origin ?? env.FRONTEND_URL
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
      })

      let fullResponse = ""
      let inputTokens = 0
      let outputTokens = 0

      try {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages,
        })

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const text = event.delta.text
            fullResponse += text
            reply.raw.write(`data: ${JSON.stringify({ text })}\n\n`)
          }
          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens
          }
          if (event.type === "message_start" && event.message.usage) {
            inputTokens = event.message.usage.input_tokens
          }
        }

        reply.raw.write("data: [DONE]\n\n")
      } finally {
        reply.raw.end()
      }

      // Save both turns
      db.insert(chatHistory)
        .values([
          { userId, role: "user", content: message },
          {
            userId,
            role: "assistant",
            content: fullResponse,
            tokensUsed: inputTokens + outputTokens,
          },
        ])
        .catch((err) => fastify.log.error(err, "Failed to save chat to history"))

      posthog?.capture({
        distinctId: userId,
        event: "ai_chat",
        properties: { inputTokens, outputTokens, model: "claude-sonnet-4-6" },
      })
    }
  )

  fastify.get("/ai/chat/history", { schema: { response: {} } }, async (request) => {
    const messages = await db
      .select()
      .from(chatHistory)
      .where(eq(chatHistory.userId, request.user.sub))
      .orderBy(asc(chatHistory.createdAt))
      .limit(50)

    return { messages }
  })

  fastify.delete(
    "/ai/chat/history",
    { schema: { response: { 200: z.object({ ok: z.boolean() }) } } },
    async (request) => {
      await db.delete(chatHistory).where(eq(chatHistory.userId, request.user.sub))
      return { ok: true }
    }
  )

  fastify.post(
    "/ai/activity-insight",
    {
      schema: {
        body: z.object({ activityId: z.string().uuid() }),
        response: { 200: z.object({ insight: z.string() }) },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub
      const { activityId } = request.body
      const anthropic = await requireAnthropicClient(userId)

      const [activity] = await db
        .select()
        .from(activities)
        .where(and(eq(activities.id, activityId), eq(activities.userId, userId)))
        .limit(1)

      if (!activity) return reply.code(404).send({ error: "Activity not found" } as never)

      const newHash = computeInsightHash(activity)
      const insight = await generateActivityInsight(anthropic, activity)

      await db
        .update(activities)
        .set({ aiInsight: insight, rawDataHash: newHash })
        .where(eq(activities.id, activityId))

      return { insight }
    }
  )

  fastify.post("/ai/weekly-report", { schema: {} }, async (request, _reply) => {
    const userId = request.user.sub
    const anthropic = await requireAnthropicClient(userId)

    // Get current week start (Monday)
    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysToMonday)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const weekActivities = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          gte(activities.startDate, weekStart),
          lte(activities.startDate, weekEnd)
        )
      )
      .orderBy(asc(activities.startDate))

    // Calculate metrics
    const totalDistance = weekActivities.reduce((s, a) => s + (a.distanceMeters ?? 0), 0)
    const totalDuration = weekActivities.reduce((s, a) => s + (a.durationSeconds ?? 0), 0)
    const hrValues = weekActivities.map((a) => a.averageHeartRate).filter(Boolean) as number[]
    const avgHR =
      hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null

    // Get training load
    const allActivities = await db.select().from(activities).where(eq(activities.userId, userId))
    const load = calculateTrainingLoad(allActivities)

    const metrics = {
      totalDistance,
      totalDuration,
      avgHR,
      sessions: weekActivities.length,
      atl: load.atl,
      ctl: load.ctl,
    }

    const activitySummary = weekActivities
      .map(
        (a) =>
          `- ${a.startDate.toISOString().slice(0, 10)}: ${a.sportType}${a.durationSeconds ? ` ${Math.round(a.durationSeconds / 60)}min` : ""}${a.distanceMeters ? ` ${(a.distanceMeters / 1000).toFixed(1)}km` : ""}`
      )
      .join("\n")

    const prompt = `Generate a weekly training summary for the week of ${weekStart.toISOString().slice(0, 10)}.

Activities this week:
${activitySummary || "No activities recorded."}

Metrics:
- Total distance: ${(totalDistance / 1000).toFixed(1)} km
- Total duration: ${Math.round(totalDuration / 60)} minutes
- Sessions: ${weekActivities.length}
- Avg HR: ${avgHR ?? "N/A"} bpm
- ATL (acute load): ${load.atl}
- CTL (chronic load): ${load.ctl}
- TSB (form): ${load.tsb}

Write a 3-4 paragraph coaching summary covering: what was accomplished, training load assessment, recovery recommendations, and focus for next week.`

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    })

    const summary =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : "Unable to generate summary."

    const weekStartStr = weekStart.toISOString().slice(0, 10)

    const [report] = await db
      .insert(weeklyReports)
      .values({ userId, weekStart: weekStartStr, summary, metrics })
      .onConflictDoUpdate({
        target: [weeklyReports.userId, weeklyReports.weekStart],
        set: { summary, metrics, generatedAt: new Date() },
      })
      .returning()

    return report
  })
}

export default aiRoutes
